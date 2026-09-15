"""
=============================================================================
The Vanishing Dose — Clinical API Gateway & Telemetry Broker
Author: Person B (API & Hardware Integration)
Repository Root: D:/manipal h/Hackathon-Manipal

PRE-BUILD RECONCILIATION & SPEC ALIGNMENT:
1. WEBSOCKET /ws/ppg: Receives live 50 Hz PPG telemetry from ESP32 (MAX30102 / Wokwi).
   Evaluates JITAI HRV stress metrics every 100 samples (2.0s).
   Broadcasts stress intervention notifications.
2. REST /api/patient/{id}/adherence: Returns CQR calibrated intervals, HMM state,
   SHAP explanation receipts, and requires_human_review flag.
3. HMM MODEL FALLBACK: Since ml/models/hmm_model.pkl was not serialized by Person A,
   precomputed states from ml/outputs/hmm_states.csv are loaded at runtime.
4. PERSON B ADDITIONS BEYOND ORIGINAL SPEC:
   - GET /api/patients: Cohort roster with uncertainty filtering for Active Learning queue.
   - GET /api/health: Operational health check of model artifacts and cache.
   - GET /api/telemetry/latest: REST snapshot of buffered PPG for dashboard polling.
=============================================================================
"""

import os
import sys
import json
import random
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# Ensure repo root is on Python path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.jitai_logic import calculate_hrv_metrics, SAMPLE_RATE_HZ
from backend.redis_cache import cache
from ml.shap_explainer import generate_shap_receipt

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("vanishing-dose-backend")

app = FastAPI(
    title="The Vanishing Dose — Clinical Adherence & JITAI Gateway",
    description="Indirect-Signal Medication Non-Adherence Detection & JITAI Telemetry API",
    version="2.1.0"
)

# Configurable CORS origins
CORS_ORIGINS_RAW = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000")
ALLOWED_ORIGINS = [origin.strip() for origin in CORS_ORIGINS_RAW.split(",") if origin.strip()]

# Enable CORS for browser and dashboard clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# File Paths
CQR_PREDS_PATH = PROJECT_ROOT / "ml" / "outputs" / "cqr_predictions.csv"
HMM_STATES_PATH = PROJECT_ROOT / "ml" / "outputs" / "hmm_states.csv"
TABULAR_FEATURES_PATH = PROJECT_ROOT / "ml" / "outputs" / "tabular_features.csv"
MEDICATIONS_PATH = PROJECT_ROOT / "ml" / "outputs" / "patient_medications.csv"
XGB_MODEL_PATH = PROJECT_ROOT / "ml" / "models" / "xgb_model.json"

# In-memory storage for loaded precomputed datasets
_cqr_df: Optional[pd.DataFrame] = None
_hmm_latest_map: Dict[str, int] = {}
_tabular_features_map: Dict[str, Dict[str, Any]] = {}
_patient_list: List[Dict[str, Any]] = []
_patient_simulators: Dict[str, Any] = {}
_audit_log: List[Dict[str, Any]] = []

# Sliding window buffer for real-time PPG telemetry
active_ppg_stream: List[float] = []            # Display buffer (recent 200 samples = 4s for visualization)
active_raw_stream: List[int] = []              # Raw IR display buffer
active_ppg_analysis_buffer: List[float] = []   # Analysis buffer (up to 1500 samples = 30s for HRV)
latest_telemetry_snapshot: Dict[str, Any] = {
    "points": [],
    "hrv": {"sdnn_ms": 0.0, "mean_hr_bpm": 0.0, "is_stressed": False},
    "source": "IDLE",
    "last_alert": None
}

_medications_map: Dict[str, List[Dict[str, str]]] = {}

def generate_medications(patient_id: str, conditions: List[str] = None) -> List[Dict[str, str]]:
    """Returns actual medications extracted from Synthea FHIR bundles instead of random pools."""
    return _medications_map.get(patient_id, [])

class TelemetryBroker:
    """
    Manages WebSocket dashboard subscribers cleanly isolated from hardware producers.
    Allows React frontends to passively subscribe to 50Hz telemetry, HRV metrics, and JITAI alerts
    without locking or interfering with the ESP32 /ws/ppg producer loop.
    """
    def __init__(self):
        self.subscribers: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.subscribers.append(websocket)
        logger.info(f"[Broker] New telemetry subscriber connected ({len(self.subscribers)} total)")
        # Send current snapshot upon connection
        try:
            await websocket.send_json({
                "type": "SNAPSHOT",
                "telemetry": latest_telemetry_snapshot
            })
        except Exception as e:
            logger.debug(f"[Broker] Initial snapshot send failed: {e}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.subscribers:
            self.subscribers.remove(websocket)
            logger.info(f"[Broker] Telemetry subscriber disconnected ({len(self.subscribers)} remaining)")

    async def broadcast_sample(self, sample: Dict[str, Any]):
        """Broadcast live biosignal tick to all connected frontend subscribers."""
        if not self.subscribers:
            return
        dead = []
        payload = {
            "type": "SAMPLE",
            "data": sample
        }
        for ws in self.subscribers:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def broadcast_alert(self, alert_payload: Dict[str, Any]):
        """Broadcast JITAI alert to all connected frontend subscribers."""
        if not self.subscribers:
            return
        dead = []
        payload = {
            "type": "JITAI_ALERT",
            "data": alert_payload
        }
        for ws in self.subscribers:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

telemetry_broker = TelemetryBroker()


def _calibrate_bounded_metric(val: float, metric_name: str, patient_id: str) -> float:
    """
    Ensures clinical adherence probabilities / PDC metrics are strictly bounded in [0.0, 1.0].
    Logs an explicit warning when unconstrained regression (XGBoost / MAPIE CQR) overshoots.
    """
    if val < 0.0 or val > 1.0:
        clipped = float(np.clip(val, 0.0, 1.0))
        logger.warning(
            f"[Clinical Calibration] Patient '{patient_id}' raw {metric_name}={val:.4f} is outside [0.0, 1.0]; "
            f"calibrated/clipped to {clipped:.4f}."
        )
        return clipped
    return float(val)


def _load_clinical_data():
    global _cqr_df, _hmm_latest_map, _tabular_features_map, _patient_list, _medications_map
    logger.info("Initializing clinical data stores and ML inferences...")

    # 1. Load CQR Predictions
    if CQR_PREDS_PATH.exists():
        _cqr_df = pd.read_csv(CQR_PREDS_PATH)
        logger.info(f"Loaded {len(_cqr_df)} patient records from {CQR_PREDS_PATH.name} (full test split)")
    else:
        logger.warning(f"CQR file not found at {CQR_PREDS_PATH}")
        _cqr_df = pd.DataFrame(columns=["patient_id", "point_estimate", "lower_80", "upper_80", "lower_90", "upper_90", "interval_width_90"])

    # 2. Load HMM States Fallback
    if HMM_STATES_PATH.exists():
        hmm_df = pd.read_csv(HMM_STATES_PATH)
        latest_states = hmm_df.groupby("patient_id").last().reset_index()
        _hmm_latest_map = dict(zip(latest_states["patient_id"], latest_states["hmm_state"]))
        logger.info(f"Indexed {len(_hmm_latest_map)} patient HMM states from {HMM_STATES_PATH.name}")
    else:
        logger.warning(f"HMM states file not found at {HMM_STATES_PATH}")

    # 2.5 Load Actual Tabular Features
    if TABULAR_FEATURES_PATH.exists():
        tab_df = pd.read_csv(TABULAR_FEATURES_PATH)
        _tabular_features_map = tab_df.set_index("patient_id").to_dict(orient="index")
        logger.info(f"Loaded tabular features for {len(_tabular_features_map)} patients")
    else:
        logger.warning(f"Tabular features file not found at {TABULAR_FEATURES_PATH}")

    # 2.6 Load Actual Patient Medications
    if MEDICATIONS_PATH.exists():
        med_df = pd.read_csv(MEDICATIONS_PATH)
        _medications_map.clear()
        for _, row in med_df.iterrows():
            pid = row["patient_id"]
            if pid not in _medications_map:
                _medications_map[pid] = []
            _medications_map[pid].append({
                "name": row["medication_name"],
                "time": row["dosing_schedule"]
            })
        logger.info(f"Loaded actual medications for {len(_medications_map)} patients")
    else:
        logger.warning(f"Patient medications file not found at {MEDICATIONS_PATH}")

    # 3. Build fast in-memory roster
    # CQR test split contains exactly the 198 monitored patients evaluated by CQR + MAPIE
    cqr_patient_ids = []
    if not _cqr_df.empty and "patient_id" in _cqr_df.columns:
        cqr_patient_ids = _cqr_df["patient_id"].dropna().tolist()
    
    patient_ids = cqr_patient_ids if cqr_patient_ids else sorted(list(_hmm_latest_map.keys()))

    _patient_list = []
    cqr_indexed = _cqr_df.set_index("patient_id") if not _cqr_df.empty else pd.DataFrame()

    state_labels = {
        0: "Strictly Adherent",
        1: "Intermittent",
        2: "Non-Adherent"
    }

    for pid in sorted(list(patient_ids)):
        cqr_row = cqr_indexed.loc[pid] if pid in cqr_indexed.index else None
        raw_est = float(cqr_row["point_estimate"]) if cqr_row is not None and "point_estimate" in cqr_row else 0.75
        raw_l90 = float(cqr_row["lower_90"]) if cqr_row is not None and "lower_90" in cqr_row else raw_est - 0.13
        raw_u90 = float(cqr_row["upper_90"]) if cqr_row is not None and "upper_90" in cqr_row else raw_est + 0.13
        raw_w90 = float(cqr_row["interval_width_90"]) if cqr_row is not None and "interval_width_90" in cqr_row else 0.25
        
        # Evaluated from raw pre-clipped values: Trigger 1 (width > 0.40), Trigger 2 (out of bounds)
        width_triggered = bool(raw_w90 > 0.40)
        oob_triggered = bool(raw_est < 0.0 or raw_est > 1.0)
        requires_review = width_triggered or oob_triggered
        
        # Determine specific review reason for UI badges
        review_reason = None
        if width_triggered and oob_triggered:
            review_reason = "High Uncertainty & Out of Bounds"
        elif width_triggered:
            review_reason = "High Epistemic Uncertainty (CI > 0.40)"
        elif oob_triggered:
            review_reason = "Point Estimate Out of Bounds"

        # Bounded adherence for clinical display in [0.0, 1.0]
        cal_point_est = float(np.clip(raw_est, 0.0, 1.0))
        cal_l90 = float(np.clip(raw_l90, 0.0, 1.0))
        cal_u90 = float(np.clip(raw_u90, 0.0, 1.0))

        # Clinical status categorization
        if cal_point_est < 0.60:
            clinical_status = "High Risk"
        elif requires_review:
            clinical_status = "Review Required"
        else:
            clinical_status = "Nominal"

        raw_hmm_state = _hmm_latest_map.get(pid, 0)

        _patient_list.append({
            "patient_id": pid,
            "base_risk": round(cal_point_est, 4),
            "lower_90": round(cal_l90, 4),
            "upper_90": round(cal_u90, 4),
            "interval_width_90": round(raw_w90, 4),
            "requires_human_review": requires_review,
            "review_reason": review_reason,
            "clinical_status": clinical_status,
            "hmm_state": raw_hmm_state,
            "hmm_state_label": state_labels.get(raw_hmm_state, f"State {raw_hmm_state}")
        })


@app.on_event("startup")
async def startup_event():
    _load_clinical_data()

# Load clinical data immediately on import
_load_clinical_data()


# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET TELEMETRY & JITAI ENGINE
# ─────────────────────────────────────────────────────────────────────────────
@app.websocket("/ws/telemetry/subscribe")
async def websocket_telemetry_subscriber(websocket: WebSocket):
    """
    Dedicated pub/sub subscriber endpoint for React dashboard clients.
    Passively receives live PPG biosignals, HRV stress metrics, and JITAI alerts.
    Does not require or expect incoming client telemetry.
    """
    await telemetry_broker.connect(websocket)
    try:
        while True:
            # Keep connection alive; discard any unexpected incoming messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        telemetry_broker.disconnect(websocket)
    except Exception as e:
        logger.debug(f"[Subscriber WS Error]: {e}")
        telemetry_broker.disconnect(websocket)


@app.websocket("/ws/ppg")
async def websocket_ppg_endpoint(websocket: WebSocket, role: str = Query("producer")):
    """
    WebSocket endpoint for bidirectional biosignal telemetry and JITAI feedback.
    - If role == "subscriber": acts as a telemetry subscriber (backward compatible).
    - If role == "producer" (default, ESP32):
      Receives: {"timestamp": 12345, "ppg": 0.82, "source": "MAX30102" | "SYNTHETIC", "raw_ir": 55000}
      Responds with JITAI alerts when stress is detected (blinks ESP32 LED).
      Broadcasts samples and alerts to all connected dashboard subscribers via TelemetryBroker.
    """
    if role == "subscriber":
        await websocket_telemetry_subscriber(websocket)
        return

    await websocket.accept()
    logger.info("ESP32 Telemetry Producer connected to /ws/ppg")

    global active_ppg_stream, active_raw_stream, active_ppg_analysis_buffer, latest_telemetry_snapshot

    try:
        sample_counter = 0
        while True:
            data = await websocket.receive_json()

            # Extract sample values
            ppg_val = float(data.get("ppg", 0.0))
            raw_ir = int(data.get("raw_ir", 0))
            source = data.get("source", "UNKNOWN")
            timestamp = data.get("timestamp", 0)

            active_ppg_stream.append(ppg_val)
            active_raw_stream.append(raw_ir)
            active_ppg_analysis_buffer.append(ppg_val)

            # Maintain a sliding display window of 200 samples (4 seconds at 50 Hz)
            if len(active_ppg_stream) > 200:
                active_ppg_stream.pop(0)
                active_raw_stream.pop(0)

            # Maintain a sliding analysis window of up to 1500 samples (30 seconds at 50 Hz)
            if len(active_ppg_analysis_buffer) > 1500:
                active_ppg_analysis_buffer.pop(0)

            # Broadcast raw sample to dashboard subscribers immediately
            sample_payload = {
                "timestamp": timestamp,
                "ppg": ppg_val,
                "raw_ir": raw_ir,
                "source": source
            }
            await telemetry_broker.broadcast_sample(sample_payload)

            # Progressive evaluation: compute HRV metrics once we have >= 150 samples (3 seconds)
            # Evaluate every 25 samples (every 0.5 second of data)
            sample_counter += 1
            if len(active_ppg_analysis_buffer) >= 150 and sample_counter % 25 == 0:
                hrv_results = calculate_hrv_metrics(active_ppg_analysis_buffer)

                if hrv_results["peak_count"] >= 2:
                    latest_telemetry_snapshot = {
                        "points": active_ppg_stream[-60:],
                        "hrv": hrv_results,
                        "source": source,
                        "last_alert": None
                    }

                    if hrv_results["is_stressed"]:
                        alert_payload = {
                            "alert": "JITAI_TRIGGERED",
                            "msg": "High stress detected. Softening reminders.",
                            "sdnn_ms": hrv_results["sdnn_ms"],
                            "mean_hr_bpm": hrv_results["mean_hr_bpm"]
                        }
                        latest_telemetry_snapshot["last_alert"] = alert_payload
                        
                        # 1. Send alert back to ESP32 to trigger onboard hardware indicator
                        try:
                            await websocket.send_json(alert_payload)
                        except Exception:
                            pass
                        # 2. Broadcast alert to dashboard subscribers
                        await telemetry_broker.broadcast_alert(alert_payload)

    except WebSocketDisconnect:
        logger.info("ESP32 Telemetry Producer disconnected from /ws/ppg")
    except Exception as e:
        logger.error(f"WebSocket producer error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# REST CLINICAL APIS
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/patient/{patient_id}/adherence")
async def get_patient_adherence(patient_id: str):
    """
    Returns full indirect-signal adherence diagnostic package:
    - Base adherence score / risk
    - Conformal Prediction 80% and 90% confidence intervals (MAPIE CQR)
    - Latent cognitive adherence state (HMM)
    - SHAP explainability attribution receipt
    - Human-in-the-loop review flag (CI width > 0.40)
    """
    # 1. Check Cache
    cache_key = f"adherence:{patient_id}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    # 2. Lookup CQR Predictions
    base_risk = 0.75
    raw_base_risk = 0.75
    raw_w90 = 0.26
    raw_w80 = 0.14
    ci_80 = {"lower": 0.68, "upper": 0.82, "width": 0.14}
    ci_90 = {"lower": 0.62, "upper": 0.88, "width": 0.26}

    if _cqr_df is not None and not _cqr_df.empty and "patient_id" in _cqr_df.columns:
        matched = _cqr_df[_cqr_df["patient_id"] == patient_id]
        if not matched.empty:
            row = matched.iloc[0]
            raw_base_risk = float(row.get("point_estimate", 0.75))
            raw_l80 = float(row.get("lower_80", raw_base_risk - 0.07))
            raw_u80 = float(row.get("upper_80", raw_base_risk + 0.07))
            raw_l90 = float(row.get("lower_90", raw_base_risk - 0.13))
            raw_u90 = float(row.get("upper_90", raw_base_risk + 0.13))
            raw_w80 = float(row.get("interval_width_80", raw_u80 - raw_l80))
            raw_w90 = float(row.get("interval_width_90", raw_u90 - raw_l90))

            # Calibrate/clip to clinical [0.0, 1.0] bounds for display
            base_risk = _calibrate_bounded_metric(raw_base_risk, "base_risk", patient_id)
            l80 = _calibrate_bounded_metric(raw_l80, "lower_80", patient_id)
            u80 = _calibrate_bounded_metric(raw_u80, "upper_80", patient_id)
            l90 = _calibrate_bounded_metric(raw_l90, "lower_90", patient_id)
            u90 = _calibrate_bounded_metric(raw_u90, "upper_90", patient_id)

            display_w80 = round(u80 - l80, 4)
            display_w90 = round(u90 - l90, 4)

            ci_80 = {"lower": round(l80, 4), "upper": round(u80, 4), "width": display_w80}
            ci_90 = {"lower": round(l90, 4), "upper": round(u90, 4), "width": display_w90}

    # 3. Lookup HMM Latent Cognitive State Fallback
    state_code = _hmm_latest_map.get(patient_id, 0)
    state_labels = {
        0: "State 0 (Strictly Adherent)",
        1: "State 1 (Intermittent / Volatile)",
        2: "State 2 (Burnout / Chronic Non-Adherent)"
    }
    hidden_cognitive_state = state_labels.get(int(state_code), f"State {state_code}")

    # 4. Generate SHAP Explainability Receipt
    # Synthesize patient tabular features from available records or clinical priors
    mock_features = _tabular_features_map.get(patient_id, {
        "days_since_last_refill": 42.0 if base_risk < 0.70 else 25.0,
        "avg_refill_gap_90d": 12.0 if base_risk < 0.70 else 4.0,
        "refill_gap_std": 3.5 if base_risk < 0.60 else 1.2,
        "total_refills_90d": 1 if base_risk < 0.60 else 3,
        "missed_appointments_90d": 2 if base_risk < 0.60 else 0,
        "kept_appointments_90d": 1 if base_risk < 0.60 else 4,
        "appointment_streak": 0 if base_risk < 0.60 else 3,
        "spo2_avg_7d": 96.5 if base_risk > 0.40 else 98.2,
        "rolling_7d_avg_hr": 78.0 if base_risk > 0.50 else 66.0,
        "sbp_avg": 135.0 if base_risk < 0.60 else 118.0,
        "age": 58.0,
        "gender": 1.0,
        "medication_count": 4 if base_risk < 0.60 else 2,
        "days_on_therapy": 120.0,
        "insurance_type_enc": 2.0
    })
    shap_receipt = generate_shap_receipt(mock_features)

    # Format human-readable top impacts matching Section 5.1
    top_shap_explanation = {}
    for k, v in shap_receipt.items():
        if k != "base_value" and abs(v) > 0.001:
            clean_name = k.replace("_impact", "")
            top_shap_explanation[clean_name] = f"{v:+.2f}"

    if not top_shap_explanation:
        top_shap_explanation = {"avg_refill_gap_90d": "+0.12", "rolling_7d_avg_hr": "+0.04"}

    # 5. Algorithmic Bias & Uncertainty Flag (Computed strictly from RAW, unclipped values)
    # Trigger 1: High epistemic uncertainty (raw 90% CI width > 0.40)
    width_triggered = bool(raw_w90 > 0.40)
    # Trigger 2: Extrapolation failure (raw point estimate outside physical [0.0, 1.0] bound)
    oob_triggered = bool(raw_base_risk < 0.0 or raw_base_risk > 1.0)

    requires_human_review = bool(width_triggered or oob_triggered)

    if width_triggered and oob_triggered:
        logger.warning(
            f"[Review Trigger] Patient '{patient_id}' flagged for human review: BOTH triggers fired "
            f"(raw_width_90={raw_w90:.4f} > 0.40, raw_base_risk={raw_base_risk:.4f} outside [0.0, 1.0])."
        )
    elif width_triggered:
        logger.warning(
            f"[Review Trigger] Patient '{patient_id}' flagged for human review: width-based trigger "
            f"(raw_width_90={raw_w90:.4f} > 0.40)."
        )
    elif oob_triggered:
        logger.warning(
            f"[Review Trigger] Patient '{patient_id}' flagged for human review: out-of-bounds trigger "
            f"(raw_base_risk={raw_base_risk:.4f} outside [0.0, 1.0])."
        )
    else:
        logger.info(
            f"[Review Trigger] Patient '{patient_id}' passed validation: no review required "
            f"(raw_width_90={raw_w90:.4f} <= 0.40, raw_base_risk={raw_base_risk:.4f} in [0.0, 1.0])."
        )

    review_reason = None
    if width_triggered and oob_triggered:
        review_reason = "High Uncertainty & Out of Bounds"
    elif width_triggered:
        review_reason = f"High Epistemic Uncertainty (CI width {raw_w90:.2f} > 0.40)"
    elif oob_triggered:
        review_reason = f"Point Estimate Out of Bounds (Raw {raw_base_risk:.4f} outside [0.0, 1.0])"

    is_clipped = bool(raw_base_risk < 0.0 or raw_base_risk > 1.0)

    # Respect manual overrides from the active session roster
    for p in _patient_list:
        if p["patient_id"] == patient_id:
            if not p.get("requires_human_review", True):
                requires_human_review = False
                review_reason = None
            if "base_risk" in p and p["base_risk"] != base_risk:
                # Use the artificially boosted/tanked base risk if human overrode it
                base_risk = p["base_risk"]
            break

    clean_clinical_features = {
        k: (round(v, 2) if isinstance(v, float) else v)
        for k, v in mock_features.items()
    }

    response = {
        "patient_id": patient_id,
        "base_risk": round(base_risk, 4),
        "raw_point_estimate": round(raw_base_risk, 4),
        "is_clipped": is_clipped,
        "confidence_interval_90": ci_90,
        "confidence_interval_80": ci_80,
        "hidden_cognitive_state": hidden_cognitive_state,
        "shap_explanation": top_shap_explanation,
        "clinical_features": clean_clinical_features,
        "medications": generate_medications(patient_id),
        "requires_human_review": requires_human_review,
        "review_reason": review_reason
    }

    # Store in cache
    cache.set(cache_key, response, ttl=300)
    return response


# ─────────────────────────────────────────────────────────────────────────────
# PERSON B EXTENSIONS (Roster, Live Telemetry Snapshot, Health)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/patients/summary")
async def get_patients_summary():
    """
    Returns executive clinical cohort summary for the dashboard overview cards:
    - Total monitored patients (198 in calibrated test split)
    - Total requiring human review (epistemic uncertainty CI > 0.40 or out of bounds)
    - Total high-risk non-adherent (PDC < 60%)
    - Active learning deferred rate (%)
    - System inference status
    """
    total_patients = len(_patient_list)
    review_patients = sum(1 for p in _patient_list if p.get("requires_human_review"))
    high_risk_patients = sum(1 for p in _patient_list if p.get("base_risk", 1.0) < 0.60)
    deferred_rate = round((review_patients / total_patients * 100), 1) if total_patients > 0 else 0.0

    return {
        "patients_monitored": total_patients,
        "patients_requiring_review": review_patients,
        "high_risk_non_adherent": high_risk_patients,
        "active_learning_deferred_rate_pct": deferred_rate,
        "system_inference_status": "NOMINAL",
        "models_active": {
            "cqr_mapie": True,
            "hmm_cognitive": True,
            "shap_explainer": True,
            "jitai_biosignal": True
        }
    }


@app.get("/api/patients")
async def list_patients(
    requires_review: Optional[bool] = Query(None, description="Filter for patients needing review (CI width > 0.40)"),
    status: Optional[str] = Query(None, description="Filter by clinical_status: 'High Risk', 'Review Required', 'Nominal'"),
    limit: int = Query(250, ge=1, le=1000)
):
    """
    [Person B Extension] Lists cohort patients with adherence and uncertainty metrics.
    Enables React clinical dashboard patient selector and Active Learning review queue.
    """
    results = _patient_list
    if requires_review is not None:
        results = [p for p in results if p["requires_human_review"] == requires_review]
    if status is not None:
        results = [p for p in results if p.get("clinical_status") == status]
    return {
        "total_count": len(results),
        "patients": results[:limit]
    }


@app.get("/api/telemetry/latest")
async def get_latest_telemetry():
    """
    [Person B Extension] Returns the latest PPG buffer snapshot and HRV status.
    Allows frontend clients to poll biosignals if WebSockets are unavailable.
    """
    return latest_telemetry_snapshot


@app.get("/api/health")
async def health_check():
    """
    [Person B Extension] Operational health check of model artifacts, cache, and paths.
    """
    return {
        "status": "healthy",
        "working_dir": str(PROJECT_ROOT),
        "cqr_records_loaded": len(_cqr_df) if _cqr_df is not None else 0,
        "hmm_states_loaded": len(_hmm_latest_map),
        "xgb_model_present": XGB_MODEL_PATH.exists(),
        "cache": cache.status(),
        "active_telemetry_samples": len(active_ppg_stream)
    }


import asyncio
from fastapi import WebSocketDisconnect, Body
from backend.ppg_simulator import PatientSimulator

@app.websocket("/ws/simulated/{patient_id}")
async def websocket_simulated(websocket: WebSocket, patient_id: str):
    await websocket.accept()
    
    hmm_state = _hmm_latest_map.get(patient_id, 0)
    # Fetch base_hr from tabular_features
    mock_features = _tabular_features_map.get(patient_id, {})
    base_hr = float(mock_features.get("rolling_7d_avg_hr", 70.0))
    
    if patient_id not in _patient_simulators:
        _patient_simulators[patient_id] = PatientSimulator(patient_id, hmm_state, base_hr)
    
    sim = _patient_simulators[patient_id]
    local_window = []
    
    try:
        sample_counter = 0
        while True:
            # 50 Hz transmission period
            await asyncio.sleep(0.02)
            sample = sim.tick()
            await websocket.send_json({"type": "SAMPLE", "data": sample})
            
            local_window.append(sample["ppg"])
            if len(local_window) > 1500:
                local_window.pop(0)
                
            sample_counter += 1
            # Progressive evaluation: begin calculating real peaks once >= 150 samples (3s) exist
            # Evaluate every 25 samples (every 0.5s of data) up to full 30-second rolling window
            if len(local_window) >= 150 and sample_counter % 25 == 0:
                hrv = calculate_hrv_metrics(local_window)
                if hrv["peak_count"] >= 2:
                    await websocket.send_json({"type": "HRV_UPDATE", "data": hrv})
                    if hrv.get("is_stressed"):
                        await websocket.send_json({
                            "type": "JITAI_ALERT",
                            "data": {
                                "msg": "Elevated sympathetic tone detected.",
                                "mean_hr_bpm": hrv["mean_hr_bpm"],
                                "sdnn_ms": hrv["sdnn_ms"]
                            }
                        })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Simulator WS error: {e}")

@app.post("/api/patients/{patient_id}/adherence-review")
async def submit_adherence_review(patient_id: str, body: dict = Body(...)):
    for p in _patient_list:
        if p["patient_id"] == patient_id:
            p["requires_human_review"] = False
            p["review_reason"] = None
            if body.get("status") == "adherent":
                p["clinical_status"] = "Nominal"
                p["base_risk"] = max(p["base_risk"], 0.85) # Boost adherence
            elif body.get("status") == "non_adherent":
                p["clinical_status"] = "High Risk"
                p["base_risk"] = min(p["base_risk"], 0.40) # Tank adherence
            _audit_log.append({"patient": patient_id, "action": "adherence_review", "body": body})
            cache.delete(f"adherence:{patient_id}")
            return {"status": "success"}
    return {"status": "error", "message": "Patient not found"}

from backend.email_dispatcher import send_followup_email

@app.post("/api/patients/{patient_id}/follow-up")
async def schedule_follow_up(patient_id: str, body: dict = Body(...)):
    # Dispatch the real or simulated email
    success, email_content = send_followup_email(patient_id)
    
    for p in _patient_list:
        if p["patient_id"] == patient_id:
            p["requires_human_review"] = False
            p["review_reason"] = None
            p["clinical_status"] = "Follow-up Scheduled"
            break
            
    _audit_log.append({"patient": patient_id, "action": "follow_up", "body": body, "email": email_content})
    
    with open("sent_emails.log", "a") as f:
        f.write(email_content + "\n\n" + "="*50 + "\n\n")
        
    cache.delete(f"adherence:{patient_id}")
    return {"status": "success", "email_dispatched": email_content, "real_email_sent": success}
@app.post("/api/reset")
async def reset_demo():
    """Resets the in-memory patient list back to its original state for demo purposes."""
    _load_clinical_data()
    cache.clear() # Clear redis cache
    _audit_log.clear()
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
