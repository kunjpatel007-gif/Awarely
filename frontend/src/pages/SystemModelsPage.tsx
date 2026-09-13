import React from 'react';

export const SystemModelsPage: React.FC = () => {
  return (
    <div className="view-panel active-view">
      <div className="page-intro">
        <h1 className="page-headline">Clinical Intelligence Pipeline Architecture</h1>
        <p className="page-desc">
          Dual-track computational framework uniting edge autonomic physiological telemetry with
          longitudinal behavioral EHR tabular inference and Conformal Quantile Regression bounds.
        </p>
      </div>

      <div className="pipeline-view-container">
        {/* Stream 1: Real-time Autonomic Telemetry */}
        <div className="pipeline-flow-card">
          <span className="section-label" style={{ color: 'var(--status-info)' }}>
            STREAM 1: REAL-TIME BIOSIGNAL &amp; JITAI PIPELINE
          </span>
          <div className="pipeline-steps">
            <div className="pipe-node">
              <div className="pipe-node-title">ESP32 + MAX30102</div>
              <div className="pipe-node-desc">50Hz optical PPG sensor</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node">
              <div className="pipe-node-title">PPG Stream</div>
              <div className="pipe-node-desc">Bandpass 0.5-5Hz filter</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node">
              <div className="pipe-node-title">HRV Analysis</div>
              <div className="pipe-node-desc">SDNN &amp; RMSSD calculation</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node">
              <div className="pipe-node-title">Stress Detection</div>
              <div className="pipe-node-desc">Autonomic imbalance classifier</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node" style={{ borderColor: 'var(--status-info)' }}>
              <div className="pipe-node-title">JITAI Engine</div>
              <div className="pipe-node-desc">Adaptive reminder modulation</div>
            </div>
          </div>
        </div>

        {/* Stream 2: Longitudinal Behavioral Adherence Inference */}
        <div className="pipeline-flow-card">
          <span className="section-label" style={{ color: 'var(--status-healthy)' }}>
            STREAM 2: BEHAVIORAL INFERENCE &amp; CONFORMAL UNCERTAINTY
          </span>
          <div className="pipeline-steps">
            <div className="pipe-node">
              <div className="pipe-node-title">EHR &amp; Refills</div>
              <div className="pipe-node-desc">Pharmacy refill gaps &amp; appointments</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node">
              <div className="pipe-node-title">Feature Engineering</div>
              <div className="pipe-node-desc">Indirect behavioral vectors</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node">
              <div className="pipe-node-title">XGBoost Adherence</div>
              <div className="pipe-node-desc">PDC regression estimation</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node">
              <div className="pipe-node-title">Conformal Quantiles</div>
              <div className="pipe-node-desc">90% calibrated uncertainty interval</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node">
              <div className="pipe-node-title">HMM Cognitive State</div>
              <div className="pipe-node-desc">Latent behavioral trajectory</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node">
              <div className="pipe-node-title">TreeSHAP</div>
              <div className="pipe-node-desc">Feature attribution &amp; rationale</div>
            </div>
            <div className="pipe-arrow">→</div>
            <div className="pipe-node" style={{ borderColor: 'var(--status-warn)' }}>
              <div className="pipe-node-title">Clinical Review</div>
              <div className="pipe-node-desc">Human-in-the-loop arbitration</div>
            </div>
          </div>
        </div>

        {/* FastAPI Backend Endpoints Reference */}
        <div className="api-contract-box">
          <div style={{ fontWeight: 600, color: 'var(--text-pure)', marginBottom: '8px' }}>
            FastAPI Backend Interface Specification:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <span className="api-endpoint-badge">GET</span> /api/patients/summary — Cohort-wide metrics: monitored patients (198), review queue (25), high-risk non-adherent (48)
            </div>
            <div>
              <span className="api-endpoint-badge">GET</span> /api/patients — Cohort roster with CQR 90% bounds, review flags, and HMM states
            </div>
            <div>
              <span className="api-endpoint-badge">GET</span> /api/patient/:id/adherence — XGBoost score, 80%/90% CQR intervals, HMM cognitive state, TreeSHAP receipt
            </div>
            <div>
              <span className="api-endpoint-badge">GET</span> /api/telemetry/latest — Polling fallback for buffered PPG samples and HRV calculations
            </div>
            <div>
              <span className="api-endpoint-badge">WS</span> /ws/ppg — Bi-directional 50 Hz biosignal ingest for ESP32 hardware &amp; LED alert feedback
            </div>
            <div>
              <span className="api-endpoint-badge">WS</span> /ws/telemetry/subscribe — Real-time Pub/Sub broker channel for React dashboard viewers
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
