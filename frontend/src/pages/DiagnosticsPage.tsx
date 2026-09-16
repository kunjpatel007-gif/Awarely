import React, { useMemo, useRef, useState } from 'react';
import { PatientDiagnostics, TelemetrySample, JitaiAlert } from '../types';
import { JitaiPanel } from '../components/JitaiPanel';
import { PpgCanvas } from '../components/PpgCanvas';
import { ConformalVisualizer } from '../components/ConformalVisualizer';
import { ShapPanel } from '../components/ShapPanel';
import { hmmStateToLabel, confidenceToLabel, shapFeaturesToRiskFactors, formatFeatureName, formatFeatureValue, reviewReasonToLabel } from '../lib/clinicalLabels';
import { fetchPatientDiagnostics, submitAdherenceReview, scheduleFollowUp, remindRefill, remindAppointment } from '../services/api';
import {
  ChipGroup,
  CollapsiblePanel,
  IconAlert,
  IconArrowDown,
  IconArrowUp,
  IconBack,
  IconBell,
  IconCalendar,
  IconCheck,
  IconCopy,
  IconCross,
  IconHeart,
  IconInfoDot,
  IconPill,
  IconSpinner,
  InfoTip,
  Popover,
  ProgressRing,
  Reveal,
  SearchField,
  Skeleton,
  Tabs,
  Toast,
  highlight,
  spotlight
} from '../components/ui';

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

type LogEntry = DiagnosticsPageProps['eventLog'][number];

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
  // --- interaction state (all hooks must run before the loading early-return)
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [profileQuery, setProfileQuery] = useState('');
  const [logFilter, setLogFilter] = useState<'all' | 'alerts'>('all');
  const initialLogKeys = useRef<Set<string> | null>(null);

  // Stable keys for log entries (newest are prepended), so only genuinely new
  // entries animate in.
  const keyedLog = useMemo(() => {
    const counts = new Map<string, number>();
    const out: Array<{ ev: LogEntry; key: string }> = new Array(eventLog.length);
    for (let i = eventLog.length - 1; i >= 0; i--) {
      const ev = eventLog[i];
      const base = `${ev.time}|${ev.text}`;
      const n = (counts.get(base) || 0) + 1;
      counts.set(base, n);
      out[i] = { ev, key: `${base}|${n}` };
    }
    return out;
  }, [eventLog]);
  if (initialLogKeys.current === null) {
    initialLogKeys.current = new Set(keyedLog.map(k => k.key));
  }

  if (isLoading || !patient) {
    return (
      <div className="view-panel active-view">
        <div className="diag-skeleton" role="status">
          <span className="sr-only">Loading patient data...</span>
          <Skeleton height="48px" className="skeleton--block" />
          <Skeleton height="72px" className="skeleton--block" />
          <div className="diag-skeleton-cards">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} height="132px" className="skeleton--block" />
            ))}
          </div>
          <Skeleton height="220px" className="skeleton--block" />
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
  const maxImpact = Math.max(0, ...riskFactors.map(rf => Math.abs(parseFloat(rf.impact)) || 0));

  const profileEntries = Object.entries(patient.clinical_features || {});
  const pq = profileQuery.trim().toLowerCase();
  const shownProfile = pq
    ? profileEntries.filter(([key, value]) =>
        `${formatFeatureName(key)} ${formatFeatureValue(key, value)}`.toLowerCase().includes(pq)
      )
    : profileEntries;

  const alertCount = eventLog.filter(ev => ev.isAlert).length;
  const shownLog = logFilter === 'alerts' ? keyedLog.filter(k => k.ev.isAlert) : keyedLog;

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

  // Spinner + double-submit guard around the unchanged handlers
  const withBusy = (key: string, fn: () => Promise<void>) => async () => {
    if (busyAction) return;
    setBusyAction(key);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  };

  const actionButton = (key: string, label: string, accent: string, icon: React.ReactNode, fn: () => Promise<void>) => (
    <button
      type="button"
      className={`btn-outline btn-rail accent-${accent}${busyAction === key ? ' is-busy' : ''}`}
      onClick={withBusy(key, fn)}
      disabled={busyAction !== null}
      aria-busy={busyAction === key}
    >
      {busyAction === key ? <IconSpinner /> : icon}
      {label}
    </button>
  );

  const copyId = () => {
    navigator.clipboard?.writeText(patient.patient_id).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined
    );
  };

  const riskFactorList = (
    <ul className="risk-factor-list">
      {riskFactors.map((rf, i) => {
        const magnitude = Math.abs(parseFloat(rf.impact)) || 0;
        const width = maxImpact > 0 ? (magnitude / maxImpact) * 100 : 0;
        return (
          <li key={i} className={`risk-factor ${rf.direction === 'up' ? 'accent-critical' : 'accent-healthy'}`}>
            <span className={`dot ${rf.direction === 'up' ? 'red' : 'green'}`} aria-hidden="true" />
            <span className="risk-factor-arrow">
              {rf.direction === 'up' ? <IconArrowUp /> : <IconArrowDown />}
            </span>
            <Popover
              content={
                <div className="pop-body">
                  <div className="pop-title">Model contribution {rf.impact}</div>
                  <div className="pop-muted">Positive values increase risk. Negative values lower it.</div>
                </div>
              }
            >
              <span className="risk-factor-label">{rf.label}</span>
            </Popover>
            <span className="risk-factor-direction">
              {rf.direction === 'up' ? 'Increases risk' : 'Lowers risk'}
            </span>
            <span
              className="risk-factor-bar"
              style={{ '--bar-width': `${width}%` } as React.CSSProperties}
              aria-hidden="true"
            />
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="view-panel active-view">
      {/* Action Banner & Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      
      <div className="action-toolbar" role="group" aria-label="Patient actions">
        {actionButton('adherent', 'Mark Adherent', 'healthy', <IconCheck />, handleMarkAdherent)}
        {actionButton('non-adherent', 'Mark Non-Adherent', 'critical', <IconCross />, handleMarkNonAdherent)}
        {actionButton('follow-up', 'Schedule Follow-up', 'warn', <IconCalendar />, handleScheduleFollowUp)}
        {actionButton('refill', 'Remind Refill', 'info', <IconPill />, handleRemindRefill)}
        {actionButton('appointment', 'Remind Appointment', 'primary', <IconBell />, handleRemindAppointment)}
      </div>

      {/* Patient Header */}
      <div className="patient-meta-banner">
        <div className="meta-col">
          <span className="meta-label">Patient</span>
          <span className="meta-value meta-value--mono">
            {shortId}
            <Popover content={<div className="pop-body">{copied ? 'Copied' : 'Copy full patient ID'}</div>}>
              <button
                type="button"
                className={`copy-btn${copied ? ' is-copied' : ''}`}
                onClick={copyId}
                aria-label={copied ? 'Patient ID copied' : 'Copy full patient ID'}
              >
                {copied ? <IconCheck /> : <IconCopy />}
              </button>
            </Popover>
          </span>
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
        <div className={`diagnostic-card spotlight ${isHighRisk ? 'accent-critical' : ''}`} onMouseMove={spotlight}>
          <div className="diag-title-wrapper">
            <div className="diag-title">ADHERENCE SCORE</div>
            <InfoTip label="About the adherence score">
              Estimated likelihood this patient is taking their medication as prescribed, from refill and
              appointment records.
            </InfoTip>
          </div>
          <div className="diag-value-wrapper diag-value-wrapper--ring">
            <div className={`diag-unified-val ${isHighRisk ? 'tone-critical' : ''}`}>
              {(patient.base_risk * 100).toFixed(1)}%
            </div>
            <ProgressRing value={patient.base_risk} tone={riskTone} size={44} />
          </div>
          <div className="diag-subtext-wrapper">
            <div className="diag-subtext">Estimated from health records</div>
          </div>
        </div>

        <div className={`diagnostic-card spotlight accent-${riskTone}`} onMouseMove={spotlight}>
          <div className="diag-title-wrapper">
            <div className="diag-title">RISK LEVEL</div>
            <InfoTip label="How risk level is set">
              High risk below 60% adherence, monitor from 60% to 80%, low risk at 80% and above.
            </InfoTip>
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

        <div className={`diagnostic-card spotlight accent-${confidenceTone}`} onMouseMove={spotlight}>
          <div className="diag-title-wrapper">
            <div className="diag-title">ASSESSMENT CONFIDENCE</div>
            <InfoTip label="How confidence is set">
              From the width of the 90% prediction range: under 25 points is high, 25 to 40 is moderate,
              40 or more is low. This patient's range is {(patient.confidence_interval_90.width * 100).toFixed(1)} points.
            </InfoTip>
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

        <div className="diagnostic-card spotlight" onMouseMove={spotlight}>
          <div className="diag-title-wrapper">
            <div className="diag-title">PATIENT PHASE</div>
            <InfoTip label="About patient phase">
              Behaviour pattern detected by a hidden Markov model over the patient's record history.
            </InfoTip>
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

      {/* Prediction confidence range */}
      <ConformalVisualizer
        pointEstimate={patient.base_risk}
        ci90={patient.confidence_interval_90}
        ci80={patient.confidence_interval_80}
        requiresReview={patient.requires_human_review}
        reviewReason={patient.review_reason ? reviewReasonToLabel(patient.review_reason) : null}
      />

      {/* Explanation & Intervention Grid */}
      <Reveal>
      <div className="diag-explain-grid">
        <div className="clinical-panel">
          <div className="panel-header">
            <span className="panel-title">Key Risk Factors</span>
          </div>
          <div className="panel-body">
            <Tabs
              label="Risk factor detail"
              items={[
                { id: 'top', label: 'Top factors', content: riskFactorList },
                {
                  id: 'all',
                  label: `All contributions (${Object.keys(patient.shap_explanation || {}).length})`,
                  content: <ShapPanel explanation={patient.shap_explanation || {}} />
                }
              ]}
            />
          </div>
        </div>
        <JitaiPanel isStressed={hrv.is_stressed} latestAlert={latestAlert} />
      </div>
      </Reveal>

      {/* Full Clinical Profile */}
      <Reveal>
      <CollapsiblePanel
        title="Full Clinical Profile"
        meta={`${profileEntries.length} features`}
        actions={
          <SearchField
            compact
            value={profileQuery}
            onChange={setProfileQuery}
            placeholder="Filter features"
            label="Filter clinical profile"
          />
        }
      >
        <div className="panel-body">
          <div className="profile-grid">
            {shownProfile.map(([key, value]) => (
              <div key={key} className="profile-item">
                <span className="profile-label">
                  {highlight(formatFeatureName(key), profileQuery)}
                </span>
                <span className="profile-value">
                  {highlight(formatFeatureValue(key, value), profileQuery)}
                </span>
              </div>
            ))}
            {pq && shownProfile.length === 0 && (
              <div className="profile-empty">No features match “{profileQuery.trim()}”.</div>
            )}
          </div>
        </div>
      </CollapsiblePanel>
      </Reveal>

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
            <div className="vital-mini-label-row">
              <span className="vital-mini-label">Heart Rate</span>
              <span
                className={`heartbeat${hrv.mean_hr_bpm > 0 ? ' is-beating' : ''}`}
                style={
                  hrv.mean_hr_bpm > 0
                    ? ({ '--beat-duration': `${Math.max(0.3, 60 / hrv.mean_hr_bpm)}s` } as React.CSSProperties)
                    : undefined
                }
                aria-hidden="true"
              >
                <IconHeart />
              </span>
            </div>
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
            <div className="vital-mini-label-row">
              <span className="vital-mini-label">Heart Rate Variability</span>
              <InfoTip label="About heart rate variability">
                SDNN: how much the time between heartbeats varies. Lower values can indicate stress.
              </InfoTip>
            </div>
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
            <div className="vital-mini-label-row">
              <span className="vital-mini-label">Stress Indicator</span>
            </div>
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
      <Reveal>
      <CollapsiblePanel
        title="Event Log"
        meta={`${eventLog.length} events`}
        actions={
          <ChipGroup<'all' | 'alerts'>
            label="Filter events"
            value={logFilter}
            onChange={setLogFilter}
            options={[
              { value: 'all', label: 'All', count: eventLog.length },
              { value: 'alerts', label: 'Alerts', count: alertCount, tone: 'critical' }
            ]}
          />
        }
      >
        <div className="panel-body">
          <div className="timeline-list">
            {shownLog.map(({ ev, key }) => (
              <div
                className={`timeline-item ${ev.isAlert ? 'is-alert' : 'is-info'}${
                  initialLogKeys.current && !initialLogKeys.current.has(key) ? ' is-new' : ''
                }`}
                key={key}
              >
                <span className="timeline-marker">
                  {ev.isAlert ? <IconAlert /> : <IconInfoDot />}
                </span>
                <span className="time-stamp">{ev.time}</span>
                <span className={`time-event ${ev.isAlert ? 'alert' : ''}`}>{ev.text}</span>
              </div>
            ))}
            {shownLog.length === 0 && <div className="timeline-empty">No alerts in this session.</div>}
          </div>
        </div>
      </CollapsiblePanel>
      </Reveal>
    </div>
  );
};
