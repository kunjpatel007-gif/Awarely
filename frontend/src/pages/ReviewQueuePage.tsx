import React, { useState } from 'react';
import { PatientSummary } from '../types';
import { clinicalStatusToLabel, reviewReasonToLabel } from '../lib/clinicalLabels';
import { submitAdherenceReview, scheduleFollowUp } from '../services/api';

interface ReviewQueuePageProps {
  patients: PatientSummary[];
  onSelectPatient: (id: string) => void;
  onRefresh?: () => void;
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
const IconEye = () => (
  <Svg>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);
const IconCheck = () => <Svg><path d="M3 8.5l3.2 3L13 4.5" /></Svg>;
const IconCross = () => <Svg><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
const IconCalendar = () => (
  <Svg>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </Svg>
);

export const ReviewQueuePage: React.FC<ReviewQueuePageProps> = ({
  patients,
  onSelectPatient,
  onRefresh
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const reviewPatients = [...patients.filter(p => p.requires_human_review)];
  
  // Sort by severity: High Risk first, then Review Required
  reviewPatients.sort((a, b) => {
    if (a.clinical_status === 'High Risk' && b.clinical_status !== 'High Risk') return -1;
    if (b.clinical_status === 'High Risk' && a.clinical_status !== 'High Risk') return 1;
    return (b.interval_width_90 || 0) - (a.interval_width_90 || 0);
  });

  const shortId = (pid: string) => pid.replace('test-patient-', 'P-');

  // Row accent follows the same status → colour mapping as the Status badge.
  const rowAccent = (status: PatientSummary['clinical_status']) =>
    status === 'High Risk' ? 'accent-critical' : status === 'Review Required' ? 'accent-warn' : 'accent-healthy';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleMarkAdherent = async (pid: string) => {
    try {
      await submitAdherenceReview(pid, 'adherent');
      showToast(`Marked ${shortId(pid)} as Adherent`);
      onRefresh?.();
    } catch (err) {
      console.error(err);
      showToast(`Failed to update ${shortId(pid)}`);
    }
  };

  const handleMarkNonAdherent = async (pid: string) => {
    try {
      await submitAdherenceReview(pid, 'non_adherent');
      showToast(`Marked ${shortId(pid)} as Non-Adherent`);
      onRefresh?.();
    } catch (err) {
      console.error(err);
      showToast(`Failed to update ${shortId(pid)}`);
    }
  };

  const handleScheduleFollowUp = async (pid: string) => {
    try {
      const res = await scheduleFollowUp(pid, new Date().toISOString(), 'Follow-up from review queue');
      showToast(`Scheduled Follow-up for ${shortId(pid)}`);
      if (res && res.email_dispatched) {
        alert("Automated Email Dispatched:\n\n" + res.email_dispatched);
      }
      onRefresh?.();
    } catch (err) {
      console.error(err);
      showToast(`Failed to schedule ${shortId(pid)}`);
    }
  };

  return (
    <div className="view-panel active-view view-stagger">
      <div className="page-intro">
        <h1 className="page-headline">Review Queue</h1>
        <p className="page-desc">
          These patients require clinical triage due to identified adherence risks or unusual behavior patterns.
        </p>
      </div>

      {toastMessage && (
        <div className="action-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">
            {reviewPatients.length} Patients Pending Review
          </span>
        </div>

        <div className="table-responsive">
          <table className="clinical-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th className="num">Adherence</th>
                <th>Flag Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviewPatients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-state-cell">
                    <div className="empty-state">
                      <span className="empty-state-mark" aria-hidden="true" />
                      No patients currently need review.
                    </div>
                  </td>
                </tr>
              ) : (
                reviewPatients.map(p => {
                  return (
                    <tr key={p.patient_id} className={rowAccent(p.clinical_status)}>
                      <td className="mono-val cell-id" title={p.patient_id}>{shortId(p.patient_id)}</td>
                      <td className={`mono-val num ${p.base_risk < 0.60 ? 'tone-critical' : 'tone-pure'}`}>
                        {(p.base_risk * 100).toFixed(1)}%
                      </td>
                      <td>
                        <span className="clinical-badge badge-high-risk badge-block">
                          {reviewReasonToLabel(p.review_reason)}
                        </span>
                      </td>
                      <td>
                        {p.clinical_status === 'High Risk' ? (
                          <span className="clinical-badge badge-high-risk">
                            <span className="dot red" aria-hidden="true" />
                            {clinicalStatusToLabel(p.clinical_status)}
                          </span>
                        ) : p.clinical_status === 'Review Required' ? (
                          <span className="clinical-badge badge-monitor">
                            <span className="dot amber" aria-hidden="true" />
                            {clinicalStatusToLabel(p.clinical_status)}
                          </span>
                        ) : (
                          <span className="clinical-badge badge-normal">
                            <span className="dot green" aria-hidden="true" />
                            {clinicalStatusToLabel(p.clinical_status)}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-action accent-neutral"
                            onClick={() => onSelectPatient(p.patient_id)}
                          >
                            <IconEye />
                            View Details
                          </button>
                          <button
                            type="button"
                            className="btn-action accent-healthy"
                            onClick={() => handleMarkAdherent(p.patient_id)}
                          >
                            <IconCheck />
                            Mark Adherent
                          </button>
                          <button
                            type="button"
                            className="btn-action accent-critical"
                            onClick={() => handleMarkNonAdherent(p.patient_id)}
                          >
                            <IconCross />
                            Mark Non-Adherent
                          </button>
                          <button
                            type="button"
                            className="btn-action accent-warn"
                            onClick={() => handleScheduleFollowUp(p.patient_id)}
                          >
                            <IconCalendar />
                            Schedule Follow-up
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
