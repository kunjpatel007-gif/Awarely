export function hmmStateToLabel(state: number): string {
  switch (state) {
    case 0: return "Stable Routine";
    case 1: return "Variable Pattern";
    case 2: return "Volatile Phase";
    default: return "Unknown Phase";
  }
}

export function clinicalStatusToLabel(status: string): string {
  switch (status) {
    case "High Risk": return "Needs Attention";
    case "Review Required": return "Under Review";
    case "Nominal": return "On Track";
    default: return status;
  }
}

export function reviewReasonToLabel(reason: string | null | undefined): string {
  if (!reason) return "Flagged for Review";
  
  if (reason.includes("High Epistemic Uncertainty")) {
    return "Unusual Refill Pattern Detected";
  }
  if (reason.includes("Point Estimate Out of Bounds")) {
    return "Abnormal Records — Manual Check Needed";
  }
  if (reason.includes("High Uncertainty & Out of Bounds")) {
    return "Unusual Pattern — Requires Clinician Review";
  }
  return "Flagged for Review";
}

export function formatNum(v: any): string {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  if (isNaN(n)) return `${v}`;
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export function shapFeaturesToRiskFactors(
  explanation: Record<string, string>,
  clinical_features: Record<string, any> = {}
): Array<{label: string, impact: string, direction: 'up' | 'down'}> {
  const formatLabel = (feature: string, val: any) => {
    if (val === undefined || val === null) {
      const fallback: Record<string, string> = {
        avg_refill_gap_90d: "Refill gap over 90 days",
        days_since_last_refill: "Days since last prescription refill",
        missed_appointments_90d: "Missed clinic appointments",
        rolling_7d_avg_hr: "Average heart rate (7-day)",
        spo2_avg_7d: "Blood oxygen levels (7-day)",
        age: "Patient age",
        kept_appointments_90d: "Kept clinic appointments",
        appointment_streak: "Consecutive appointments kept",
        refill_gap_std: "Refill timing consistency",
        total_refills_90d: "Total refills in 90 days"
      };
      return fallback[feature] || feature;
    }

    switch (feature) {
      case 'missed_appointments_90d': return `${formatNum(val)} appointments missed in the last 90 days`;
      case 'avg_refill_gap_90d': return `Average refill delay of ${formatNum(val)} days`;
      case 'days_since_last_refill': return `${formatNum(val)} days since last prescription refill`;
      case 'total_refills_90d': return `Only ${formatNum(val)} total refills in 90 days`;
      case 'kept_appointments_90d': return `Only ${formatNum(val)} kept clinic appointments`;
      case 'appointment_streak': return `Consecutive appointments kept dropped to ${formatNum(val)}`;
      case 'refill_gap_std': return `Refill timing consistency standard deviation is ${formatNum(val)}`;
      case 'spo2_avg_7d': return `Blood oxygen levels averaged ${formatNum(val)}%`;
      case 'rolling_7d_avg_hr': return `Average heart rate elevated to ${formatNum(val)} BPM`;
      case 'age': return `Patient age is ${formatNum(val)}`;
      default: return feature;
    }
  };

  const results = Object.entries(explanation).map(([feature, impactStr]) => {
    // Assuming impactStr might have a + or - or just be a value
    const val = parseFloat(impactStr);
    const direction = val >= 0 ? 'up' : 'down';
    return {
      label: formatLabel(feature, clinical_features[feature]),
      impact: impactStr,
      direction: direction as 'up' | 'down',
      magnitude: Math.abs(val)
    };
  });

  results.sort((a, b) => b.magnitude - a.magnitude);
  
  return results.slice(0, 3).map(r => ({
    label: r.label,
    impact: r.impact,
    direction: r.direction
  }));
}

export function confidenceToLabel(width90: number): { text: string; severity: 'good' | 'moderate' | 'poor' } {
  if (width90 < 0.25) {
    return { text: "High Confidence", severity: "good" };
  } else if (width90 < 0.40) {
    return { text: "Moderate Confidence", severity: "moderate" };
  } else {
    return { text: "Low Confidence — Review Needed", severity: "poor" };
  }
}

export function formatFeatureName(feature: string): string {
  const map: Record<string, string> = {
    avg_refill_gap_90d: "Avg Refill Gap (90d)",
    days_since_last_refill: "Days Since Last Refill",
    missed_appointments_90d: "Missed Appointments",
    rolling_7d_avg_hr: "Resting Heart Rate",
    spo2_avg_7d: "Blood Oxygen (SpO2)",
    age: "Patient Age",
    kept_appointments_90d: "Kept Appointments",
    appointment_streak: "Appointment Streak",
    refill_gap_std: "Refill Gap Variance",
    total_refills_90d: "Total Refills (90d)",
    sbp_avg: "Systolic Blood Pressure",
    gender: "Gender",
    medication_count: "Concurrent Medications",
    days_on_therapy: "Days on Therapy",
    insurance_type_enc: "Insurance Tier",
    insurance_type: "Insurance Type",
    pdc: "PDC Score",
    adherent: "Adherent"
  };
  
  if (map[feature]) return map[feature];

  // Fallback: Convert snake_case to Title Case
  return feature
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatFeatureValue(feature: string, val: any): string {
  if (feature === 'gender') return val === 1.0 ? 'Male' : val === 0.0 ? 'Female' : 'Other';
  if (feature === 'adherent') return (val === 1.0 || val === 1 || val === true) ? 'Yes' : 'No';
  if (feature === 'pdc') return `${Math.round(Number(val) * 100)}%`;
  
  if (typeof val === 'string') {
    return val.charAt(0).toUpperCase() + val.slice(1);
  }

  const numStr = formatNum(val);
  if (feature === 'spo2_avg_7d') return `${numStr}%`;
  if (feature === 'rolling_7d_avg_hr') return `${numStr} BPM`;
  if (feature === 'sbp_avg') return `${numStr} mmHg`;
  if (feature === 'days_since_last_refill' || feature === 'avg_refill_gap_90d' || feature === 'days_on_therapy') return `${numStr} days`;
  if (feature === 'insurance_type_enc') {
    return val === 3 || val === '3' ? 'None' : `Tier ${numStr}`;
  }
  return numStr;
}
