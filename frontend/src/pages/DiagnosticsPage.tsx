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
          <span className="mono-val">Loading patient data...</span>
        </div>
      </div>
    );
  }

  const shortId = patient.patient_id.replace('test-patient-', 'P-');
  const isHighRisk = patient.base_risk < 0.60;
  const isModerate = patient.base_risk >= 0.60 && patient.base_risk < 0.80;

  return (
    <div className="view-panel active-view">
      {/* Patient Header */}
      <div className="patient-meta-banner">
        <div className="meta-col">
          <span className="meta-label">Patient</span>
          <span className="meta-value">{shortId}</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Medication</span>
          <span className="meta-value">Hypertension — Daily 08:00</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Sensor</span>
          <span className="meta-value">
            <span className="dot green" />
            Pulse Oximeter Active
          </span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Behavioral Pattern</span>
          <span className="meta-value">{patient.hidden_cognitive_state}</span>
        </div>
        <div>
          <button className="btn-outline" onClick={onBackToCohort}>
            ← Back
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="hero-diagnostic-grid">
        <div className="diagnostic-card">
          <div>
            <div className="diag-title">Adherence Score</div>
            <div
              className="diag-big-val"
              style={isHighRisk ? { color: 'var(--status-critical)' } : undefined}
            >
              {(patient.base_risk * 100).toFixed(1)}%
            </div>
          </div>
          <div className="diag-subtext">
            {patient.is_clipped ? (
              <span style={{ color: 'var(--status-warn)' }}>
                Adjusted (raw: {((patient.raw_point_estimate ?? patient.base_risk) * 100).toFixed(1)}%)
              </span>
            ) : (
              'Estimated from health records'
            )}
          </div>
        </div>

        <div className="diagnostic-card">
          <div>
            <div className="diag-title">Risk Level</div>
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
              ? 'Adherence below 60% — intervention recommended'
              : isModerate
              ? 'Borderline adherence — continued monitoring'
              : 'Adherence within safe range'}
          </div>
        </div>

        <div className="diagnostic-card">
          <div>
            <div className="diag-title">Prediction Confidence</div>
            <div className="diag-big-val" style={{ fontSize: '24px' }}>
              {(patient.confidence_interval_90.lower * 100).toFixed(0)}% —{' '}
              {(patient.confidence_interval_90.upper * 100).toFixed(0)}%
            </div>
          </div>
          <div className="diag-subtext">
            {patient.requires_human_review ? 'Wide range — clinician review needed' : 'Narrow range — high confidence'}
          </div>
        </div>

        <div className="diagnostic-card">
          <div>
            <div className="diag-title">Behavioral Pattern</div>
            <div className="diag-big-val" style={{ fontSize: '20px', lineHeight: 1.3 }}>
              {patient.hidden_cognitive_state}
            </div>
          </div>
          <div className="diag-subtext">
            Detected from longitudinal health records
          </div>
        </div>
      </div>

      {/* Confidence Visualizer */}
      <ConformalVisualizer
        pointEstimate={patient.base_risk}
        ci90={patient.confidence_interval_90}
        ci80={patient.confidence_interval_80}
        requiresReview={patient.requires_human_review}
        reviewReason={patient.review_reason}
      />

      {/* Explanation & Intervention Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <ShapPanel explanation={patient.shap_explanation} />
        <JitaiPanel isStressed={hrv.is_stressed} latestAlert={latestAlert} />
      </div>

      {/* Live Heart Rate Monitor */}
      <div className="telemetry-live-box">
        <div className="telemetry-head">
          <div>
            <span className="panel-title">Live Heart Rate Monitor</span>
            <span className="brand-subtitle" style={{ marginTop: '2px' }}>
              Real-time pulse waveform from wearable sensor
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="status-pill">
              <span className={`dot ${hrv.is_stressed ? 'red' : 'green'}`} />
              {hrv.is_stressed ? 'Stress Detected' : 'Normal'}
            </span>
            <button className="btn-outline" onClick={onSimulateStress}>
              Simulate Stress
            </button>
          </div>
        </div>

        <div className="telemetry-vital-row">
          <div className="vital-mini-card">
            <span className="vital-mini-label">Heart Rate</span>
            <div className="vital-mini-val">
              {hrv.mean_hr_bpm > 0 ? (
                <>
                  {hrv.mean_hr_bpm.toFixed(0)}{' '}
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>BPM</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Waiting...</span>
              )}
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Heart Rate Variability</span>
            <div className="vital-mini-val">
              {hrv.sdnn_ms > 0 ? (
                <>
                  {hrv.sdnn_ms.toFixed(1)}{' '}
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>ms</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>--</span>
              )}
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Stress Indicator</span>
            <div
              className="vital-mini-val"
              style={{
                fontSize: '14px',
                color: hrv.mean_hr_bpm === 0 ? 'var(--text-tertiary)' : hrv.is_stressed ? 'var(--status-critical)' : 'var(--status-healthy)',
                paddingTop: '4px'
              }}
            >
              {hrv.mean_hr_bpm === 0 ? 'Waiting...' : hrv.is_stressed ? 'Elevated Stress' : 'Normal'}
            </div>
          </div>
        </div>

        <PpgCanvas samples={samples} height={140} />
      </div>
    </div>
  );
};
