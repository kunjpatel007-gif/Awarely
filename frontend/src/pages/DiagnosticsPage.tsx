import React from 'react';
import { PatientDiagnostics, TelemetrySample, JitaiAlert } from '../types';
import { ConformalVisualizer } from '../components/ConformalVisualizer';
import { ShapPanel } from '../components/ShapPanel';
import { JitaiPanel } from '../components/JitaiPanel';
import { PpgCanvas } from '../components/PpgCanvas';

interface DiagnosticsPageProps {
  patient: PatientDiagnostics | null;
  samples: TelemetrySample[];
  hrv: {
    mean_hr_bpm: number;
    sdnn_ms: number;
    rmssd_ms: number;
    is_stressed: boolean;
  };
  latestAlert: JitaiAlert | null;
  onBackToCohort: () => void;
  onSimulateStress: () => void;
  isLoading: boolean;
}

export const DiagnosticsPage: React.FC<DiagnosticsPageProps> = ({
  patient,
  samples,
  hrv,
  latestAlert,
  onBackToCohort,
  onSimulateStress,
  isLoading
}) => {
  if (isLoading || !patient) {
    return (
      <div className="view-panel active-view">
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <span className="mono-val">Loading patient indirect diagnostic package...</span>
        </div>
      </div>
    );
  }

  const shortId = patient.patient_id.replace('test-patient-', 'P-');
  const isHighRisk = patient.base_risk < 0.60;
  const isModerate = patient.base_risk >= 0.60 && patient.base_risk < 0.80;

  return (
    <div className="view-panel active-view">
      {/* Metadata Header Banner */}
      <div className="patient-meta-banner">
        <div className="meta-col">
          <span className="meta-label">Subject Identifier</span>
          <span className="meta-value">PATIENT {shortId}</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Monitoring Regimen</span>
          <span className="meta-value">Hypertension / ARB Protocol (Daily 08:00)</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Telemetry Stream</span>
          <span className="meta-value">
            <span className="dot green" />
            ESP32 / MAX30102 Live
          </span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Latent Behavioral Trajectory</span>
          <span className="meta-value">{patient.hidden_cognitive_state}</span>
        </div>
        <div>
          <button className="btn-outline" onClick={onBackToCohort}>
            ← Back to Cohort
          </button>
        </div>
      </div>

      {/* 4 Hero Diagnostic Metric Cards */}
      <div className="hero-diagnostic-grid">
        <div className="diagnostic-card">
          <div>
            <div className="diag-title">Adherence Score (PDC Estimate)</div>
            <div
              className="diag-big-val"
              style={isHighRisk ? { color: 'var(--status-critical)' } : undefined}
            >
              {(patient.base_risk * 100).toFixed(1)}%
            </div>
          </div>
          <div className="diag-subtext">Calibrated XGBoost Indirect Estimate</div>
        </div>

        <div className="diagnostic-card">
          <div>
            <div className="diag-title">Clinical Risk Assessment</div>
            <div
              className="diag-big-val"
              style={{
                fontSize: '26px',
                color: isHighRisk
                  ? 'var(--status-critical)'
                  : isModerate
                  ? 'var(--status-warn)'
                  : 'var(--status-healthy)'
              }}
            >
              {isHighRisk ? 'HIGH RISK' : isModerate ? 'MONITOR' : 'LOW RISK'}
            </div>
          </div>
          <div className="diag-subtext">
            {isHighRisk
              ? 'Below therapeutic threshold (PDC < 60%)'
              : isModerate
              ? 'Borderline adherence profile'
              : 'Within therapeutic threshold'}
          </div>
        </div>

        <div className="diagnostic-card">
          <div>
            <div className="diag-title">90% Confidence Interval</div>
            <div className="diag-big-val" style={{ fontSize: '24px' }}>
              {(patient.confidence_interval_90.lower * 100).toFixed(0)}% —{' '}
              {(patient.confidence_interval_90.upper * 100).toFixed(0)}%
            </div>
          </div>
          <div className="diag-subtext">
            Interval Width: {(patient.confidence_interval_90.width * 100).toFixed(1)}% (
            {patient.requires_human_review ? 'High Uncertainty' : 'Acceptable'})
          </div>
        </div>

        <div className="diagnostic-card">
          <div>
            <div className="diag-title">HMM Latent Cognitive State</div>
            <div className="diag-big-val" style={{ fontSize: '20px', lineHeight: 1.3 }}>
              {patient.hidden_cognitive_state}
            </div>
          </div>
          <div className="diag-subtext">
            Longitudinal Sequence: Hidden Markov Decoded Transition
          </div>
        </div>
      </div>

      {/* Conformal Uncertainty Visualizer */}
      <ConformalVisualizer
        pointEstimate={patient.base_risk}
        ci90={patient.confidence_interval_90}
        ci80={patient.confidence_interval_80}
        requiresReview={patient.requires_human_review}
      />

      {/* SHAP Explainability & JITAI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <ShapPanel explanation={patient.shap_explanation} />
        <JitaiPanel isStressed={hrv.is_stressed} latestAlert={latestAlert} />
      </div>

      {/* Live Biosignal Telemetry Section */}
      <div className="telemetry-live-box">
        <div className="telemetry-head">
          <div>
            <span className="panel-title">Live Biosignal Telemetry (WebSocket WS /ws/ppg)</span>
            <span className="brand-subtitle" style={{ marginTop: '2px' }}>
              Continuous Photoplethysmogram (PPG) Stream from ESP32 / MAX30102 Optical Sensor
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="status-pill">
              <span className={`dot ${hrv.is_stressed ? 'red' : 'green'}`} />
              50 Hz Stream Online
            </span>
            <button className="btn-outline" onClick={onSimulateStress}>
              Simulate Acute Stress Event
            </button>
          </div>
        </div>

        <div className="telemetry-vital-row">
          <div className="vital-mini-card">
            <span className="vital-mini-label">Heart Rate (PR)</span>
            <div className="vital-mini-val">
              {hrv.mean_hr_bpm.toFixed(0)}{' '}
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>BPM</span>
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">HRV / SDNN</span>
            <div className="vital-mini-val">
              {hrv.sdnn_ms.toFixed(1)}{' '}
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>ms</span>
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">RMSSD (Parasympathetic)</span>
            <div className="vital-mini-val">
              {hrv.rmssd_ms.toFixed(1)}{' '}
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>ms</span>
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Sensor Hardware</span>
            <div className="vital-mini-val" style={{ fontSize: '14px', paddingTop: '4px' }}>
              MAX30102
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Autonomic State</span>
            <div
              className="vital-mini-val"
              style={{
                fontSize: '14px',
                color: hrv.is_stressed ? 'var(--status-critical)' : 'var(--status-healthy)',
                paddingTop: '4px'
              }}
            >
              {hrv.is_stressed ? 'ACUTE STRESS' : 'STABLE'}
            </div>
          </div>
        </div>

        <PpgCanvas samples={samples} height={140} />
      </div>
    </div>
  );
};
