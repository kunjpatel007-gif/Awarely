"""
fhir_parser.py
Parses Synthea and MIMIC-IV FHIR NDJSON output into structured Pandas DataFrames.
Targets: MedicationRequest, MedicationDispense, Encounter, Observation, Patient.
"""

import json
import os
from pathlib import Path
import pandas as pd
from tqdm import tqdm


def load_ndjson(filepath: str | Path) -> list[dict]:
    """Load a FHIR NDJSON file into a list of resource dicts."""
    records = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def parse_patients(filepath: str | Path) -> pd.DataFrame:
    """Parse Patient resources."""
    rows = []
    for r in load_ndjson(filepath):
        if r.get("resourceType") != "Patient":
            continue
        birth = r.get("birthDate", "")
        rows.append({
            "patient_id": r["id"],
            "birth_date": birth,
            "gender": r.get("gender", "unknown"),
            "insurance_type": _extract_extension(r, "insurance_type", default="unknown"),
        })
    return pd.DataFrame(rows)


def parse_medication_dispenses(filepath: str | Path) -> pd.DataFrame:
    """Parse MedicationDispense resources → refill events."""
    rows = []
    for r in load_ndjson(filepath):
        if r.get("resourceType") not in ("MedicationDispense", "MedicationAdministration"):
            continue
        patient_ref = r.get("subject", {}).get("reference", "").replace("Patient/", "")
        when = (
            r.get("whenHandedOver")
            or r.get("effectiveDateTime")
            or r.get("whenPrepared", "")
        )
        days_supply = r.get("daysSupply", {}).get("value", 30)
        rows.append({
            "patient_id": patient_ref,
            "dispense_date": pd.to_datetime(when, errors="coerce"),
            "days_supply": float(days_supply),
            "medication_code": _extract_med_code(r),
        })
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.dropna(subset=["dispense_date"]).sort_values(["patient_id", "dispense_date"])
    return df


def parse_encounters(filepath: str | Path) -> pd.DataFrame:
    """Parse Encounter resources → appointment history."""
    rows = []
    for r in load_ndjson(filepath):
        if r.get("resourceType") != "Encounter":
            continue
        patient_ref = r.get("subject", {}).get("reference", "").replace("Patient/", "")
        start = r.get("period", {}).get("start", "")
        status = r.get("status", "unknown")
        rows.append({
            "patient_id": patient_ref,
            "encounter_date": pd.to_datetime(start, errors="coerce"),
            "status": status,
            "class": r.get("class", {}).get("code", ""),
        })
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.dropna(subset=["encounter_date"]).sort_values(["patient_id", "encounter_date"])
    return df


def parse_observations(filepath: str | Path) -> pd.DataFrame:
    """Parse Observation resources → vitals (SpO2, HR, BP)."""
    VITAL_CODES = {
        "59408-5": "spo2",       # SpO2 LOINC
        "8867-4": "heart_rate",  # HR LOINC
        "8480-6": "sbp",         # Systolic BP
        "8462-4": "dbp",         # Diastolic BP
    }
    rows = []
    for r in load_ndjson(filepath):
        if r.get("resourceType") != "Observation":
            continue
        patient_ref = r.get("subject", {}).get("reference", "").replace("Patient/", "")
        effective = r.get("effectiveDateTime", r.get("effectivePeriod", {}).get("start", ""))
        code = _extract_observation_code(r)
        vital_name = VITAL_CODES.get(code)
        if vital_name is None:
            continue
        value = r.get("valueQuantity", {}).get("value")
        if value is None:
            continue
        rows.append({
            "patient_id": patient_ref,
            "observation_date": pd.to_datetime(effective, errors="coerce"),
            "vital": vital_name,
            "value": float(value),
        })
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.dropna(subset=["observation_date"])
    return df


# ── Bundle parser for Synthea's bundled FHIR output ──────────────────────────

def parse_synthea_bundle_dir(bundle_dir: str | Path) -> dict[str, pd.DataFrame]:
    """
    Synthea outputs one JSON Bundle file per patient.
    Parse all bundles in a directory and return merged DataFrames.
    """
    bundle_dir = Path(bundle_dir)
    all_dispenses, all_encounters, all_observations, all_patients = [], [], [], []

    bundle_files = list(bundle_dir.glob("*.json"))
    print(f"Parsing {len(bundle_files)} Synthea bundles...")

    for bf in tqdm(bundle_files):
        with open(bf, "r", encoding="utf-8") as f:
            bundle = json.load(f)
        if bundle.get("resourceType") != "Bundle":
            continue
        # Write each resource type into a temp NDJSON-like list
        resource_map: dict[str, list] = {}
        for entry in bundle.get("entry", []):
            resource = entry.get("resource", {})
            rtype = resource.get("resourceType", "Unknown")
            resource_map.setdefault(rtype, []).append(resource)

        if "Patient" in resource_map:
            all_patients.extend(resource_map["Patient"])
        if "MedicationDispense" in resource_map:
            all_dispenses.extend(resource_map["MedicationDispense"])
        if "MedicationAdministration" in resource_map:
            all_dispenses.extend(resource_map["MedicationAdministration"])
        if "Encounter" in resource_map:
            all_encounters.extend(resource_map["Encounter"])
        if "Observation" in resource_map:
            all_observations.extend(resource_map["Observation"])

    def _list_to_df(resources, parse_fn):
        import tempfile, json as _json
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ndjson", delete=False, encoding="utf-8") as tmp:
            for r in resources:
                tmp.write(_json.dumps(r) + "\n")
            tmp_path = tmp.name
        df = parse_fn(tmp_path)
        os.unlink(tmp_path)
        return df

    return {
        "patients": _list_to_df(all_patients, parse_patients),
        "dispenses": _list_to_df(all_dispenses, parse_medication_dispenses),
        "encounters": _list_to_df(all_encounters, parse_encounters),
        "observations": _list_to_df(all_observations, parse_observations),
    }


# ── Private helpers ───────────────────────────────────────────────────────────

def _extract_med_code(resource: dict) -> str:
    med = resource.get("medicationCodeableConcept", {})
    for coding in med.get("coding", []):
        return coding.get("code", "UNKNOWN")
    return "UNKNOWN"


def _extract_observation_code(resource: dict) -> str:
    code = resource.get("code", {})
    for coding in code.get("coding", []):
        return coding.get("code", "")
    return ""


def _extract_extension(resource: dict, key: str, default: str = "") -> str:
    for ext in resource.get("extension", []):
        if key in ext.get("url", ""):
            return ext.get("valueString", default)
    return default
