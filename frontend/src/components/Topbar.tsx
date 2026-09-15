import React, { useState, useEffect } from 'react';
import { ViewType } from '../types';
import { hmmStateToLabel, clinicalStatusToLabel } from '../lib/clinicalLabels';

interface TopbarProps {
  currentView: ViewType;
  activePatientId: string;
  patientStatus?: string;
  hmm_state?: number;
}

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
      await fetch('http://localhost:8000/api/reset', { method: 'POST' });
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
        <span className="topbar-sep">/</span>
        <div className="patient-context-pill">
          <span className={`dot ${getStatusDot()}`} />
          <span>{shortPatient}</span>
          <span className="mono-dim">{displayStatus} - {displayHmm}</span>
        </div>
      </div>
      <div className="topbar-right">
        <button 
          className="btn-outline" 
          onClick={toggleDarkMode}
          style={{ marginRight: '1rem', padding: '4px 8px', fontSize: '0.8rem', color: 'var(--text-primary)' }}
        >
          {isDarkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
        <button 
          className="btn-outline" 
          onClick={handleResetDemo}
          style={{ marginRight: '1rem', padding: '4px 8px', fontSize: '0.8rem', borderColor: 'var(--status-warn)', color: 'var(--status-warn)' }}
        >
          Reset Demo
        </button>
        <span className="time-indicator">{clock}</span>
      </div>
    </header>
  );
};

