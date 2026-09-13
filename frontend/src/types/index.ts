export interface PatientSummary {
  patient_id: string;
  base_risk: number;
  lower_90: number;
  upper_90: number;
  interval_width_90: number;
  requires_human_review: boolean;
  review_reason: string | null;
  clinical_status: 'Nominal' | 'Review Required' | 'High Risk';
  hmm_state: number;
  hmm_state_label: string;
}

export interface CohortSummary {
  patients_monitored: number;
  patients_requiring_review: number;
  high_risk_non_adherent: number;
  active_learning_deferred_rate_pct: number;
  system_inference_status: string;
  models_active: {
    cqr_mapie: boolean;
    hmm_cognitive: boolean;
    shap_explainer: boolean;
    jitai_biosignal: boolean;
  };
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  width: number;
}

export interface PatientDiagnostics {
  patient_id: string;
  base_risk: number;
  confidence_interval_90: ConfidenceInterval;
  confidence_interval_80: ConfidenceInterval;
  hidden_cognitive_state: string;
  shap_explanation: Record<string, string>;
  requires_human_review: boolean;
}

export interface HrvMetrics {
  sdnn_ms: number;
  mean_hr_bpm: number;
  is_stressed: boolean;
  rmssd_ms?: number;
}

export interface TelemetrySnapshot {
  points: number[];
  hrv: HrvMetrics;
  source: string;
  last_alert: JitaiAlert | null;
}

export interface JitaiAlert {
  alert: string;
  msg: string;
  sdnn_ms: number;
  mean_hr_bpm: number;
}

export interface TelemetrySample {
  timestamp: number;
  ppg: number;
  raw_ir: number;
  source: string;
}

export type ViewType = 'overview' | 'diagnostics' | 'queue' | 'telemetry' | 'models';
