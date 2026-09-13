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
          <span className="brand-subtitle">Indirect-Signal Adherence &amp; JITAI</span>
        </div>

        <ul className="nav-list">
          <li
            className={`nav-item ${currentView === 'overview' ? 'active' : ''}`}
            onClick={() => onSelectView('overview')}
          >
            <span>1. Cohort Overview</span>
            <span className="nav-badge">{summary ? summary.patients_monitored : 198}</span>
          </li>

          <li
            className={`nav-item ${currentView === 'diagnostics' ? 'active' : ''}`}
            onClick={() => onSelectView('diagnostics')}
          >
            <span>2. Patient Diagnostics</span>
            <span className="nav-badge">{shortPatient}</span>
          </li>

          <li
            className={`nav-item ${currentView === 'queue' ? 'active' : ''}`}
            onClick={() => onSelectView('queue')}
          >
            <span>3. Review Queue</span>
            <span className="nav-badge alert">{summary ? summary.patients_requiring_review : 25}</span>
          </li>

          <li
            className={`nav-item ${currentView === 'telemetry' ? 'active' : ''}`}
            onClick={() => onSelectView('telemetry')}
          >
            <span>4. Live Telemetry</span>
            <span className="nav-badge">50 Hz</span>
          </li>

          <li
            className={`nav-item ${currentView === 'models' ? 'active' : ''}`}
            onClick={() => onSelectView('models')}
          >
            <span>5. System &amp; Models</span>
            <span className="nav-badge">XGB+HMM</span>
          </li>
        </ul>
      </div>

      {/* Telemetry & Sensor Bottom States */}
      <div className="sidebar-footer">
        <div className="sys-badge-group">
          <div className="sys-status-row">
            <span className="sys-status-label">Backend API</span>
            <span className="status-pill">
              <span className="dot green" />
              FastAPI Online
            </span>
          </div>
          <div className="sys-status-row">
            <span className="sys-status-label">Sensor Source</span>
            <span className="status-pill">
              <span className={`dot ${wsConnected ? 'green' : 'amber'}`} />
              {wsConnected ? 'ESP32 / MAX30102' : 'Broker Standby'}
            </span>
          </div>
          <div className="sys-status-row">
            <span className="sys-status-label">WebSocket</span>
            <span className="status-pill">
              <span className={`dot ${wsConnected ? 'green' : 'amber'}`} />
              {wsConnected ? 'WS /ws/ppg (50Hz)' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
