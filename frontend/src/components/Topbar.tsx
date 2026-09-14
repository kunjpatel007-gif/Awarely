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
        <span className="time-indicator">{clock}</span>
      </div>
    </header>
  );
};

