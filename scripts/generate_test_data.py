"""
generate_test_data.py
Generates small synthetic test data for development when Synthea is not available.
Creates fake FHIR-like DataFrames and saves them as parquet.

Usage:
    python scripts/generate_test_data.py
"""

import numpy as np
import pandas as pd
from pathlib import Path
import json

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "data" / "synthea_output"


def generate_test_bundles(n_patients: int = 50, output_dir: Path = OUTPUT_DIR):
    """Generate fake Synthea-style FHIR Bundle JSON files for testing."""
    output_dir.mkdir(parents=True, exist_ok=True)
    np.random.seed(42)

    for i in range(n_patients):
        patient_id = f"test-patient-{i:04d}"
        bundle = _create_patient_bundle(patient_id, i)
        filepath = output_dir / f"{patient_id}.json"
        with open(filepath, "w") as f:
            json.dump(bundle, f, indent=2, default=str)

    print(f"Generated {n_patients} test patient bundles in {output_dir}")


def _create_patient_bundle(patient_id: str, seed: int) -> dict:
    """Create a single patient FHIR Bundle with realistic medication/encounter data."""
    np.random.seed(seed + 100)

    # Patient demographics
    age = np.random.randint(30, 80)
    birth_year = 2026 - age
    gender = np.random.choice(["male", "female"])
    insurance = np.random.choice(["private", "medicare", "medicaid", "uninsured"],
                                  p=[0.45, 0.25, 0.2, 0.1])

    # Adherence profile — this controls how many refills they miss
    adherence_profile = np.random.choice(["high", "medium", "low"], p=[0.4, 0.35, 0.25])
    if adherence_profile == "high":
        refill_prob = 0.90   # 90% chance of refilling on time
        appt_show_prob = 0.95
    elif adherence_profile == "medium":
        refill_prob = 0.65
        appt_show_prob = 0.75
    else:
        refill_prob = 0.35
        appt_show_prob = 0.50

    entries = []

    # Patient resource
    entries.append({
        "resource": {
            "resourceType": "Patient",
            "id": patient_id,
            "birthDate": f"{birth_year}-{np.random.randint(1,13):02d}-{np.random.randint(1,29):02d}",
            "gender": gender,
            "extension": [
                {"url": "insurance_type", "valueString": insurance}
            ]
        }
    })

    # Medications — 1-3 chronic meds
    n_meds = np.random.randint(1, 4)
    med_codes = np.random.choice(["314076", "197361", "310798", "312961", "198240"], n_meds, replace=False)

    # Generate 180 days of history (6 months, we use last 90 days)
    base_date = pd.Timestamp("2026-03-01")

    for med_code in med_codes:
        days_supply = np.random.choice([30, 60, 90])
        current_date = base_date

        while current_date < pd.Timestamp("2026-09-01"):
            if np.random.random() < refill_prob:
                # Refill happens (possibly with a small delay)
                delay = np.random.randint(0, 5) if np.random.random() < 0.3 else 0
                dispense_date = current_date + pd.Timedelta(days=delay)

                entries.append({
                    "resource": {
                        "resourceType": "MedicationDispense",
                        "id": f"disp-{patient_id}-{med_code}-{len(entries)}",
                        "subject": {"reference": f"Patient/{patient_id}"},
                        "medicationCodeableConcept": {
                            "coding": [{"system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                                        "code": med_code}]
                        },
                        "whenHandedOver": dispense_date.isoformat(),
                        "daysSupply": {"value": days_supply},
                        "status": "completed"
                    }
                })
            # else: missed this refill cycle

            current_date += pd.Timedelta(days=days_supply)

    # Encounters — roughly monthly appointments
    current_date = base_date
    while current_date < pd.Timestamp("2026-09-01"):
        status = "finished" if np.random.random() < appt_show_prob else np.random.choice(["cancelled", "noshow"])
        entries.append({
            "resource": {
                "resourceType": "Encounter",
                "id": f"enc-{patient_id}-{len(entries)}",
                "subject": {"reference": f"Patient/{patient_id}"},
                "status": status,
                "class": {"code": "AMB"},
                "period": {"start": current_date.isoformat()}
            }
        })
        current_date += pd.Timedelta(days=np.random.randint(25, 35))

    # Observations — weekly vitals
    current_date = base_date
    while current_date < pd.Timestamp("2026-09-01"):
        # SpO2
        base_spo2 = 97.0 if adherence_profile == "high" else (95.5 if adherence_profile == "medium" else 93.5)
        spo2 = np.clip(base_spo2 + np.random.normal(0, 1), 88, 100)
        entries.append({
            "resource": {
                "resourceType": "Observation",
                "id": f"obs-spo2-{patient_id}-{len(entries)}",
                "subject": {"reference": f"Patient/{patient_id}"},
                "effectiveDateTime": current_date.isoformat(),
                "code": {"coding": [{"system": "http://loinc.org", "code": "59408-5", "display": "SpO2"}]},
                "valueQuantity": {"value": round(spo2, 1), "unit": "%"}
            }
        })

        # Heart rate
        base_hr = 72 if adherence_profile == "high" else (80 if adherence_profile == "medium" else 88)
        hr = np.clip(base_hr + np.random.normal(0, 8), 50, 120)
        entries.append({
            "resource": {
                "resourceType": "Observation",
                "id": f"obs-hr-{patient_id}-{len(entries)}",
                "subject": {"reference": f"Patient/{patient_id}"},
                "effectiveDateTime": current_date.isoformat(),
                "code": {"coding": [{"system": "http://loinc.org", "code": "8867-4", "display": "Heart rate"}]},
                "valueQuantity": {"value": round(hr, 1), "unit": "bpm"}
            }
        })

        # Systolic BP
        base_sbp = 120 if adherence_profile == "high" else (135 if adherence_profile == "medium" else 150)
        sbp = np.clip(base_sbp + np.random.normal(0, 10), 90, 200)
        entries.append({
            "resource": {
                "resourceType": "Observation",
                "id": f"obs-sbp-{patient_id}-{len(entries)}",
                "subject": {"reference": f"Patient/{patient_id}"},
                "effectiveDateTime": current_date.isoformat(),
                "code": {"coding": [{"system": "http://loinc.org", "code": "8480-6", "display": "Systolic BP"}]},
                "valueQuantity": {"value": round(sbp, 1), "unit": "mmHg"}
            }
        })

        current_date += pd.Timedelta(days=7)

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": entries
    }


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("-n", "--patients", type=int, default=50,
                        help="Number of test patients to generate (default: 50)")
    args = parser.parse_args()
    generate_test_bundles(args.patients)
