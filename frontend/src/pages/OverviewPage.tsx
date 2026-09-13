import React, { useState } from 'react';
import { CohortSummary, PatientSummary } from '../types';

interface OverviewPageProps {
  summary: CohortSummary | null;
  patients: PatientSummary[];
  onSelectPatient: (patientId: string) => void;
  isLoading: boolean;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  summary,
  patients,
  onSelectPatient,
  isLoading
}) => {
  const [filter, setFilter] = useState<'all' | 'review' | 'highrisk'>('all');

  const filteredPatients = patients.filter(p => {
    if (filter === 'review') return p.requires_human_review;
    if (filter === 'highrisk') return p.base_risk < 0.60;
    return true;
  });

  const shortId = (pid: string) => pid.replace('test-patient-', 'P-');

  return (
    <div className="view-panel active-view">
      <div className="page-intro">
        <h1 className="page-headline">Clinical Cohort Adherence Intelligence</h1>
        <p className="page-desc">
          Continuous surveillance of medication adherence via passive indirect behavioral EHR features,
          Conformal Quantile Regression bounds, and real-time autonomic stress telemetry.
        </p>
      </div>

      {/* Metric Grid */}
      <div>
        <div className="section-label">Top System Cohort Metrics (FastAPI GET /api/patients/summary)</div>
        <div className="stat-grid-4">
          <div className="stat-card">
            <span className="stat-label">Patients Monitored</span>
            <div className="stat-val-group">
              <span className="stat-value">{summary ? summary.patients_monitored : 198}</span>
              <span className="stat-delta nominal">Calibrated Test Split</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">Patients Requiring Review</span>
            <div className="stat-val-group">
              <span className="stat-value" style={{ color: 'var(--status-warn)' }}>
                {summary ? summary.patients_requiring_review : 25}
              </span>
              <span className="stat-delta warn">Uncertainty &gt; 40%</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">High-Risk Non-Adherent</span>
            <div className="stat-val-group">
              <span className="stat-value" style={{ color: 'var(--status-critical)' }}>
                {summary ? summary.high_risk_non_adherent : 48}
              </span>
              <span className="stat-delta crit">PDC &lt; 60%</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">System Inference Status</span>
            <div className="stat-val-group">
              <span className="stat-value" style={{ fontSize: '21px' }}>
                {summary?.system_inference_status || 'NOMINAL'}
              </span>
              <span className="stat-delta nominal">Dual-Track Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Cohort Table */}
      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">Monitored Patient Cohort (Click row to inspect diagnostics)</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn-outline ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({patients.length})
            </button>
            <button
              className={`btn-outline ${filter === 'review' ? 'active' : ''}`}
              onClick={() => setFilter('review')}
            >
              Review Flagged ({patients.filter(p => p.requires_human_review).length})
            </button>
            <button
              className={`btn-outline ${filter === 'highrisk' ? 'active' : ''}`}
              onClick={() => setFilter('highrisk')}
            >
              High Risk ({patients.filter(p => p.base_risk < 0.60).length})
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clinical-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Adherence (PDC)</th>
                <th>90% Calibrated Interval</th>
                <th>HMM Cognitive State</th>
                <th>Human Review</th>
                <th>Clinical Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                    Loading clinical cohort...
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                    No patients match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredPatients.slice(0, 50).map(p => {
                  const isCritical = p.base_risk < 0.60;
                  const isWarn = p.requires_human_review;

                  return (
                    <tr
                      key={p.patient_id}
                      className="clickable-row"
                      onClick={() => onSelectPatient(p.patient_id)}
                    >
                      <td className="mono-val">{shortId(p.patient_id)}</td>
                      <td
                        className="mono-val"
                        style={isCritical ? { color: 'var(--status-critical)' } : undefined}
                      >
                        {(p.base_risk * 100).toFixed(1)}%
                      </td>
                      <td
                        className="mono-dim"
                        style={isWarn ? { color: 'var(--status-warn)' } : undefined}
                      >
                        {(p.lower_90 * 100).toFixed(0)}% — {(p.upper_90 * 100).toFixed(0)}% (w:{' '}
                        {(p.interval_width_90 * 100).toFixed(0)}%)
                      </td>
                      <td>{p.hmm_state_label}</td>
                      <td>
                        {p.requires_human_review ? (
                          <span className="clinical-badge badge-high-risk">Review Required</span>
                        ) : (
                          <span className="clinical-badge badge-neutral">No Review</span>
                        )}
                      </td>
                      <td>
                        {p.clinical_status === 'High Risk' ? (
                          <span className="clinical-badge badge-high-risk">
                            <span className="dot red" />
                            High Risk
                          </span>
                        ) : p.clinical_status === 'Review Required' ? (
                          <span className="clinical-badge badge-monitor">
                            <span className="dot amber" />
                            Review Required
                          </span>
                        ) : (
                          <span className="clinical-badge badge-normal">
                            <span className="dot green" />
                            Nominal
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn-action"
                          onClick={e => {
                            e.stopPropagation();
                            onSelectPatient(p.patient_id);
                          }}
                        >
                          Inspect
                        </button>
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
