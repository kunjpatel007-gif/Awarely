import React, { useState, useEffect } from 'react';
import './styles/stitch.css';
import { ViewType, CohortSummary, PatientSummary, PatientDiagnostics } from './types';
import { fetchCohortSummary, fetchPatients, fetchPatientDiagnostics } from './services/api';
import { useTelemetry } from './hooks/useTelemetry';

import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { OverviewPage } from './pages/OverviewPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { TelemetryPage } from './pages/TelemetryPage';
import { SystemModelsPage } from './pages/SystemModelsPage';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('overview');
  const [activePatientId, setActivePatientId] = useState<string>('test-patient-0825');

  // Backend state
  const [summary, setSummary] = useState<CohortSummary | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientDiagnostics, setPatientDiagnostics] = useState<PatientDiagnostics | null>(null);

  const [isLoadingPatients, setIsLoadingPatients] = useState<boolean>(true);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState<boolean>(false);

  // Live WebSocket Telemetry Hook
  const {
    samples,
    latestAlert,
    isConnected,
    hrv,
    eventLog,
    triggerSimulatedStress
  } = useTelemetry();

  // Load Cohort Summary & Patient Roster
  useEffect(() => {
    setIsLoadingPatients(true);
    Promise.all([
      fetchCohortSummary().catch(err => {
        console.warn('Failed to load summary, using defaults:', err);
        return null;
      }),
      fetchPatients({ limit: 500 }).catch(err => {
        console.warn('Failed to load patients, using defaults:', err);
        return { total_count: 0, patients: [] };
      })
    ]).then(([sumData, patData]) => {
      if (sumData) setSummary(sumData);
      if (patData && patData.patients) {
        setPatients(patData.patients);
        if (patData.patients.length > 0 && !activePatientId) {
          setActivePatientId(patData.patients[0].patient_id);
        }
      }
      setIsLoadingPatients(false);
    });
  }, []);

  // Load Active Patient Diagnostics
  useEffect(() => {
    if (!activePatientId) return;
    setIsLoadingDiagnostics(true);
    fetchPatientDiagnostics(activePatientId)
      .then(diag => {
        setPatientDiagnostics(diag);
        setIsLoadingDiagnostics(false);
      })
      .catch(err => {
        console.error('Failed to load diagnostics for', activePatientId, err);
        setIsLoadingDiagnostics(false);
      });
  }, [activePatientId]);

  const handleSelectPatient = (patientId: string) => {
    setActivePatientId(patientId);
    setCurrentView('diagnostics');
  };

  const currentPatientObj = patients.find(p => p.patient_id === activePatientId);

  return (
    <div className="app-layout">
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        activePatientId={activePatientId}
        summary={summary}
        wsConnected={isConnected}
      />

      <main className="main-content">
        <Topbar
          currentView={currentView}
          activePatientId={activePatientId}
          patientStatus={currentPatientObj?.clinical_status || 'Nominal'}
          hmmLabel={currentPatientObj?.hmm_state_label || 'Strictly Adherent'}
        />

        <div className="page-viewport">
          {currentView === 'overview' && (
            <OverviewPage
              summary={summary}
              patients={patients}
              onSelectPatient={handleSelectPatient}
              isLoading={isLoadingPatients}
            />
          )}

          {currentView === 'diagnostics' && (
            <DiagnosticsPage
              patient={patientDiagnostics}
              samples={samples}
              hrv={hrv}
              latestAlert={latestAlert}
              onBackToCohort={() => setCurrentView('overview')}
              onSimulateStress={triggerSimulatedStress}
              isLoading={isLoadingDiagnostics}
            />
          )}

          {currentView === 'queue' && (
            <ReviewQueuePage
              patients={patients}
              onSelectPatient={handleSelectPatient}
            />
          )}

          {currentView === 'telemetry' && (
            <TelemetryPage
              samples={samples}
              hrv={hrv}
              latestAlert={latestAlert}
              eventLog={eventLog}
              isConnected={isConnected}
              onSimulateStress={triggerSimulatedStress}
            />
          )}

          {currentView === 'models' && <SystemModelsPage />}
        </div>
      </main>
    </div>
  );
};

export default App;
