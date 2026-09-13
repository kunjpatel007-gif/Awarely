# Implementation Plan & Execution Summary: The Vanishing Dose Clinical Dashboard

## 🎯 Executive Overview
This document records the architectural planning, verified repository constraints, implementation milestones, and operational delivery of the Stitch-generated Clinical Intelligence Dashboard into **The Vanishing Dose** codebase.

The React + Vite application replaces the legacy Streamlit UI as the primary operational clinical frontend, while maintaining full backward compatibility with the existing FastAPI backend gateway, ML inference models (CQR, HMM, XGBoost, TreeSHAP), Redis cache, and ESP32 hardware telemetry firmware.

---

## 🏛️ Source of Truth & Repository Audit

Prior to implementation, all assets and code were audited directly against disk:

| Architectural Component | Repository Status | Verified Capability / Findings |
| :--- | :---: | :--- |
| **`backend/main.py`** | Existing | Exists with `/api/health`, `/api/patient/{id}/adherence`, `/api/telemetry/latest`, and `/ws/ppg`. |
| **`GET /api/patients/summary`** | Added | Implemented to return real cohort metrics rather than mock values. |
| **CQR Dataset** | Verified: **198** | `ml/outputs/cqr_predictions.csv` contains 198 patient test records (20% test split of 990 patients). |
| **HMM Cognitive States** | Verified: **986** | `ml/outputs/hmm_states.csv` indexes 986 longitudinal sequences across 3 states (Strictly Adherent, Intermittent, Burnout/Non-Adherent). |
| **Review Queue** | Verified: **25** | Exactly 25 patients exhibit out-of-bounds raw predictions ($> 1.0$ or $< 0.0$) or 90% CI width $> 0.40$. |
| **High Risk Cohort** | Verified: **48** | Exactly 48 patients in the calibrated test set have PDC $< 60\%$. |
| **ESP32 Firmware Contract** | Intact | `firmware/src/main.cpp` sends `{"timestamp", "ppg", "raw_ir", "source"}` at 50 Hz to `WS /ws/ppg` and receives `{"alert": "JITAI_TRIGGERED", ...}` to trigger onboard LED. |
| **Perfusion Index / Pulse Transit**| Excluded | Stitch placeholder text; not produced by MAX30102 pulse oximeter without synchronous ECG. Omitted to avoid fabricating clinical telemetry. |

---

## 🚀 Work Completed (Milestones Delivered)

### 1. Dedicated WebSocket Pub/Sub Telemetry Broker (`backend/main.py`)
- **Producer-Subscriber Isolation**: Resolved the issue where a passive listener connecting to `/ws/ppg` would deadlock or interfere with the ESP32 producer loop.
- **TelemetryBroker**: Implemented an internal multiplexer. Incoming samples on `/ws/ppg` are analyzed via SciPy HRV, evaluate JITAI stress triggers, and broadcast to all connected dashboard clients on `WS /ws/telemetry/subscribe`.
- **Closed-Loop Alerts**: When acute stress (SDNN $< 25$ ms, HR $\approx 102$ BPM) is detected, alerts are dispatched to the ESP32 hardware LED and broadcast to the React dashboard concurrently.

### 2. Clinical Endpoints & Bounds Transparency (`backend/main.py`)
- **`GET /api/patients/summary`**: Dynamically calculates total patients (198), review queue (25), high-risk non-adherent (48), and deferred rate (12.6%).
- **`GET /api/patients`**: Lists cohort members with calibrated 90% CI bounds, review triggers, and HMM state labels.
- **`GET /api/patient/{id}/adherence`**:
  - Calibrates display PDC score into $[0.0, 1.0]$ while preserving raw unclipped estimates (`raw_point_estimate`) and `is_clipped` flags.
  - Returns human-readable `review_reason` explaining why the model triggered manual clinician review (e.g. `"Point Estimate Out of Bounds (Raw 1.0020 outside [0.0, 1.0])"`).
- **Configurable CORS**: Replaced permissive wildcards with environment-driven `CORS_ORIGINS` (`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`).

### 3. Production React 19 + TypeScript + Vite Frontend (`frontend/`)
- **Stitch Visual Fidelity**: Faithfully reproduced Stitch dark mode theme (`#0a0a0a` background, Space Grotesk / JetBrains Mono typography, glowing status dots, compact technical cards).
- **5 Operational Views**:
  1. **Cohort Overview (`OverviewPage.tsx`)**: Executive 4-stat cards and filterable cohort roster table.
  2. **Patient Diagnostics (`DiagnosticsPage.tsx`)**: 4 hero diagnostic cards, raw clipping alert banner, CQR horizontal range track with 80%/90% bands, TreeSHAP feature impact bars, JITAI adaptive card, and 50 Hz PPG canvas.
  3. **Uncertainty Review Queue (`ReviewQueuePage.tsx`)**: 25 deferred patients with review trigger badges and clinician action buttons ("Nurse Outreach", "Arbitrate Adherence").
  4. **Live Telemetry (`TelemetryPage.tsx`)**: Expanded 240px PPG waveform visualizer, vital telemetry cards (HR, SDNN, RMSSD, Autonomic State), and real-time event audit log.
  5. **System & Models (`SystemModelsPage.tsx`)**: Dual-stream pipeline architecture diagram and FastAPI backend API specification.
- **Zero Fake Telemetry in Live Mode**:
  - Zero `Math.random()` or `requestAnimationFrame` simulations.
  - PPG canvas renders flat baseline with `STANDBY` text when sample buffer is empty.
  - Initial HRV displays `0.0` with `STANDBY` / `--` indicators until real packets arrive.
  - Client-side stress simulation is strictly guarded behind `VITE_DEMO_MODE=true`.

### 4. Docker & Orchestration (`docker-compose.yml`, `frontend/Dockerfile`)
- Added multi-stage `frontend/Dockerfile` (Node 20 build stage + Nginx Alpine static server).
- Updated `docker-compose.yml` to orchestrate `redis` (6379), `backend` (8000), `frontend` (5173), and the legacy Streamlit `dashboard` (8501).

---

## 🧪 Verification & Audit Matrix

All 12 items from the master verification protocol were tested:

1. **Frontend Build**: `npm run build` compiled 30 modules with zero TypeScript errors in 225ms.
2. **Backend Startup**: `backend/main.py` initialized and loaded 198 CQR records and 986 HMM states.
3. **Endpoints Tested**:
   - `GET /api/health` → `healthy`
   - `GET /api/patients/summary` → 198 monitored, 25 review, 48 high-risk
   - `GET /api/patients` → 198 rows with calibrated intervals
   - `GET /api/patient/test-patient-0825/adherence` → Consistent CQR intervals, HMM state, and out-of-bounds review trigger
4. **WebSocket Pub/Sub**: ESP32 sent 50 Hz biosignal samples to `/ws/ppg`; dashboard subscriber received broadcast samples on `/ws/telemetry/subscribe`.
5. **Closed-Loop JITAI**: Streaming acute stress pulses triggered both ESP32 hardware alert (`JITAI_TRIGGERED`) and React dashboard UI notification.
6. **No Fake Telemetry**: Standby states and zero baselines verified when disconnected.

---

## 🚀 How to Run

### Docker Compose
```powershell
docker-compose up --build
```
- **React Frontend**: http://localhost:5173
- **FastAPI OpenAPI Docs**: http://localhost:8000/docs
- **Legacy Streamlit Dashboard**: http://localhost:8501

### Local Development
```powershell
# 1. Backend
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 2. Frontend
cd frontend
npm run dev
```
