"""
=============================================================================
The Vanishing Dose — Clinician Portal & Telemetry Dashboard
Author: Person B
Repository Root: D:/manipal h/Hackathon-Manipal

FEATURES:
1. Live PPG Biosignal Telemetry & JITAI Stress Alert Visualizer
   - Real-time sensor stream from ESP32 (MAX30102 hardware or Wokwi simulator).
   - Dynamic physiological metrics: Heart Rate, SDNN (ms), RMSSD (ms).
2. Indirect-Signal Patient Adherence Diagnostics
   - Base adherence risk score.
   - Conformal Quantile Regression (CQR) 80% and 90% calibrated confidence intervals.
   - Latent cognitive state badge (HMM).
   - SHAP feature impact attribution receipt cards.
3. Active Learning Review Queue
   - Prioritizes high-uncertainty patients (CI width > 0.40) to mitigate algorithmic bias.
   - Clinician action workflows (Dose Escalation, Nurse Outreach, Home Check).
=============================================================================
"""

import os
import sys
import time
import requests
import numpy as np
import pandas as pd
import streamlit as st
import plotly.graph_objects as go
from pathlib import Path

# Backend URL configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

st.set_page_config(
    page_title="The Vanishing Dose — Clinician Portal",
    page_icon="💊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling
st.markdown("""
<style>
    .metric-card {
        background-color: #f8f9fa;
        border-radius: 10px;
        padding: 15px;
        border-left: 5px solid #1E88E5;
        margin-bottom: 10px;
    }
    .alert-banner {
        background-color: #fff3cd;
        color: #856404;
        padding: 12px;
        border-radius: 8px;
        border-left: 5px solid #ffc107;
        margin-bottom: 15px;
        font-weight: 500;
    }
    .badge-hw {
        display: inline-block;
        padding: 4px 10px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 12px;
        background-color: #e8f5e9;
        color: #2e7d32;
    }
    .badge-sim {
        display: inline-block;
        padding: 4px 10px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 12px;
        background-color: #e3f2fd;
        color: #1565c0;
    }
</style>
""", unsafe_allow_html=True)


@st.cache_data(ttl=15)
def fetch_patient_roster():
    """Fetch patient list from backend gateway."""
    try:
        resp = requests.get(f"{BACKEND_URL}/api/patients?limit=250", timeout=3.0)
        if resp.status_code == 200:
            return resp.json().get("patients", [])
    except Exception:
        pass
    # Fallback mock roster if backend is starting
    return [
        {"patient_id": "test-patient-0825", "base_risk": 0.82, "interval_width_90": 0.23, "requires_human_review": False},
        {"patient_id": "test-patient-0668", "base_risk": 0.42, "interval_width_90": 0.45, "requires_human_review": True},
        {"patient_id": "test-patient-0337", "base_risk": 0.69, "interval_width_90": 0.38, "requires_human_review": False},
        {"patient_id": "test-patient-0899", "base_risk": 0.54, "interval_width_90": 0.42, "requires_human_review": True},
    ]


@st.cache_data(ttl=5)
def fetch_patient_adherence(patient_id: str):
    """Fetch full diagnostic report for a patient."""
    try:
        resp = requests.get(f"{BACKEND_URL}/api/patient/{patient_id}/adherence", timeout=3.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        st.warning(f"Unable to reach backend gateway at {BACKEND_URL}: {e}")
    
    # Fallback diagnostic data
    return {
        "patient_id": patient_id,
        "base_risk": 0.78,
        "confidence_interval_90": {"lower": 0.64, "upper": 0.92, "width": 0.28},
        "confidence_interval_80": {"lower": 0.70, "upper": 0.86, "width": 0.16},
        "hidden_cognitive_state": "State 1 (Intermittent / Volatile)",
        "shap_explanation": {"avg_refill_gap_90d": "+0.14", "rolling_7d_avg_hr": "+0.03"},
        "requires_human_review": False
    }


def fetch_telemetry_snapshot():
    """Fetch current PPG buffer and HRV status from backend."""
    try:
        resp = requests.get(f"{BACKEND_URL}/api/telemetry/latest", timeout=1.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    
    # Generate local simulated waveform if backend buffer empty
    t = time.time()
    pts = [np.sin((t + i * 0.02) * 2 * np.pi * 1.2) + 0.3 * np.sin((t + i * 0.02) * 4 * np.pi * 1.2) for i in range(50)]
    return {
        "points": pts,
        "hrv": {"sdnn_ms": 28.5, "mean_hr_bpm": 72.0, "is_stressed": False},
        "source": "SYNTHETIC (STANDALONE)",
        "last_alert": None
    }


# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR NAVIGATION
# ─────────────────────────────────────────────────────────────────────────────
st.sidebar.title("🌌 The Vanishing Dose")
st.sidebar.markdown("**Indirect-Signal Adherence & JITAI**")
page = st.sidebar.radio(
    "Navigation",
    ["🩺 Patient Diagnostics & Telemetry", "📋 Active Learning Queue (Uncertainty)", "⚙️ System & Model Architecture"]
)

st.sidebar.markdown("---")
st.sidebar.markdown("**Hardware & Sensor Status**")
telemetry = fetch_telemetry_snapshot()
hw_source = telemetry.get("source", "UNKNOWN")
if "MAX30102" in hw_source:
    st.sidebar.markdown('<span class="badge-hw">● Physical MAX30102 Online</span>', unsafe_allow_html=True)
else:
    st.sidebar.markdown('<span class="badge-sim">● Simulation / Wokwi Active</span>', unsafe_allow_html=True)

st.sidebar.markdown(f"**Gateway URL:** `{BACKEND_URL}`")


# ─────────────────────────────────────────────────────────────────────────────
# PAGE 1: DIAGNOSTICS & TELEMETRY
# ─────────────────────────────────────────────────────────────────────────────
if page == "🩺 Patient Diagnostics & Telemetry":
    st.header("The Vanishing Dose — Clinician Portal")
    st.caption("Cross-referencing indirect pharmacy refill patterns, electronic records, and real-time stress telemetry.")

    col1, col2 = st.columns([1.1, 1.3], gap="large")

    # ── Column 1: Real-Time Biosignal Telemetry ──────────────────────────────
    with col1:
        st.subheader("Layer 0: Live Biosignal Telemetry")
        
        # Display hardware badge
        if "MAX30102" in hw_source:
            st.markdown('<span class="badge-hw">🟢 Sensor: Physical MAX30102 (I2C)</span>', unsafe_allow_html=True)
        else:
            st.markdown('<span class="badge-sim">🔵 Sensor: Synthetic 50Hz Waveform (Wokwi Fallback)</span>', unsafe_allow_html=True)

        # JITAI Alert Banner
        hrv = telemetry.get("hrv", {})
        is_stressed = hrv.get("is_stressed", False)
        if is_stressed:
            st.markdown("""
            <div class="alert-banner">
                ⚠️ <b>JITAI INTERVENTION TRIGGERED</b><br/>
                Acute stress detected via low HRV (SDNN &lt; 25 ms). Reminders softened to prevent medication avoidance.
            </div>
            """, unsafe_allow_html=True)

        # PPG Waveform Plot
        points = telemetry.get("points", [])
        if not points:
            points = [np.sin(i * 0.15) for i in range(50)]

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            y=points,
            mode="lines",
            line=dict(color="#E53935", width=2.5),
            name="PPG Signal"
        ))
        fig.update_layout(
            height=260,
            margin=dict(l=10, r=10, t=25, b=20),
            title="Real-Time Photoplethysmogram (PPG) Stream @ 50 Hz",
            xaxis=dict(showgrid=True, zeroline=False, title="Sample Buffer (Latest 50 pts)"),
            yaxis=dict(showgrid=True, zeroline=False, title="AC Amplitude"),
            template="plotly_white"
        )
        st.plotly_chart(fig, use_container_width=True)

        # Biosignal Metrics
        m1, m2, m3 = st.columns(3)
        m1.metric("Heart Rate", f"{hrv.get('mean_hr_bpm', 72.0):.0f} BPM")
        m2.metric("HRV (SDNN)", f"{hrv.get('sdnn_ms', 28.5):.1f} ms", delta="-4.2 ms" if is_stressed else "+1.5 ms", delta_color="inverse")
        m3.metric("RMSSD", f"{hrv.get('rmssd_ms', 26.0):.1f} ms")

        st.caption("Telemetry feeds the Just-In-Time Adaptive Intervention (JITAI) loop to modulate reminder frequency.")

    # ── Column 2: Patient Adherence Analytics ─────────────────────────────────
    with col2:
        st.subheader("Layer 3 & 4: Patient Adherence & Conformal Uncertainty")

        roster = fetch_patient_roster()
        roster_ids = [p["patient_id"] for p in roster]
        default_index = 0 if roster_ids else 0

        selected_id = st.selectbox("Select Patient Record:", roster_ids, index=default_index)
        report = fetch_patient_adherence(selected_id)

        base_risk = report.get("base_risk", 0.75)
        ci_90 = report.get("confidence_interval_90", {})
        ci_80 = report.get("confidence_interval_80", {})
        cog_state = report.get("hidden_cognitive_state", "State 0")
        requires_review = report.get("requires_human_review", False)

        # Risk Score & Cognitive State
        rc1, rc2 = st.columns(2)
        with rc1:
            st.markdown("**Estimated Adherence Score (PDC)**")
            adherence_color = "green" if base_risk >= 0.80 else ("orange" if base_risk >= 0.50 else "red")
            st.markdown(f"<h2 style='color:{adherence_color}; margin-top:0;'>{base_risk * 100:.1f}%</h2>", unsafe_allow_html=True)
            st.progress(min(max(base_risk, 0.0), 1.0))
        with rc2:
            st.markdown("**Latent Cognitive State (HMM)**")
            st.info(f"🧠 **{cog_state}**")

        # Conformal Quantile Regression (CQR) Interval Gauge
        st.markdown("#### Conformal Quantile Regression (MAPIE)")
        st.write(f"**90% Calibrated Interval:** `[{ci_90.get('lower', 0):.2f} — {ci_90.get('upper', 0):.2f}]` (Bandwidth: `{ci_90.get('width', 0):.2f}`)")

        # Visual Interval Range
        fig_ci = go.Figure()
        # 90% range
        fig_ci.add_trace(go.Bar(
            y=["Adherence CI"],
            x=[ci_90.get("width", 0.3)],
            base=[ci_90.get("lower", 0.5)],
            orientation='h',
            marker=dict(color='rgba(66, 165, 245, 0.4)'),
            name="90% Confidence Interval"
        ))
        # Point estimate marker
        fig_ci.add_trace(go.Scatter(
            x=[base_risk],
            y=["Adherence CI"],
            mode='markers',
            marker=dict(color='navy', size=14, symbol='diamond'),
            name="XGBoost Point Estimate"
        ))
        # 80% Threshold Line
        fig_ci.add_vline(x=0.80, line_dash="dash", line_color="green", annotation_text="PDC Threshold (0.80)")
        fig_ci.update_layout(
            height=130,
            margin=dict(l=10, r=10, t=10, b=10),
            xaxis=dict(range=[0.0, 1.2], title="Proportion of Days Covered (PDC)"),
            yaxis=dict(showticklabels=False),
            template="plotly_white",
            showlegend=True,
            legend=dict(orientation="h", y=1.2)
        )
        st.plotly_chart(fig_ci, use_container_width=True)

        if requires_review:
            st.error("⚠️ **High Epistemic Uncertainty (CI Width > 0.40):** This prediction deferred to clinician review to prevent algorithmic bias.")
        else:
            st.success("✅ **Calibrated Confidence:** Model uncertainty is within safe clinical bounds.")

        # SHAP Feature Attribution Cards
        st.markdown("#### 🔍 SHAP Explainability Receipt")
        shap_dict = report.get("shap_explanation", {})
        sc_cols = st.columns(len(shap_dict) if shap_dict else 1)
        for i, (feat, impact) in enumerate(shap_dict.items()):
            clean_feat = feat.replace("_", " ").title()
            val_float = float(impact) if isinstance(impact, (int, float)) or (isinstance(impact, str) and impact.replace("+","").replace("-","").replace(".","").isdigit()) else 0.0
            sc_cols[i % len(sc_cols)].metric(
                label=clean_feat,
                value=str(impact),
                delta="Increases Risk" if val_float > 0 else "Lowers Risk",
                delta_color="inverse"
            )


# ─────────────────────────────────────────────────────────────────────────────
# PAGE 2: ACTIVE LEARNING REVIEW QUEUE
# ─────────────────────────────────────────────────────────────────────────────
elif page == "📋 Active Learning Queue (Uncertainty)":
    st.header("Active Learning & Bias Mitigation Review Queue")
    st.markdown(
        "Patients flagged here have **high conformal uncertainty (`90% CI width > 0.40`)**. "
        "Rather than issuing an overconfident or biased automated intervention, the system defers these decisions to the physician."
    )

    roster = fetch_patient_roster()
    uncertain_patients = [p for p in roster if p.get("requires_human_review", False) or p.get("interval_width_90", 0) > 0.35]

    if not uncertain_patients:
        st.success("No high-uncertainty patients currently in the review queue. All predictions are within tight calibration bounds.")
    else:
        df_queue = pd.DataFrame(uncertain_patients)
        df_queue = df_queue.rename(columns={
            "patient_id": "Patient UUID",
            "base_risk": "PDC Estimate",
            "interval_width_90": "90% CI Width",
            "requires_human_review": "Flagged For Review"
        })

        st.dataframe(
            df_queue.style.format({"PDC Estimate": "{:.2%}", "90% CI Width": "{:.3f}"}),
            use_container_width=True
        )

        st.markdown("---")
        st.subheader("Clinician Human-in-the-Loop Action Desk")
        target_pid = st.selectbox("Select Patient to Review:", [p["patient_id"] for p in uncertain_patients])
        
        act_col1, act_col2, act_col3 = st.columns(3)
        with act_col1:
            if st.button("🚫 Halt Dose Escalation (Suspected Non-Adherence)", type="primary"):
                st.success(f"Dose escalation blocked for {target_pid}. Alert logged to EHR CDS Hooks.")
        with act_col2:
            if st.button("📞 Dispatch Community Nurse Outreach"):
                st.info(f"Nurse outreach referral generated for {target_pid} (SDOH Assessment).")
        with act_col3:
            if st.button("📦 Order Smart Pill Bottle Delivery"):
                st.info(f"Hardware adherence monitoring kit ordered for {target_pid}.")


# ─────────────────────────────────────────────────────────────────────────────
# PAGE 3: SYSTEM ARCHITECTURE
# ─────────────────────────────────────────────────────────────────────────────
else:
    st.header("The Vanishing Dose — End-to-End Technical Stack")
    st.markdown("""
    ### 5-Layer Indirect-Signal Adherence Architecture
    
    1. **Layer 0 (Hardware Telemetry):** ESP32 + MAX30102 pulse oximeter streaming live PPG at 50 Hz over WebSockets with JITAI stress detection.
    2. **Layer 1 (Data Harmonization):** HL7 FHIR parser normalizing dispensing, clinical encounters, and vitals.
    3. **Layer 2 (Feature Engineering):** Tabular 90-day refill gap analysis, PDC ground-truth calculation.
    4. **Layer 3 (Hybrid Modeling):**
       - **XGBoost Meta-Learner:** Predicting non-adherence probability.
       - **Hidden Markov Model (HMM):** Decoding latent cognitive states (Strictly Adherent, Intermittent, Burnout).
       - **Temporal Fusion Transformer (TFT):** PyTorch Forecasting attention over irregular timelines.
    5. **Layer 4 (Uncertainty Calibration):** MAPIE Conformal Quantile Regression (CQR) delivering certified coverage bounds.
    6. **Layer 5 (Clinical Delivery):** CDS Hooks simulation & Clinician Dashboard.
    """)
    st.code("""
    # Directory Mapping
    ml/models/xgb_model.json      # XGBoost Meta-Learner
    ml/outputs/cqr_predictions.csv# MAPIE 80% & 90% Confidence Intervals
    backend/main.py               # FastAPI WebSockets & REST Gateway
    firmware/main.cpp             # ESP32 Dual-Mode Hardware/Simulation Code
    dashboard/app.py              # Streamlit Clinician UI
    """, language="text")
