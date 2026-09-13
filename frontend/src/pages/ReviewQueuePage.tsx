import React, { useState } from 'react';
import { PatientSummary } from '../types';

interface ReviewQueuePageProps {
  patients: PatientSummary[];
  onSelectPatient: (patientId: string) => void;
}

export const ReviewQueuePage: React.FC<ReviewQueuePageProps> = ({
  patients,
  onSelectPatient
}) => {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const reviewPatients = patients.filter(p => p.requires_human_review);

  const handleResolve = (pid: string, actionName: string) => {
    setResolvedIds(prev => new Set([...prev, pid]));
    alert(`Action logged for ${pid}: "${actionName}". Patient flagged for follow-up.`);
  };

  const shortId = (pid: string) => pid.replace('test-patient-', 'P-');

  return (
    <div className="view-panel active-view">
      <div className="page-intro">
        <h1 className="page-headline">Review Queue</h1>
        <p className="page-desc">
          These patients have been flagged because our prediction model is not confident enough
          to make an automated assessment. A clinician should review the data and decide
          on the appropriate next step.
        </p>
      </div>

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
                <th>Confidence Range</th>
                <th>Uncertainty</th>
                <th>Behavioral Pattern</th>
                <th>Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reviewPatients.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                    No patients currently need review. All predictions are within safe bounds.
                  </td>
                </tr>
              ) : (
                reviewPatients.map(p => {
                  const isResolved = resolvedIds.has(p.patient_id);

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
                      <td className="mono-dim">
                        {(p.lower_90 * 100).toFixed(0)}% — {(p.upper_90 * 100).toFixed(0)}%
                      </td>
                      <td className="mono-val" style={{ color: 'var(--status-warn)' }}>
                        {(p.interval_width_90 * 100).toFixed(1)}%
                      </td>
                      <td>{p.hmm_state_label}</td>
                      <td>
                        <span className="clinical-badge badge-high-risk">
                          {p.review_reason || 'High Uncertainty'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn-action"
                            onClick={() => onSelectPatient(p.patient_id)}
                          >
                            View
                          </button>
                          <button
                            className="btn-action"
                            style={isResolved ? { opacity: 0.5 } : { borderColor: 'var(--status-warn)' }}
                            disabled={isResolved}
                            onClick={() =>
                              handleResolve(
                                p.patient_id,
                                p.base_risk < 0.60 ? 'Schedule Nurse Visit' : 'Review Adherence'
                              )
                            }
                          >
                            {isResolved ? 'Done ✓' : p.base_risk < 0.60 ? 'Nurse Visit' : 'Review'}
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
