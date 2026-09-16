import React, { useState } from 'react';
import { PatientDiagnostics, TelemetrySample, JitaiAlert } from '../types';
import { JitaiPanel } from '../components/JitaiPanel';
import { PpgCanvas } from '../components/PpgCanvas';
import { hmmStateToLabel, confidenceToLabel, shapFeaturesToRiskFactors, formatFeatureName, formatFeatureValue } from '../lib/clinicalLabels';
import { fetchPatientDiagnostics, submitAdherenceReview, scheduleFollowUp, remindRefill, remindAppointment } from '../services/api';

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

// Inline 16px stroke icons (icon strategy (a): no new file, no package)
const Svg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg
    className="icon"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);
const IconCheck = () => <Svg><path d="M3 8.5l3.2 3L13 4.5" /></Svg>;
const IconCross = () => <Svg><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
const IconCalendar = () => (
  <Svg>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </Svg>
);
const IconPill = () => (
  <Svg>
    <rect x="1.8" y="5.5" width="12.4" height="5" rx="2.5" transform="rotate(-45 8 8)" />
    <path d="M6.2 6.2l3.6 3.6" />
  </Svg>
);
const IconBell = () => (
  <Svg>
    <path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3L4 11z" />
    <path d="M6.5 14.5h3" />
  </Svg>
);
const IconBack = () => <Svg><path d="M10 3.5L5.5 8l4.5 4.5" /></Svg>;
const IconArrowUp = () => <Svg><path d="M8 13V3M4 7l4-4 4 4" /></Svg>;
const IconArrowDown = () => <Svg><path d="M8 3v10M4 9l4 4 4-4" /></Svg>;
const IconAlert = () => (
  <Svg>
    <path d="M8 2.5l6 10.5H2L8 2.5z" />
    <path d="M8 6.5v3M8 11.25v.01" />
  </Svg>
);
const IconInfoDot = () => <Svg><circle cx="8" cy="8" r="2.5" /></Svg>;

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
        <div className="loading-state">
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

  // Presentation-only mappings of the SAME conditions used below
  const riskTone = isHighRisk ? 'critical' : isModerate ? 'warn' : 'healthy';
  const confidenceTone = confidence.severity === 'good' ? 'healthy' : confidence.severity === 'moderate' ? 'warn' : 'critical';

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
      const res = await scheduleFollowUp(patient.patient_id, new Date().toISOString(), '');
      showToast('Successfully scheduled follow-up');
      if (res && res.email_dispatched) {
        alert("Automated Email Dispatched:\n\n" + res.email_dispatched);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to schedule follow-up');
    }
  };

  const handleRemindRefill = async () => {
    try {
      const res = await remindRefill(patient.patient_id);
      showToast('Refill reminder dispatched');
      if (res && res.email_dispatched) {
        alert("Refill Reminder Dispatched:\n\n" + res.email_dispatched);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to send refill reminder');
    }
  };

  const handleRemindAppointment = async () => {
    try {
      const res = await remindAppointment(patient.patient_id);
      showToast('Appointment reminder dispatched');
      if (res && res.email_dispatched) {
        alert("Appointment Reminder Dispatched:\n\n" + res.email_dispatched);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to send appointment reminder');
    }
  };

  return (
    <div className="view-panel active-view">
      {/* Action Banner & Toast */}
      {toastMessage && (
        <div className="action-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
      
      <div className="action-toolbar" role="group" aria-label="Patient actions">
        <button type="button" className="btn-outline btn-rail accent-healthy" onClick={handleMarkAdherent}>
          <IconCheck />
          Mark Adherent
        </button>
        <button type="button" className="btn-outline btn-rail accent-critical" onClick={handleMarkNonAdherent}>
          <IconCross />
          Mark Non-Adherent
        </button>
        <button type="button" className="btn-outline btn-rail accent-warn" onClick={handleScheduleFollowUp}>
          <IconCalendar />
          Schedule Follow-up
        </button>
        <button type="button" className="btn-outline btn-rail accent-info" onClick={handleRemindRefill}>
          <IconPill />
          Remind Refill
        </button>
        <button type="button" className="btn-outline btn-rail accent-primary" onClick={handleRemindAppointment}>
          <IconBell />
          Remind Appointment
        </button>
      </div>

      {/* Patient Header */}
      <div className="patient-meta-banner">
        <div className="meta-col">
          <span className="meta-label">Patient</span>
          <span className="meta-value meta-value--mono">{shortId}</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Medication</span>
          <div className="meta-value">
            {patient.medications && patient.medications.length > 0 ? (
              <ul className="med-list">
                {patient.medications.map(med => (
                  <li key={med.name}>
                    <strong>{med.name}</strong> — <span className="mono-val">{med.time}</span>
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
            <span className="dot green" aria-hidden="true" />
            Pulse Oximeter Active
          </span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Patient Phase</span>
          <span className="meta-value">{hmmLabel}</span>
        </div>
        <div className="meta-actions">
          <button type="button" className="btn-outline" onClick={onBackToCohort}>
            <IconBack />
            Back
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="stats-grid">
        <div className={`diagnostic-card ${isHighRisk ? 'accent-critical' : ''}`}>
          <div className="diag-title-wrapper">
            <div className="diag-title">ADHERENCE SCORE</div>
          </div>
          <div className="diag-value-wrapper">
            <div className={`diag-unified-val ${isHighRisk ? 'tone-critical' : ''}`}>
              {(patient.base_risk * 100).toFixed(1)}%
            </div>
          </div>
          <div className="diag-subtext-wrapper">
            <div className="diag-subtext">Estimated from health records</div>
          </div>
        </div>

        <div className={`diagnostic-card accent-${riskTone}`}>
          <div className="diag-title-wrapper">
            <div className="diag-title">RISK LEVEL</div>
          </div>
          <div className="diag-value-wrapper">
            <div className={`diag-unified-val diag-unified-val--text tone-${riskTone}`}>
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

        <div className={`diagnostic-card accent-${confidenceTone}`}>
          <div className="diag-title-wrapper">
            <div className="diag-title">ASSESSMENT CONFIDENCE</div>
          </div>
          <div className="diag-value-wrapper">
            <div className={`diag-unified-val diag-unified-val--text tone-${confidenceTone}`}>
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
            <div className="diag-unified-val diag-unified-val--text">
              {hmmLabel}
            </div>
          </div>
          <div className="diag-subtext-wrapper">
            <div className="diag-subtext">Detected from longitudinal health records</div>
          </div>
        </div>
      </div>

      {/* Explanation & Intervention Grid */}
      <div className="diag-explain-grid">
        <div className="clinical-panel">
          <div className="panel-header">
            <span className="panel-title">Key Risk Factors</span>
          </div>
          <div className="panel-body">
            <ul className="risk-factor-list">
              {riskFactors.map((rf, i) => (
                <li key={i} className={`risk-factor ${rf.direction === 'up' ? 'accent-critical' : 'accent-healthy'}`}>
                  <span className={`dot ${rf.direction === 'up' ? 'red' : 'green'}`} aria-hidden="true" />
                  <span className="risk-factor-arrow">
                    {rf.direction === 'up' ? <IconArrowUp /> : <IconArrowDown />}
                  </span>
                  <span className="risk-factor-label">{rf.label}</span>
                  <span className="risk-factor-direction">
                    {rf.direction === 'up' ? 'Increases risk' : 'Lowers risk'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <JitaiPanel isStressed={hrv.is_stressed} latestAlert={latestAlert} />
      </div>

      {/* Full Clinical Profile */}
      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">Full Clinical Profile</span>
        </div>
        <div className="panel-body">
          <div className="profile-grid">
            {patient.clinical_features && Object.entries(patient.clinical_features).map(([key, value]) => (
              <div key={key} className="profile-item">
                <span className="profile-label">
                  {formatFeatureName(key)}
                </span>
                <span className="profile-value">
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
            <span className="brand-subtitle">
              Real-time pulse waveform from wearable sensor
            </span>
          </div>
          <div className="telemetry-head-meta">
            <span className="status-pill">
              <span className={`dot ${hrv.is_stressed ? 'red' : 'green'}`} aria-hidden="true" />
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
                  <span className="vital-unit">BPM</span>
                </>
              ) : (
                <span className="vital-waiting">Waiting...</span>
              )}
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Heart Rate Variability</span>
            <div className="vital-mini-val">
              {hrv.sdnn_ms > 0 ? (
                <>
                  {hrv.sdnn_ms.toFixed(1)}{' '}
                  <span className="vital-unit">ms</span>
                </>
              ) : (
                <span className="vital-waiting">--</span>
              )}
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Stress Indicator</span>
            <div
              className={`vital-mini-val vital-mini-val--status ${
                hrv.mean_hr_bpm === 0 ? 'tone-muted' : hrv.is_stressed ? 'tone-critical' : 'tone-healthy'
              }`}
            >
              {hrv.mean_hr_bpm === 0 ? 'Waiting...' : hrv.is_stressed ? 'Elevated Stress' : 'Normal'}
            </div>
          </div>
        </div>

        <PpgCanvas samples={samples} height={140} />
      </div>

      {/* Event Timeline */}
      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">Event Log</span>
        </div>
        <div className="panel-body">
          <div className="timeline-list">
            {eventLog.map((ev, idx) => (
              <div className={`timeline-item ${ev.isAlert ? 'is-alert' : 'is-info'}`} key={idx}>
                <span className="timeline-marker">
                  {ev.isAlert ? <IconAlert /> : <IconInfoDot />}
                </span>
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
