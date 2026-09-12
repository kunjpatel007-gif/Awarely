"""
feature_engineering.py
Transforms raw FHIR DataFrames into:
  - PDC (Proportion of Days Covered) labels per patient
  - A tabular feature matrix for XGBoost (one row per patient)
  - A weekly time-series DataFrame for TFT (one row per patient per week)

Target: PDC < 0.80 => clinically non-adherent.
"""

import numpy as np
import pandas as pd
from pathlib import Path

OBSERVATION_WINDOW_DAYS = 90
WEEKLY_STEPS = OBSERVATION_WINDOW_DAYS // 7  # ~12-13 weeks


def compute_pdc(dispenses: pd.DataFrame, window_days: int = OBSERVATION_WINDOW_DAYS) -> pd.DataFrame:
    """
    Compute Proportion of Days Covered per patient.
    PDC = days_medication_available / window_days
    Uses the last window_days of each patient's dispense history.
    """
    records = []
    for patient_id, grp in dispenses.groupby("patient_id"):
        grp = grp.sort_values("dispense_date")
        if grp.empty:
            continue
        last_date = grp["dispense_date"].max()
        window_start = last_date - pd.Timedelta(days=window_days)
        window = grp[grp["dispense_date"] >= window_start].copy()
        if window.empty:
            records.append({"patient_id": patient_id, "pdc": 0.0, "adherent": 0,
                            "window_start": window_start, "window_end": last_date})
            continue
        covered_days = set()
        for _, row in window.iterrows():
            start = row["dispense_date"]
            for d in range(int(max(row["days_supply"], 1))):
                day = start + pd.Timedelta(days=d)
                if window_start <= day <= last_date:
                    covered_days.add(day.date())
        pdc = min(len(covered_days) / window_days, 1.0)
        records.append({
            "patient_id": patient_id,
            "pdc": round(pdc, 4),
            "adherent": int(pdc >= 0.80),
            "window_start": window_start,
            "window_end": last_date,
        })
    return pd.DataFrame(records)


def build_tabular_features(
    patients: pd.DataFrame,
    dispenses: pd.DataFrame,
    encounters: pd.DataFrame,
    observations: pd.DataFrame,
    pdc_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Build the tabular feature matrix for XGBoost.
    One row per patient with engineered features.
    """
    rows = []
    pdc_idx = pdc_df.set_index("patient_id")

    for patient_id in pdc_idx.index:
        pdc_row = pdc_idx.loc[patient_id]
        window_start = pdc_row.get("window_start", pd.Timestamp.now() - pd.Timedelta(days=90))
        window_end = pdc_row.get("window_end", pd.Timestamp.now())

        # Refill features
        d = dispenses[dispenses["patient_id"] == patient_id].sort_values("dispense_date")
        d_w = d[(d["dispense_date"] >= window_start) & (d["dispense_date"] <= window_end)]
        gaps = d_w["dispense_date"].diff().dt.days.dropna()

        days_since_last = (window_end - d["dispense_date"].max()).days if not d.empty else 999
        avg_gap = float(gaps.mean()) if not gaps.empty else 999.0
        gap_std = float(gaps.std()) if len(gaps) > 1 else 0.0

        # Encounter features
        e = encounters[encounters["patient_id"] == patient_id]
        e_w = e[(e["encounter_date"] >= window_start) & (e["encounter_date"] <= window_end)]
        missed = len(e_w[e_w["status"].str.lower().str.contains("cancel|noshow", na=False)])
        kept = len(e_w) - missed

        # Appointment streak
        streak = 0
        for _, row in e.sort_values("encounter_date").iloc[::-1].iterrows():
            if str(row.get("status", "")).lower() in ("finished", "arrived", "fulfilled"):
                streak += 1
            else:
                break

        # Vitals
        o = observations[observations["patient_id"] == patient_id]
        o_w = o[(o["observation_date"] >= window_start) & (o["observation_date"] <= window_end)]
        spo2_avg = _vital_mean(o_w, "spo2")
        hr_avg = _vital_mean(o_w, "heart_rate")
        sbp_avg = _vital_mean(o_w, "sbp")

        # Patient demographics
        p = patients[patients["patient_id"] == patient_id]
        if not p.empty:
            p0 = p.iloc[0]
            age = _age(str(p0.get("birth_date", "")))
            gender_enc = 1 if str(p0.get("gender", "")).lower() == "female" else 0
            insurance = str(p0.get("insurance_type", "unknown"))
        else:
            age, gender_enc, insurance = -1, 0, "unknown"

        rows.append({
            "patient_id": patient_id,
            "days_since_last_refill": days_since_last,
            "avg_refill_gap_90d": avg_gap,
            "refill_gap_std": gap_std,
            "total_refills_90d": len(d_w),
            "missed_appointments_90d": missed,
            "kept_appointments_90d": kept,
            "appointment_streak": streak,
            "spo2_avg_7d": spo2_avg,
            "rolling_7d_avg_hr": hr_avg,
            "sbp_avg": sbp_avg,
            "age": age,
            "gender": gender_enc,
            "insurance_type": insurance,
            "medication_count": d["medication_code"].nunique(),
            "days_on_therapy": (window_end - d["dispense_date"].min()).days if not d.empty else 0,
            "pdc": pdc_row["pdc"],
            "adherent": pdc_row["adherent"],
        })

    df = pd.DataFrame(rows)
    df["insurance_type_enc"] = pd.Categorical(df["insurance_type"]).codes
    return df


def build_weekly_timeseries(
    dispenses: pd.DataFrame,
    encounters: pd.DataFrame,
    observations: pd.DataFrame,
    pdc_df: pd.DataFrame,
    window_days: int = OBSERVATION_WINDOW_DAYS,
) -> pd.DataFrame:
    """
    Build a weekly time-series DataFrame for TFT.
    One row per (patient, week). ~12-13 weeks per patient.
    """
    rows = []
    for patient_id, pdc_row in pdc_df.set_index("patient_id").iterrows():
        window_start = pdc_row.get("window_start", pd.Timestamp.now() - pd.Timedelta(days=window_days))
        for week_idx in range(WEEKLY_STEPS):
            wk_s = window_start + pd.Timedelta(weeks=week_idx)
            wk_e = wk_s + pd.Timedelta(weeks=1)
            d_wk = dispenses[
                (dispenses["patient_id"] == patient_id) &
                (dispenses["dispense_date"] >= wk_s) &
                (dispenses["dispense_date"] < wk_e)
            ]
            e_wk = encounters[
                (encounters["patient_id"] == patient_id) &
                (encounters["encounter_date"] >= wk_s) &
                (encounters["encounter_date"] < wk_e)
            ]
            o_wk = observations[
                (observations["patient_id"] == patient_id) &
                (observations["observation_date"] >= wk_s) &
                (observations["observation_date"] < wk_e)
            ]
            rows.append({
                "patient_id": patient_id,
                "week_idx": week_idx,
                "week_start": wk_s,
                "refill_event": int(not d_wk.empty),
                "days_supplied_wk": float(d_wk["days_supply"].sum()) if not d_wk.empty else 0.0,
                "encounter_event": int(not e_wk.empty),
                "spo2_wk": _vital_mean(o_wk, "spo2"),
                "hr_wk": _vital_mean(o_wk, "heart_rate"),
                "pdc_target": pdc_row["pdc"],
            })
    return pd.DataFrame(rows)


def _vital_mean(df: pd.DataFrame, vital: str) -> float:
    if "vital" not in df.columns:
        return -1.0
    s = df[df["vital"] == vital]["value"]
    return float(s.mean()) if not s.empty else -1.0


def _age(birth_str: str) -> int:
    try:
        return int((pd.Timestamp.now() - pd.to_datetime(birth_str)).days / 365.25)
    except Exception:
        return -1


if __name__ == "__main__":
    print("Feature engineering module loaded. Run via scripts/run_pipeline.py")
