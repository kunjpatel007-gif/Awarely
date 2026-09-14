import React, { useState } from 'react';
import { PatientDiagnostics, TelemetrySample, JitaiAlert } from '../types';
import { JitaiPanel } from '../components/JitaiPanel';
import { PpgCanvas } from '../components/PpgCanvas';
import { hmmStateToLabel, confidenceToLabel, shapFeaturesToRiskFactors, formatFeatureName, formatFeatureValue } from '../lib/clinicalLabels';
import { submitAdherenceReview, scheduleFollowUp } from '../services/api';

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
  eventLog: Array<{ time: string; text: string; isAlert: boolean }>;
  onBackToCohort: () => void;
  onRefresh?: () => void;
  isLoading: boolean;
}

export const DiagnosticsPage: React.FC<DiagnosticsPageProps> = ({
  patient,
  samples,
  hrv,
  latestAlert,
  eventLog,
  onBackToCohort,
  onRefresh,
  isLoading
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
  
  // Extract state number from the string e.g. "State 1" -> 1. If not found, default to 0
  let hmmStateNum = 0;
  const stateMatch = patient.hidden_cognitive_state.match(/\d+/);
  if (stateMatch) {
    hmmStateNum = parseInt(stateMatch[0], 10);
  }

  const hmmLabel = hmmStateToLabel(hmmStateNum);
  const confidence = confidenceToLabel(patient.confidence_interval_90.width);
  const riskFactors = shapFeaturesToRiskFactors(patient.shap_explanation || {}, patient.clinical_features || {});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleMarkAdherent = async () => {
    try {
      await submitAdherenceReview(patient.patient_id, 'adherent', 'call');
      showToast('Successfully marked as adherent');
      onRefresh?.();
    } catch (err) {
      console.error(err);
      showToast('Failed to mark adherent');
    }
  };

  const handleMarkNonAdherent = async () => {
    try {
      await submitAdherenceReview(patient.patient_id, 'non_adherent');
      showToast('Successfully marked as non-adherent');
      onRefresh?.();
    } catch (err) {
      console.error(err);
      showToast('Failed to mark non-adherent');
    }
  };

  const handleScheduleFollowUp = async () => {
    try {
      await scheduleFollowUp(patient.patient_id, new Date().toISOString(), '');
      showToast('Successfully scheduled follow-up');
    } catch (err) {
      console.error(err);
      showToast('Failed to schedule follow-up');
    }
  };

  return (
    <div className="view-panel active-view">
      {/* Action Banner & Toast */}
      {toastMessage && (
        <div style={{ backgroundColor: 'var(--bg-accent)', color: 'var(--text-pure)', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
          {toastMessage}
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className="btn-outline" onClick={handleMarkAdherent} style={{ borderColor: 'var(--status-healthy)' }}>
          Mark Adherent
        </button>
        <button className="btn-outline" onClick={handleMarkNonAdherent} style={{ borderColor: 'var(--status-critical)' }}>
          Mark Non-Adherent
        </button>
        <button className="btn-outline" onClick={handleScheduleFollowUp} style={{ borderColor: 'var(--status-warn)' }}>
          Schedule Follow-up
        </button>
      </div>

      {/* Patient Header */}
      <div className="patient-meta-banner">
        <div className="meta-col">
          <span className="meta-label">Patient</span>
          <span className="meta-value">{shortId}</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Medication</span>
          <div className="meta-value">
            {patient.medications && patient.medications.length > 0 ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {patient.medications.map(med => (
                  <li key={med.name} style={{ marginBottom: '4px' }}>
                    <strong>{med.name}</strong> — {med.time}
                  </li>
                ))}
              </ul>
            ) : (
              <span>No medications on file</span>
            )}
          </div>
        </div>
        <div className="meta-col">
          <span className="meta-label">Sensor</span>
          <span className="meta-value">
            <span className="dot green" />
            Pulse Oximeter Active
          </span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Patient Phase</span>
          <span className="meta-value">{hmmLabel}</span>
        </div>
        <div>
          <button className="btn-outline" onClick={onBackToCohort}>
            ← Back
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="stats-grid">
        <div className="diagnostic-card">
          <div className="diag-title-wrapper">
            <div className="diag-title">ADHERENCE SCORE</div>
          </div>
          <div className="diag-value-wrapper">
            <div
              className="diag-unified-val"
              style={isHighRisk ? { color: 'var(--status-critical)' } : undefined}
            >
              {(patient.base_risk * 100).toFixed(1)}%
            </div>
          </div>
          <div className="diag-subtext-wrapper">
            <div className="diag-subtext">Estimated from health records</div>
          </div>
        </div>

        <div className="diagnostic-card">
          <div className="diag-title-wrapper">
            <div className="diag-title">RISK LEVEL</div>
          </div>
          <div className="diag-value-wrapper">
            <div
              className="diag-unified-val"
              style={{
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
          <div className="diag-subtext-wrapper">
            <div className="diag-subtext">
              {isHighRisk
                ? 'Adherence below 60% — intervention recommended'
                : isModerate
                ? 'Borderline adherence — continued monitoring'
                : 'Adherence within safe range'}
            </div>
          </div>
        </div>

        <div className="diagnostic-card">
          <div className="diag-title-wrapper">
            <div className="diag-title">ASSESSMENT CONFIDENCE</div>
          </div>
          <div className="diag-value-wrapper">
            <div className="diag-unified-val" style={{ color: confidence.severity === 'good' ? 'var(--status-healthy)' : confidence.severity === 'moderate' ? 'var(--status-warn)' : 'var(--status-critical)' }}>
              {confidence.text}
            </div>
          </div>
          <div className="diag-subtext-wrapper">
            <div className="diag-subtext">System certainty based on available data</div>
          </div>
        </div>

        <div className="diagnostic-card">
          <div className="diag-title-wrapper">
            <div className="diag-title">PATIENT PHASE</div>
          </div>
          <div className="diag-value-wrapper">
            <div className="diag-unified-val">
              {hmmLabel}
            </div>
          </div>
          <div className="diag-subtext-wrapper">
            <div className="diag-subtext">Detected from longitudinal health records</div>
          </div>
        </div>
      </div>

      {/* Explanation & Intervention Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="clinical-panel">
          <div className="panel-header">
            <span className="panel-title">Key Risk Factors</span>
          </div>
          <div className="panel-body">
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {riskFactors.map((rf, i) => (
                <li key={i} style={{ marginBottom: '12px', display: 'flex', alignItems: 'flex-start' }}>
                  <span style={{ 
                    display: 'inline-block', 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: rf.direction === 'up' ? 'var(--status-critical)' : 'var(--status-healthy)',
                    marginRight: '12px',
                    marginTop: '6px',
                    flexShrink: 0
                  }} />
                  <span style={{ flex: 1, color: 'var(--text-pure)' }}>{rf.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <JitaiPanel isStressed={hrv.is_stressed} latestAlert={latestAlert} />
      </div>

      {/* Full Clinical Profile */}
      <div className="clinical-panel" style={{ marginTop: '20px' }}>
        <div className="panel-header">
          <span className="panel-title">Full Clinical Profile</span>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            {patient.clinical_features && Object.entries(patient.clinical_features).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {formatFeatureName(key)}
                </span>
                <span style={{ fontSize: '14px', color: 'var(--text-pure)', fontWeight: 500 }}>
                  {formatFeatureValue(key, value)}
                </span>
              </div>
            ))}
          </div>
        </div>
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

      {/* Event Timeline */}
      <div className="clinical-panel" style={{ marginTop: '20px' }}>
        <div className="panel-header">
          <span className="panel-title">Event Log</span>
        </div>
        <div className="panel-body">
          <div className="timeline-list">
            {eventLog.map((ev, idx) => (
              <div className="timeline-item" key={idx}>
                <span className="time-stamp">{ev.time}</span>
                <span className={`time-event ${ev.isAlert ? 'alert' : ''}`}>{ev.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
