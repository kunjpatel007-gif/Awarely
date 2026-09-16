import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { ViewType } from '../types';
import { API_BASE_URL } from '../services/api';
import { hmmStateToLabel, clinicalStatusToLabel } from '../lib/clinicalLabels';
import { IconMoon, IconReset, IconSearch, IconSun, Kbd, OPEN_PALETTE_EVENT, Popover, modKeyLabel } from './ui';

interface TopbarProps {
  currentView: ViewType;
  activePatientId: string;
  patientStatus?: string;
  hmm_state?: number;
}

type ViewTransitionDocument = Document & { startViewTransition?: (cb: () => void) => unknown };

const TopbarInner: React.FC<TopbarProps> = ({
  currentView,
  activePatientId,
  patientStatus = 'Nominal',
  hmm_state = 0
}) => {
  const [clock, setClock] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const titles: Record<ViewType, string> = {
    overview: 'Patient Overview',
    diagnostics: 'Patient Details',
    queue: 'Review Queue',
    models: 'How It Works'
  };

  const shortPatient = activePatientId ? activePatientId.replace('test-patient-', 'P-') : 'P-0825';
  
  const displayStatus = clinicalStatusToLabel(patientStatus);
  const displayHmm = hmmStateToLabel(hmm_state);

  const getStatusDot = () => {
    if (patientStatus === 'High Risk') return 'red';
    if (patientStatus === 'Review Required') return 'amber';
    return 'green';
  };

  const handleResetDemo = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/reset`, { method: 'POST' });
      alert('Demo state has been reset successfully. The page will now reload.');
      window.location.reload();
    } catch (e) {
      alert('Failed to reset demo state.');
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title" key={currentView}>{titles[currentView]}</span>
        {currentView === 'diagnostics' && (
          <>
            <span className="topbar-sep" aria-hidden="true">/</span>
            <div className="patient-context-pill">
              <span className={`dot ${getStatusDot()}`} aria-hidden="true" />
              <span className="mono-val">{shortPatient}</span>
              <span className="mono-dim">{displayStatus} - {displayHmm}</span>
            </div>
          </>
        )}
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className="btn-outline search-trigger"
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          aria-label="Search patients and pages"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <IconSearch />
          <span className="search-trigger-label">Search patients</span>
          <Kbd>{modKeyLabel}K</Kbd>
        </button>
        <Popover content={<div className="pop-body">Resets the demo backend state, then reloads the page.</div>} placement="bottom">
          <button 
            type="button"
            className="btn-outline btn-tone-warn" 
            onClick={handleResetDemo}
          >
            <IconReset />
            Reset Demo
          </button>
        </Popover>
        <span className="time-indicator">{clock}</span>
      </div>
    </header>
  );
};

export const Topbar = React.memo(TopbarInner);
