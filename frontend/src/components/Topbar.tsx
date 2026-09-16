import React, { useState, useEffect } from 'react';
import { ViewType } from '../types';
import { hmmStateToLabel, clinicalStatusToLabel } from '../lib/clinicalLabels';
import { API_BASE_URL } from '../services/api';

interface TopbarProps {
  currentView: ViewType;
  activePatientId: string;
  patientStatus?: string;
  hmm_state?: number;
}

// Inline 16px stroke icons (icon strategy (a): no new file, no package)
const Svg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg
    className="icon"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);
const IconSun = () => (
  <Svg>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
  </Svg>
);
const IconMoon = () => (
  <Svg>
    <path d="M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1z" />
  </Svg>
);
const IconReset = () => (
  <Svg>
    <path d="M2 8a6 6 0 1 0 6-6 6.5 6.5 0 0 0-4.5 1.83L2 5.33" />
    <path d="M2 2v3.33h3.33" />
  </Svg>
);

export const Topbar: React.FC<TopbarProps> = ({
  currentView,
  activePatientId,
  patientStatus = 'Nominal',
  hmm_state = 0
}) => {
  const [clock, setClock] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => document.documentElement.getAttribute('data-theme') === 'dark');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

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
        <span className="topbar-title">{titles[currentView]}</span>
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
          className="btn-outline btn-icon" 
          onClick={toggleDarkMode}
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
        >
          {isDarkMode ? <IconSun /> : <IconMoon />}
        </button>
        <button 
          type="button"
          className="btn-outline btn-tone-warn" 
          onClick={handleResetDemo}
        >
          <IconReset />
          Reset Demo
        </button>
        <span className="time-indicator">{clock}</span>
      </div>
    </header>
  );
};

