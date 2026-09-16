import React, { useRef } from 'react';
import { ViewType, CohortSummary } from '../types';
import { Popover, useIndicator } from './ui';
import { HARDWARE_PATIENT_ID } from '../constants';

interface SidebarProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  activePatientId: string;
  summary: CohortSummary | null;
  wsConnected: boolean;
  isReceivingData: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  activePatientId,
  summary,
  wsConnected,
  isReceivingData
}) => {
  const shortPatient = activePatientId ? activePatientId.replace('test-patient-', 'P-') : 'P-0825';
  const navRef = useRef<HTMLUListElement | null>(null);

  // One accent rail that glides to the active item
  useIndicator(navRef, '.nav-item.active', [currentView]);

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
          <ul className="nav-list" role="none" ref={navRef}>
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

            <li className="nav-indicator" role="none" aria-hidden="true" />
          </ul>
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="sys-badge-group">
          <Popover display="block" placement="top" content={<div className="pop-body">Backend API server for patient records and model output.</div>}>
            <div className="sys-status-row">
              <span className="sys-status-label">Server</span>
              <span className="status-pill">
                <span className="dot green" aria-hidden="true" />
                Online
              </span>
            </div>
          </Popover>
          <Popover
            display="block"
            placement="top"
            content={
              <div className="pop-body">
                {wsConnected
                  ? 'Receiving live pulse telemetry over WebSocket.'
                  : 'Waiting for the pulse telemetry stream to connect.'}
              </div>
            }
          >
            <div className="sys-status-row">
              <span className="sys-status-label">Sensor</span>
              <span className="status-pill">
                <span className={`dot ${isReceivingData ? 'green is-live' : 'amber'}`} aria-hidden="true" />
                {!isReceivingData ? 'Standby' : (activePatientId === HARDWARE_PATIENT_ID ? 'Connected' : 'Simulating')}
              </span>
            </div>
          </Popover>
        </div>
      </div>
    </aside>
  );
};
