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
import { SystemModelsPage } from './pages/SystemModelsPage';
import { CommandPalette } from './components/CommandPalette';

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
    isReceivingData,
    connectionState,
    hrv,
    eventLog
  } = useTelemetry(activePatientId);

  const refreshData = () => {
    setIsLoadingPatients(true);
    Promise.all([
      fetchCohortSummary().catch(err => null),
      fetchPatients({ limit: 500 }).catch(err => ({ total_count: 0, patients: [] }))
    ]).then(([sumData, patData]) => {
      if (sumData) setSummary(sumData);
      if (patData && patData.patients) {
        setPatients(patData.patients);
      }
      setIsLoadingPatients(false);
    });

    if (activePatientId) {
      setIsLoadingDiagnostics(true);
      fetchPatientDiagnostics(activePatientId)
        .then(data => {
          setPatientDiagnostics(data);
          setIsLoadingDiagnostics(false);
        })
        .catch(err => {
          console.error(err);
          setIsLoadingDiagnostics(false);
        });
    }
  };

  // Load Cohort Summary & Patient Roster
  useEffect(() => {
    refreshData();
  }, []);

  // Load Active Patient Diagnostics when activePatientId changes (except first load which is handled above)
  useEffect(() => {
    if (activePatientId) {
      setIsLoadingDiagnostics(true);
      fetchPatientDiagnostics(activePatientId)
        .then(data => {
          setPatientDiagnostics(data);
          setIsLoadingDiagnostics(false);
        })
        .catch(err => {
          console.error(err);
          setIsLoadingDiagnostics(false);
        });
    }
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
        isReceivingData={isReceivingData}
      />

      <main className="main-content">
        <Topbar
          currentView={currentView}
          activePatientId={activePatientId}
          patientStatus={currentPatientObj?.clinical_status || 'Nominal'}
          hmm_state={currentPatientObj?.hmm_state || 0}
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
              eventLog={eventLog}
              onBackToCohort={() => setCurrentView('overview')}
              onRefresh={refreshData}
              isLoading={isLoadingDiagnostics}
            />
          )}

          {currentView === 'queue' && (
            <ReviewQueuePage
              patients={patients}
              onSelectPatient={handleSelectPatient}
              onRefresh={refreshData}
            />
          )}

          {currentView === 'models' && <SystemModelsPage />}
        </div>
      </main>

      <CommandPalette
        patients={patients}
        onSelectPatient={handleSelectPatient}
        onSelectView={setCurrentView}
      />

    </div>
  );
};

export default App;
