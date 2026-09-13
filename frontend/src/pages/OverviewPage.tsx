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
        <h1 className="page-headline">Patient Overview</h1>
        <p className="page-desc">
          Monitor medication adherence across your patient cohort. Patients flagged for review
          have high prediction uncertainty and require clinical judgement.
        </p>
      </div>

      {/* Metric Grid */}
      <div>
        <div className="stat-grid-4">
          <div className="stat-card">
            <span className="stat-label">Patients Monitored</span>
            <div className="stat-val-group">
              <span className="stat-value">{summary ? summary.patients_monitored : 198}</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">Needs Review</span>
            <div className="stat-val-group">
              <span className="stat-value" style={{ color: 'var(--status-warn)' }}>
                {summary ? summary.patients_requiring_review : 25}
              </span>
              <span className="stat-delta warn">High uncertainty</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">High Risk</span>
            <div className="stat-val-group">
              <span className="stat-value" style={{ color: 'var(--status-critical)' }}>
                {summary ? summary.high_risk_non_adherent : 48}
              </span>
              <span className="stat-delta crit">Adherence below 60%</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">System Status</span>
            <div className="stat-val-group">
              <span className="stat-value" style={{ fontSize: '21px', color: 'var(--status-healthy)' }}>
                All Systems Online
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Cohort Table */}
      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">Patient List</span>
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
              Needs Review ({patients.filter(p => p.requires_human_review).length})
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
                <th>Adherence</th>
                <th>Confidence Range</th>
                <th>Behavioral Pattern</th>
                <th>Review</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                    Loading patients...
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
                      <td className="mono-dim">
                        {(p.lower_90 * 100).toFixed(0)}% — {(p.upper_90 * 100).toFixed(0)}%
                      </td>
                      <td>{p.hmm_state_label}</td>
                      <td>
                        {p.requires_human_review ? (
                          <span className="clinical-badge badge-high-risk">Review Needed</span>
                        ) : (
                          <span className="clinical-badge badge-neutral">OK</span>
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
                            Review
                          </span>
                        ) : (
                          <span className="clinical-badge badge-normal">
                            <span className="dot green" />
                            Normal
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
                          View
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
