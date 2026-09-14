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
        while True:
            # 50 Hz
            await asyncio.sleep(0.02)
            sample = sim.tick()
            await websocket.send_json({"type": "SAMPLE", "data": sample})
            
            local_window.append(sample["ppg"])
            if len(local_window) > 1500:
                local_window.pop(0)
                
            if len(local_window) >= 1500 and len(local_window) % 50 == 0:
                hrv = calculate_hrv_metrics(local_window[-1500:])
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
            _audit_log.append({"patient": patient_id, "action": "adherence_review", "body": body})
            return {"status": "success"}
    return {"status": "error", "message": "Patient not found"}

@app.post("/api/patients/{patient_id}/follow-up")
async def schedule_follow_up(patient_id: str, body: dict = Body(...)):
    _audit_log.append({"patient": patient_id, "action": "follow_up", "body": body})
    return {"status": "success"}
