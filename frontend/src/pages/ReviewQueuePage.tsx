import React, { useState } from 'react';
import { PatientSummary } from '../types';
import { clinicalStatusToLabel, reviewReasonToLabel } from '../lib/clinicalLabels';
import { submitAdherenceReview, scheduleFollowUp } from '../services/api';

interface ReviewQueuePageProps {
  patients: PatientSummary[];
  onSelectPatient: (id: string) => void;
  onRefresh?: () => void;
}

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
    <div className="view-panel active-view">
      <div className="page-intro">
        <h1 className="page-headline">Review Queue</h1>
        <p className="page-desc">
          These patients require clinical triage due to identified adherence risks or unusual behavior patterns.
        </p>
      </div>

      {toastMessage && (
        <div style={{ backgroundColor: 'var(--bg-accent)', color: 'var(--text-pure)', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
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
                <th>Adherence</th>
                <th>Flag Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviewPatients.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '30px' }}>
                    No patients currently need review.
                  </td>
                </tr>
              ) : (
                reviewPatients.map(p => {
                  return (
                    <tr key={p.patient_id}>
                      <td className="mono-val">{shortId(p.patient_id)}</td>
                      <td
                        className="mono-val"
                        style={{
                          color: p.base_risk < 0.60 ? 'var(--status-critical)' : 'var(--text-pure)'
                        }}
                      >
                        {(p.base_risk * 100).toFixed(1)}%
                      </td>
                      <td>
                        <span className="clinical-badge badge-high-risk">
                          {reviewReasonToLabel(p.review_reason)}
                        </span>
                      </td>
                      <td>
                        {p.clinical_status === 'High Risk' ? (
                          <span className="clinical-badge badge-high-risk">
                            <span className="dot red" />
                            {clinicalStatusToLabel(p.clinical_status)}
                          </span>
                        ) : p.clinical_status === 'Review Required' ? (
                          <span className="clinical-badge badge-monitor">
                            <span className="dot amber" />
                            {clinicalStatusToLabel(p.clinical_status)}
                          </span>
                        ) : (
                          <span className="clinical-badge badge-normal">
                            <span className="dot green" />
                            {clinicalStatusToLabel(p.clinical_status)}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            className="btn-action"
                            onClick={() => onSelectPatient(p.patient_id)}
                          >
                            View Details
                          </button>
                          <button
                            className="btn-action"
                            style={{ borderColor: 'var(--status-healthy)' }}
                            onClick={() => handleMarkAdherent(p.patient_id)}
                          >
                            Mark Adherent
                          </button>
                          <button
                            className="btn-action"
                            style={{ borderColor: 'var(--status-critical)' }}
                            onClick={() => handleMarkNonAdherent(p.patient_id)}
                          >
                            Mark Non-Adherent
                          </button>
                          <button
                            className="btn-action"
                            style={{ borderColor: 'var(--status-warn)' }}
                            onClick={() => handleScheduleFollowUp(p.patient_id)}
                          >
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
