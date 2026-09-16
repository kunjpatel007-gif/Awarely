import { CohortSummary, PatientSummary, PatientDiagnostics, TelemetrySnapshot } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || API_BASE_URL.replace(/^http/, 'ws');

export async function fetchCohortSummary(): Promise<CohortSummary> {
  const res = await fetch(`${API_BASE_URL}/api/patients/summary`);
  if (!res.ok) {
    throw new Error(`Failed to fetch cohort summary: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPatients(params?: { requires_review?: boolean; status?: string; limit?: number }): Promise<{ total_count: number; patients: PatientSummary[] }> {
  const query = new URLSearchParams();
  if (params?.requires_review !== undefined) {
    query.append('requires_review', String(params.requires_review));
  }
  if (params?.status) {
    query.append('status', params.status);
  }
  if (params?.limit) {
    query.append('limit', String(params.limit));
  }

  const queryString = query.toString();
  const url = queryString ? `${API_BASE_URL}/api/patients?${queryString}` : `${API_BASE_URL}/api/patients`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch patients roster: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPatientDiagnostics(patientId: string): Promise<PatientDiagnostics> {
  const res = await fetch(`${API_BASE_URL}/api/patient/${encodeURIComponent(patientId)}/adherence`);
  if (!res.ok) {
    throw new Error(`Failed to fetch diagnostics for ${patientId}: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchLatestTelemetry(): Promise<TelemetrySnapshot> {
  const res = await fetch(`${API_BASE_URL}/api/telemetry/latest`);
  if (!res.ok) {
    throw new Error(`Failed to fetch latest telemetry snapshot: ${res.statusText}`);
  }
  return res.json();
}

export async function submitAdherenceReview(patientId: string, status: 'adherent' | 'non_adherent', method?: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/adherence-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, method })
  });
  if (!res.ok) {
    throw new Error(`Failed to submit adherence review: ${res.statusText}`);
  }
  return res.json();
}

export async function scheduleFollowUp(patientId: string, date: string, notes: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/follow-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, notes })
  });
  if (!res.ok) {
    throw new Error(`Failed to schedule follow-up: ${res.statusText}`);
  }
  return res.json();
}

export async function triggerJitaiReminder(patientId: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/trigger-reminder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    throw new Error(`Failed to trigger JITAI reminder: ${res.statusText}`);
  }
  return res.json();
}

export async function remindRefill(patientId: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/remind-refill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    throw new Error(`Failed to send refill reminder: ${res.statusText}`);
  }
  return res.json();
}

export async function remindAppointment(patientId: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/remind-appointment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    throw new Error(`Failed to send appointment reminder: ${res.statusText}`);
  }
  return res.json();
}
