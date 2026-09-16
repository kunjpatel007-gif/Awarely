import React, { useMemo, useRef, useState } from 'react';
import { CohortSummary, PatientSummary } from '../types';

import { hmmStateToLabel, clinicalStatusToLabel } from '../lib/clinicalLabels';
import {
  AnimatedNumber,
  IconSortAsc,
  IconSortDesc,
  IconSortNone,
  InfoTip,
  Popover,
  RangeBar,
  SearchField,
  spotlight,
  useIndicator
} from '../components/ui';
import { PatientPreview, statusBadgeClass, statusDot, statusTone } from '../components/PatientPreview';

interface OverviewPageProps {
  summary: CohortSummary | null;
  patients: PatientSummary[];
  onSelectPatient: (patientId: string) => void;
  isLoading: boolean;
}

type SortKey = 'id' | 'adherence' | 'range';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

// First click sorts the clinically useful way: lowest adherence / widest range first
const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = { id: 'asc', adherence: 'asc', range: 'desc' };
const MAX_ROWS = 50;

export const OverviewPage: React.FC<OverviewPageProps> = ({
  summary,
  patients,
  onSelectPatient,
  isLoading
}) => {
  const [filter, setFilter] = useState<'all' | 'review' | 'highrisk'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [focusedRow, setFocusedRow] = useState<string | null>(null);
  const segmentedRef = useRef<HTMLDivElement | null>(null);

  useIndicator(segmentedRef, '.btn-outline.active', [filter]);

  const shortId = (pid: string) => pid.replace('test-patient-', 'P-');

  const filteredPatients = useMemo(
    () =>
      patients.filter(p => {
        if (filter === 'review') return p.requires_human_review || p.clinical_status === 'Review Required';
        if (filter === 'highrisk') return p.clinical_status === 'High Risk' || p.base_risk < 0.60;
        return true;
      }),
    [patients, filter]
  );

  const q = query.trim().toLowerCase();
  const searched = useMemo(
    () =>
      q
        ? filteredPatients.filter(
            p => p.patient_id.toLowerCase().includes(q) || shortId(p.patient_id).toLowerCase().includes(q)
          )
        : filteredPatients,
    [filteredPatients, q]
  );

  const sorted = useMemo(() => {
    if (!sort) return searched;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...searched].sort((a, b) => {
      if (sort.key === 'id') return a.patient_id.localeCompare(b.patient_id, undefined, { numeric: true }) * dir;
      if (sort.key === 'adherence') return (a.base_risk - b.base_risk) * dir;
      return ((a.interval_width_90 || 0) - (b.interval_width_90 || 0)) * dir;
    });
  }, [searched, sort]);

  const visible = sorted.slice(0, MAX_ROWS);

  const reviewCount = useMemo(
    () => patients.filter(p => p.requires_human_review || p.clinical_status === 'Review Required').length,
    [patients]
  );
  const highRiskCount = useMemo(
    () => patients.filter(p => p.clinical_status === 'High Risk' || p.base_risk < 0.60).length,
    [patients]
  );

  const toggleSort = (key: SortKey) =>
    setSort(s => {
      if (!s || s.key !== key) return { key, dir: FIRST_DIR[key] };
      if (s.dir === FIRST_DIR[key]) return { key, dir: FIRST_DIR[key] === 'asc' ? 'desc' : 'asc' };
      return null;
    });

  // Plain render function (not a component) so buttons keep focus across the
  // app's high-frequency telemetry re-renders.
  const sortHeader = (label: string, key: SortKey, numeric = false) => {
    const active = sort?.key === key;
    return (
      <th
        className={numeric ? 'num' : undefined}
        aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" className={`th-sort${active ? ' is-active' : ''}`} onClick={() => toggleSort(key)}>
          {label}
          <span className="th-sort-icon">
            {active ? sort?.dir === 'asc' ? <IconSortAsc /> : <IconSortDesc /> : <IconSortNone />}
          </span>
        </button>
      </th>
    );
  };

  const models = summary
    ? [
        { label: 'Confidence ranges (CQR)', on: summary.models_active.cqr_mapie },
        { label: 'Behaviour phases (HMM)', on: summary.models_active.hmm_cognitive },
        { label: 'Explanations (SHAP)', on: summary.models_active.shap_explainer },
        { label: 'Stress reminders (JITAI)', on: summary.models_active.jitai_biosignal }
      ]
    : null;

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
          <div className="stat-card spotlight" onMouseMove={spotlight}>
            <div className="stat-label-row">
              <span className="stat-label">Patients Monitored</span>
              <InfoTip label="About patients monitored">Patients with records in the current cohort.</InfoTip>
            </div>
            <div className="stat-val-group">
              <span className="stat-value">
                <AnimatedNumber value={summary ? summary.patients_monitored : 198} />
              </span>
            </div>
            <span className="stat-card-rule accent-info" aria-hidden="true" />
          </div>
          <div className="stat-card spotlight" onMouseMove={spotlight}>
            <div className="stat-label-row">
              <span className="stat-label">Needs Review</span>
              <InfoTip label="About needs review">
                Patients whose prediction is too uncertain to act on without a clinician.
              </InfoTip>
            </div>
            <div className="stat-val-group">
              <span className="stat-value tone-warn">
                <AnimatedNumber value={summary ? summary.patients_requiring_review : 25} />
              </span>
              <span className="stat-delta warn">High uncertainty</span>
            </div>
            <span className="stat-card-rule accent-warn" aria-hidden="true" />
          </div>
          <div className="stat-card spotlight" onMouseMove={spotlight}>
            <div className="stat-label-row">
              <span className="stat-label">High Risk</span>
              <InfoTip label="About high risk">Patients whose estimated adherence is below 60%.</InfoTip>
            </div>
            <div className="stat-val-group">
              <span className="stat-value tone-critical">
                <AnimatedNumber value={summary ? summary.high_risk_non_adherent : 48} />
              </span>
              <span className="stat-delta crit">Adherence below 60%</span>
            </div>
            <span className="stat-card-rule accent-critical" aria-hidden="true" />
          </div>
          <div className="stat-card spotlight" onMouseMove={spotlight}>
            <div className="stat-label-row">
              <span className="stat-label">System Status</span>
              <InfoTip label="Model status">
                <div className="pop-title">Model status</div>
                {models ? (
                  <ul className="pop-list">
                    {models.map(m => (
                      <li key={m.label}>
                        <span className={`dot ${m.on ? 'green' : 'dim'}`} aria-hidden="true" />
                        {m.label}
                        <span className="pop-list-state">{m.on ? 'Active' : 'Off'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="pop-muted">Waiting for the server to report model status.</div>
                )}
              </InfoTip>
            </div>
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
          <div className="panel-tools">
            <SearchField value={query} onChange={setQuery} placeholder="Search patient ID" label="Search patients by ID" />
            <div className="segmented" role="group" aria-label="Filter patients" ref={segmentedRef}>
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
                Needs Review ({reviewCount})
              </button>
              <button
                type="button"
                className={`btn-outline ${filter === 'highrisk' ? 'active' : ''}`}
                onClick={() => setFilter('highrisk')}
                aria-pressed={filter === 'highrisk'}
              >
                High Risk ({highRiskCount})
              </button>
              <span className="seg-indicator" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clinical-table">
            <thead>
              <tr>
                {sortHeader('Patient ID', 'id')}
                {sortHeader('Adherence', 'adherence', true)}
                {sortHeader('Score Range', 'range', true)}
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
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-state-cell">
                    {q ? `No patients match “${query.trim()}”.` : 'No patients match the selected filter.'}
                  </td>
                </tr>
              ) : (
                visible.map(p => {
                  const isCritical = p.base_risk < 0.60;
                  const displayHmm = hmmStateToLabel(p.hmm_state);
                  const displayStatus = clinicalStatusToLabel(p.clinical_status);

                  return (
                    <tr
                      key={p.patient_id}
                      className={`clickable-row accent-${statusTone(p.clinical_status)}`}
                      onClick={() => onSelectPatient(p.patient_id)}
                      tabIndex={0}
                      role="button"
                      onFocus={e => {
                        let keyboard = false;
                        try {
                          keyboard = e.currentTarget.matches(':focus-visible');
                        } catch {
                          keyboard = false;
                        }
                        if (keyboard) setFocusedRow(p.patient_id);
                      }}
                      onBlur={() => setFocusedRow(r => (r === p.patient_id ? null : r))}
                      onKeyDown={e => {
                        // Only the row itself — keys on the inner button must not double-fire.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectPatient(p.patient_id);
                        }
                      }}
                    >
                      <td className="mono-val cell-id">
                        <Popover
                          variant="card"
                          placement="bottom"
                          delay={350}
                          forceOpen={focusedRow === p.patient_id}
                          content={<PatientPreview patient={p} hint="Click or press Enter to open details" />}
                        >
                          <span className="cell-id-text">{shortId(p.patient_id)}</span>
                        </Popover>
                      </td>
                      <td className={`mono-val num ${isCritical ? 'tone-critical' : ''}`}>
                        {(p.base_risk * 100).toFixed(1)}%
                      </td>
                      <td className="mono-dim num">
                        <span className="range-cell">
                          {(p.lower_90 * 100).toFixed(0)}% — {(p.upper_90 * 100).toFixed(0)}%
                          <RangeBar lower={p.lower_90} upper={p.upper_90} point={p.base_risk} tone={statusTone(p.clinical_status)} />
                        </span>
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
                        <span className={`clinical-badge ${statusBadgeClass(p.clinical_status)}`}>
                          <span className={`dot ${statusDot(p.clinical_status)}`} aria-hidden="true" />
                          {displayStatus}
                        </span>
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

        {!isLoading && (
          <div className="table-meta">
            <span>
              Showing <strong>{visible.length}</strong> of <strong>{sorted.length}</strong> patients
              {sorted.length > MAX_ROWS ? '. Search or sort to reach the rest.' : ''}
            </span>
            {sort && (
              <button type="button" className="link-btn" onClick={() => setSort(null)}>
                Clear sort
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
