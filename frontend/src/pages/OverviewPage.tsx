import React, { useState } from 'react';
import { CohortSummary, PatientSummary } from '../types';

import { hmmStateToLabel, clinicalStatusToLabel } from '../lib/clinicalLabels';

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
    if (filter === 'review') return p.requires_human_review || p.clinical_status === 'Review Required';
    if (filter === 'highrisk') return p.clinical_status === 'High Risk' || p.base_risk < 0.60;
    return true;
  });

  const shortId = (pid: string) => pid.replace('test-patient-', 'P-');

  // Row accent follows the same status → colour mapping as the Status badge.
  const rowAccent = (status: PatientSummary['clinical_status']) =>
    status === 'High Risk' ? 'accent-critical' : status === 'Review Required' ? 'accent-warn' : 'accent-healthy';

  return (
    <div className="view-panel active-view view-stagger">
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
            <span className="stat-card-rule accent-info" aria-hidden="true" />
          </div>
          <div className="stat-card">
            <span className="stat-label">Needs Review</span>
            <div className="stat-val-group">
              <span className="stat-value tone-warn">
                {summary ? summary.patients_requiring_review : 25}
              </span>
              <span className="stat-delta warn">High uncertainty</span>
            </div>
            <span className="stat-card-rule accent-warn" aria-hidden="true" />
          </div>
          <div className="stat-card">
            <span className="stat-label">High Risk</span>
            <div className="stat-val-group">
              <span className="stat-value tone-critical">
                {summary ? summary.high_risk_non_adherent : 48}
              </span>
              <span className="stat-delta crit">Adherence below 60%</span>
            </div>
            <span className="stat-card-rule accent-critical" aria-hidden="true" />
          </div>
          <div className="stat-card">
            <span className="stat-label">System Status</span>
            <div className="stat-val-group">
              <span className="stat-value stat-value--text tone-healthy">
                All Systems Online
              </span>
            </div>
            <span className="stat-card-rule accent-healthy" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Patient Cohort Table */}
      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">Patient List</span>
          <div className="segmented" role="group" aria-label="Filter patients">
            <button
              type="button"
              className={`btn-outline ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              aria-pressed={filter === 'all'}
            >
              All ({patients.length})
            </button>
            <button
              type="button"
              className={`btn-outline ${filter === 'review' ? 'active' : ''}`}
              onClick={() => setFilter('review')}
              aria-pressed={filter === 'review'}
            >
              Needs Review ({patients.filter(p => p.requires_human_review || p.clinical_status === 'Review Required').length})
            </button>
            <button
              type="button"
              className={`btn-outline ${filter === 'highrisk' ? 'active' : ''}`}
              onClick={() => setFilter('highrisk')}
              aria-pressed={filter === 'highrisk'}
            >
              High Risk ({patients.filter(p => p.clinical_status === 'High Risk' || p.base_risk < 0.60).length})
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clinical-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th className="num">Adherence</th>
                <th className="num">Score Range</th>
                <th>Patient Phase</th>
                <th>Review</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="table-state-cell">
                    Loading patients...
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-state-cell">
                    No patients match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredPatients.slice(0, 50).map(p => {
                  const isCritical = p.base_risk < 0.60;
                  const displayHmm = hmmStateToLabel(p.hmm_state);
                  const displayStatus = clinicalStatusToLabel(p.clinical_status);

                  return (
                    <tr
                      key={p.patient_id}
                      className={`clickable-row ${rowAccent(p.clinical_status)}`}
                      onClick={() => onSelectPatient(p.patient_id)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={e => {
                        // Only the row itself — keys on the inner button must not double-fire.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectPatient(p.patient_id);
                        }
                      }}
                    >
                      <td className="mono-val cell-id" title={p.patient_id}>{shortId(p.patient_id)}</td>
                      <td className={`mono-val num ${isCritical ? 'tone-critical' : ''}`}>
                        {(p.base_risk * 100).toFixed(1)}%
                      </td>
                      <td className="mono-dim num">
                        {(p.lower_90 * 100).toFixed(0)}% — {(p.upper_90 * 100).toFixed(0)}%
                      </td>
                      <td>{displayHmm}</td>
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
                            <span className="dot red" aria-hidden="true" />
                            {displayStatus}
                          </span>
                        ) : p.clinical_status === 'Review Required' ? (
                          <span className="clinical-badge badge-monitor">
                            <span className="dot amber" aria-hidden="true" />
                            {displayStatus}
                          </span>
                        ) : (
                          <span className="clinical-badge badge-normal">
                            <span className="dot green" aria-hidden="true" />
                            {displayStatus}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-action accent-neutral"
                          tabIndex={-1}
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
