import React, { useState, useEffect } from 'react';
import { ViewType } from '../types';

interface TopbarProps {
  currentView: ViewType;
  activePatientId: string;
  patientStatus?: string;
  hmmLabel?: string;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentView,
  activePatientId,
  patientStatus = 'Nominal',
  hmmLabel = 'Strictly Adherent'
}) => {
  const [clock, setClock] = useState<string>('SYNC: --:--:-- UTC');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const utcStr = now.toISOString().substring(11, 19);
      setClock(`SYNC: ${utcStr} UTC`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const titles: Record<ViewType, string> = {
    overview: 'CLINICAL OVERVIEW',
    diagnostics: 'PATIENT DIAGNOSTICS',
    queue: 'UNCERTAINTY REVIEW QUEUE',
    telemetry: 'LIVE TELEMETRY',
    models: 'SYSTEM & MODEL ARCHITECTURE'
  };

  const shortPatient = activePatientId ? activePatientId.replace('test-patient-', 'P-') : 'P-0825';

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
          <span>PATIENT: {shortPatient}</span>
          <span className="mono-dim">HMM: {hmmLabel.toUpperCase()}</span>
        </div>
      </div>
      <div className="topbar-right">
        <span className="status-pill">
          <span className="dot green" />
          SYSTEM STATUS: NOMINAL
        </span>
        <span className="time-indicator">{clock}</span>
      </div>
    </header>
  );
};
