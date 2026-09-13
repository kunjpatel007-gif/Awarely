import React from 'react';
import { ViewType, CohortSummary } from '../types';

interface SidebarProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  activePatientId: string;
  summary: CohortSummary | null;
  wsConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  activePatientId,
  summary,
  wsConnected
}) => {
  const shortPatient = activePatientId ? activePatientId.replace('test-patient-', 'P-') : 'P-0825';

  return (
    <aside className="sidebar">
      <div>
        <div className="brand-area">
          <div className="brand-title">
            <span className="brand-mark" />
            The Vanishing Dose
          </div>
          <span className="brand-subtitle">Medication Adherence Monitor</span>
        </div>

        <ul className="nav-list">
          <li
            className={`nav-item ${currentView === 'overview' ? 'active' : ''}`}
            onClick={() => onSelectView('overview')}
          >
            <span>Overview</span>
            <span className="nav-badge">{summary ? summary.patients_monitored : 198}</span>
          </li>

          <li
            className={`nav-item ${currentView === 'diagnostics' ? 'active' : ''}`}
            onClick={() => onSelectView('diagnostics')}
          >
            <span>Patient Details</span>
            <span className="nav-badge">{shortPatient}</span>
          </li>

          <li
            className={`nav-item ${currentView === 'queue' ? 'active' : ''}`}
            onClick={() => onSelectView('queue')}
          >
            <span>Review Queue</span>
            <span className="nav-badge alert">{summary ? summary.patients_requiring_review : 25}</span>
          </li>

          <li
            className={`nav-item ${currentView === 'telemetry' ? 'active' : ''}`}
            onClick={() => onSelectView('telemetry')}
          >
            <span>Live Vitals</span>
            <span className="nav-badge">{wsConnected ? 'Live' : '—'}</span>
          </li>

          <li
            className={`nav-item ${currentView === 'models' ? 'active' : ''}`}
            onClick={() => onSelectView('models')}
          >
            <span>How It Works</span>
          </li>
        </ul>
      </div>

      <div className="sidebar-footer">
        <div className="sys-badge-group">
          <div className="sys-status-row">
            <span className="sys-status-label">Server</span>
            <span className="status-pill">
              <span className="dot green" />
              Online
            </span>
          </div>
          <div className="sys-status-row">
            <span className="sys-status-label">Sensor</span>
            <span className="status-pill">
              <span className={`dot ${wsConnected ? 'green' : 'amber'}`} />
              {wsConnected ? 'Connected' : 'Standby'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
