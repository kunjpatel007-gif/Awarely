import React, { useState } from 'react';
import { PatientSummary } from '../types';
import { clinicalStatusToLabel, reviewReasonToLabel } from '../lib/clinicalLabels';
import { submitAdherenceReview, scheduleFollowUp } from '../services/api';
import {
  ChipGroup,
  IconCalendar,
  IconCheck,
  IconCross,
  IconEye,
  IconSpinner,
  Popover,
  Toast
} from '../components/ui';
import { PatientPreview, statusBadgeClass, statusDot, statusTone } from '../components/PatientPreview';

interface ReviewQueuePageProps {
  patients: PatientSummary[];
  onSelectPatient: (id: string) => void;
  onRefresh?: () => void;
}

type StatusFilter = 'all' | PatientSummary['clinical_status'];

export const ReviewQueuePage: React.FC<ReviewQueuePageProps> = ({
  patients,
  onSelectPatient,
  onRefresh
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const reviewPatients = [...patients.filter(p => p.requires_human_review)];
  
  // Sort by severity: High Risk first, then Review Required
  reviewPatients.sort((a, b) => {
    if (a.clinical_status === 'High Risk' && b.clinical_status !== 'High Risk') return -1;
    if (b.clinical_status === 'High Risk' && a.clinical_status !== 'High Risk') return 1;
    return (b.interval_width_90 || 0) - (a.interval_width_90 || 0);
  });

  const countOf = (s: PatientSummary['clinical_status']) => reviewPatients.filter(p => p.clinical_status === s).length;
  const shown = statusFilter === 'all' ? reviewPatients : reviewPatients.filter(p => p.clinical_status === statusFilter);

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

  // Per-row spinner + double-submit guard around the unchanged handlers
  const run = (pid: string, action: string, fn: (pid: string) => Promise<void>) => async () => {
    const key = `${pid}:${action}`;
    setBusy(key);
    try {
      await fn(pid);
    } finally {
      setBusy(b => (b === key ? null : b));
    }
  };

  const rowAction = (
    p: PatientSummary,
    action: string,
    label: string,
    accent: string,
    icon: React.ReactNode,
    fn: (pid: string) => Promise<void>
  ) => {
    const isBusy = busy === `${p.patient_id}:${action}`;
    const rowBusy = busy?.startsWith(`${p.patient_id}:`) ?? false;
    return (
      <button
        type="button"
        className={`btn-action accent-${accent}${isBusy ? ' is-busy' : ''}`}
        onClick={run(p.patient_id, action, fn)}
        disabled={rowBusy}
        aria-busy={isBusy}
      >
        {isBusy ? <IconSpinner /> : icon}
        {label}
      </button>
    );
  };

  return (
    <div className="view-panel active-view view-stagger">
      <div className="page-intro">
        <h1 className="page-headline">Review Queue</h1>
        <p className="page-desc">
          These patients require clinical triage due to identified adherence risks or unusual behavior patterns.
        </p>
      </div>

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">
            {reviewPatients.length} Patients Pending Review
          </span>
          <ChipGroup<StatusFilter>
            label="Filter by status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All', count: reviewPatients.length },
              { value: 'High Risk', label: clinicalStatusToLabel('High Risk'), count: countOf('High Risk'), tone: 'critical' },
              { value: 'Review Required', label: clinicalStatusToLabel('Review Required'), count: countOf('Review Required'), tone: 'warn' },
              ...(countOf('Nominal') > 0
                ? [{ value: 'Nominal' as const, label: clinicalStatusToLabel('Nominal'), count: countOf('Nominal'), tone: 'healthy' as const }]
                : [])
            ]}
          />
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
              ) : shown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-state-cell">
                    No patients in this group.
                  </td>
                </tr>
              ) : (
                shown.map(p => {
                  return (
                    <tr key={p.patient_id} className={`accent-${statusTone(p.clinical_status)}`}>
                      <td className="mono-val cell-id">
                        <Popover
                          variant="card"
                          placement="bottom"
                          delay={350}
                          content={<PatientPreview patient={p} />}
                        >
                          <span className="cell-id-text">{shortId(p.patient_id)}</span>
                        </Popover>
                      </td>
                      <td className={`mono-val num ${p.base_risk < 0.60 ? 'tone-critical' : 'tone-pure'}`}>
                        {(p.base_risk * 100).toFixed(1)}%
                      </td>
                      <td>
                        <Popover
                          display="block"
                          content={
                            <div className="pop-body">
                              <div className="pop-title">Model flag</div>
                              <div>{p.review_reason || 'No reason recorded'}</div>
                              <div className="pop-muted">
                                90% range width: {((p.interval_width_90 || 0) * 100).toFixed(0)} points
                              </div>
                            </div>
                          }
                        >
                          <span className="clinical-badge badge-high-risk badge-block">
                            {reviewReasonToLabel(p.review_reason)}
                          </span>
                        </Popover>
                      </td>
                      <td>
                        <span className={`clinical-badge ${statusBadgeClass(p.clinical_status)}`}>
                          <span className={`dot ${statusDot(p.clinical_status)}`} aria-hidden="true" />
                          {clinicalStatusToLabel(p.clinical_status)}
                        </span>
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
                          {rowAction(p, 'adherent', 'Mark Adherent', 'healthy', <IconCheck />, handleMarkAdherent)}
                          {rowAction(p, 'non-adherent', 'Mark Non-Adherent', 'critical', <IconCross />, handleMarkNonAdherent)}
                          {rowAction(p, 'follow-up', 'Schedule Follow-up', 'warn', <IconCalendar />, handleScheduleFollowUp)}
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
