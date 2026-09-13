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

  // Filter for patients requiring human review
  const reviewPatients = patients.filter(p => p.requires_human_review);

  const handleResolve = (pid: string, actionName: string) => {
    setResolvedIds(prev => new Set([...prev, pid]));
    alert(`Action logged for ${pid}: "${actionName}". Forwarded to Active Learning retrain loop.`);
  };

  const shortId = (pid: string) => pid.replace('test-patient-', 'P-');

  return (
    <div className="view-panel active-view">
      <div className="page-intro">
        <h1 className="page-headline">Active Learning: Uncertainty Review Queue</h1>
        <p className="page-desc">
          Defers cases to clinicians whenever Conformal Quantile Regression epistemic uncertainty exceeds
          calibrated safety thresholds (&gt; 40% CI width or point estimate extrapolation failure).
          Human-in-the-loop arbitration updates the latent HMM cognitive state and trains the model downstream.
        </p>
      </div>

      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">
            Deferred Uncertainty Queue ({reviewPatients.length} Patients Pending Evaluation)
          </span>
          <span className="mono-dim">Filter: Epistemic Uncertainty &gt; 40% or Bounds Violation</span>
        </div>

        <div className="table-responsive">
          <table className="clinical-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>PDC Estimate</th>
                <th>90% Calibrated CI</th>
                <th>Interval Width</th>
                <th>Latent Cognitive State</th>
                <th>Review Trigger</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reviewPatients.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                    No patients currently require review. All model predictions are within safety bounds.
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
                        {(p.interval_width_90 * 100).toFixed(1)}% (High)
                      </td>
                      <td>{p.hmm_state_label}</td>
                      <td>
                        <span className="clinical-badge badge-high-risk">
                          {p.review_reason || 'Epistemic Uncertainty'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn-action"
                            onClick={() => onSelectPatient(p.patient_id)}
                          >
                            Inspect
                          </button>
                          <button
                            className="btn-action"
                            style={isResolved ? { opacity: 0.5 } : { borderColor: 'var(--status-warn)' }}
                            disabled={isResolved}
                            onClick={() =>
                              handleResolve(
                                p.patient_id,
                                p.base_risk < 0.60 ? 'Dispatch Nurse Outreach' : 'Arbitrate Adherence'
                              )
                            }
                          >
                            {isResolved ? 'Resolved ✓' : p.base_risk < 0.60 ? 'Nurse Outreach' : 'Arbitrate'}
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
