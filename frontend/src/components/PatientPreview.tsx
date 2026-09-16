import React from 'react';
import { PatientSummary } from '../types';
import { hmmStateToLabel, clinicalStatusToLabel, reviewReasonToLabel } from '../lib/clinicalLabels';
import { RangeBar } from './ui';

type Status = PatientSummary['clinical_status'];

/** Same status → colour mapping used by every badge in the app. */
export const statusTone = (s: Status): 'critical' | 'warn' | 'healthy' =>
  s === 'High Risk' ? 'critical' : s === 'Review Required' ? 'warn' : 'healthy';
export const statusBadgeClass = (s: Status): string =>
  s === 'High Risk' ? 'badge-high-risk' : s === 'Review Required' ? 'badge-monitor' : 'badge-normal';
export const statusDot = (s: Status): string => (s === 'High Risk' ? 'red' : s === 'Review Required' ? 'amber' : 'green');

/** Hover-card body. Uses only fields already present on PatientSummary. */
export const PatientPreview: React.FC<{ patient: PatientSummary; hint?: string }> = ({ patient: p, hint }) => (
  <div className="preview">
    <div className="preview-head">
      <div>
        <div className="preview-id">{p.patient_id.replace('test-patient-', 'P-')}</div>
        <div className="preview-full-id">{p.patient_id}</div>
      </div>
      <span className={`clinical-badge ${statusBadgeClass(p.clinical_status)}`}>
        <span className={`dot ${statusDot(p.clinical_status)}`} aria-hidden="true" />
        {clinicalStatusToLabel(p.clinical_status)}
      </span>
    </div>

    <div className="preview-metric">
      <span className={`preview-value${p.base_risk < 0.60 ? ' tone-critical' : ''}`}>
        {(p.base_risk * 100).toFixed(1)}%
      </span>
      <span className="preview-caption">estimated adherence</span>
    </div>

    <div className="preview-range">
      <RangeBar size="md" lower={p.lower_90} upper={p.upper_90} point={p.base_risk} tone={statusTone(p.clinical_status)} />
      <div className="preview-range-labels">
        <span>{(p.lower_90 * 100).toFixed(0)}%</span>
        <span>90% range</span>
        <span>{(p.upper_90 * 100).toFixed(0)}%</span>
      </div>
    </div>

    <dl className="preview-rows">
      <dt>Patient phase</dt>
      <dd>{hmmStateToLabel(p.hmm_state)}</dd>
      <dt>Review</dt>
      <dd>{p.requires_human_review ? reviewReasonToLabel(p.review_reason) : 'Not flagged'}</dd>
      {p.medications && p.medications.length > 0 && (
        <>
          <dt>Medications</dt>
          <dd>{p.medications.map(m => m.name).join(', ')}</dd>
        </>
      )}
      {p.is_hardware_patient && (
        <>
          <dt>Sensor</dt>
          <dd>Live hardware</dd>
        </>
      )}
    </dl>

    {hint && <div className="preview-hint">{hint}</div>}
  </div>
);
