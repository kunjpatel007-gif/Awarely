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

  // Keyboard parity for nav items: Enter/Space select the same view as a click.
  const handleNavKeyDown = (view: ViewType) => (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectView(view);
    }
  };

  return (
    <aside className="sidebar">
      <div>
        <div className="brand-area">
          <div className="brand-title">
            <span className="brand-mark" aria-hidden="true" />
            Awarely
          </div>
          <span className="brand-subtitle">Medication Adherence Monitor</span>
        </div>

        <nav aria-label="Primary">
          <ul className="nav-list" role="none">
            <li
              className={`nav-item ${currentView === 'overview' ? 'active' : ''}`}
              onClick={() => onSelectView('overview')}
              onKeyDown={handleNavKeyDown('overview')}
              role="button"
              tabIndex={0}
              aria-current={currentView === 'overview' ? 'page' : undefined}
            >
              <span>Overview</span>
              <span className="nav-badge">{summary ? summary.patients_monitored : 198}</span>
            </li>

            <li
              className={`nav-item ${currentView === 'diagnostics' ? 'active' : ''}`}
              onClick={() => onSelectView('diagnostics')}
              onKeyDown={handleNavKeyDown('diagnostics')}
              role="button"
              tabIndex={0}
              aria-current={currentView === 'diagnostics' ? 'page' : undefined}
            >
              <span>Patient Details</span>
              <span className="nav-badge">{shortPatient}</span>
            </li>

            <li
              className={`nav-item ${currentView === 'queue' ? 'active' : ''}`}
              onClick={() => onSelectView('queue')}
              onKeyDown={handleNavKeyDown('queue')}
              role="button"
              tabIndex={0}
              aria-current={currentView === 'queue' ? 'page' : undefined}
            >
              <span>Review Queue</span>
              <span className="nav-badge alert">{summary ? summary.patients_requiring_review : 25}</span>
            </li>


            <li
              className={`nav-item ${currentView === 'models' ? 'active' : ''}`}
              onClick={() => onSelectView('models')}
              onKeyDown={handleNavKeyDown('models')}
              role="button"
              tabIndex={0}
              aria-current={currentView === 'models' ? 'page' : undefined}
            >
              <span>How It Works</span>
            </li>
          </ul>
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="sys-badge-group">
          <div className="sys-status-row">
            <span className="sys-status-label">Server</span>
            <span className="status-pill">
              <span className="dot green" aria-hidden="true" />
              Online
            </span>
          </div>
          <div className="sys-status-row">
            <span className="sys-status-label">Sensor</span>
            <span className="status-pill">
              <span className={`dot ${wsConnected ? 'green is-live' : 'amber'}`} aria-hidden="true" />
              {wsConnected ? 'Connected' : 'Standby'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
