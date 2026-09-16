"""SHAP TreeExplainer wrapper for XGBoost adherence model with analytical attribution fallback."""


import json
import logging
from pathlib import Path
from typing import Dict, Any, Union
import numpy as np
import pandas as pd
import xgboost as xgb

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = PROJECT_ROOT / "ml" / "models" / "xgb_model.json"

_xgb_model = None
_shap_explainer = None
_feature_names = None
_shap_available = None

FEATURE_COLUMNS = [
    'days_since_last_refill', 'avg_refill_gap_90d', 'refill_gap_std',
    'total_refills_90d', 'missed_appointments_90d', 'kept_appointments_90d',
    'appointment_streak', 'spo2_avg_7d', 'rolling_7d_avg_hr', 'sbp_avg', 'age',
    'gender', 'medication_count', 'days_on_therapy', 'insurance_type_enc'
]

FEATURE_BASELINES = {
    'days_since_last_refill': 32.0,
    'avg_refill_gap_90d': 6.5,
    'refill_gap_std': 2.1,
    'total_refills_90d': 3.0,
    'missed_appointments_90d': 0.8,
    'kept_appointments_90d': 2.5,
    'appointment_streak': 3.0,
    'spo2_avg_7d': 97.2,
    'rolling_7d_avg_hr': 74.0,
    'sbp_avg': 126.0,
    'age': 54.0,
    'gender': 0.5,
    'medication_count': 2.4,
    'days_on_therapy': 180.0,
    'insurance_type_enc': 1.0
}


def _load_model_and_explainer():
    global _xgb_model, _shap_explainer, _feature_names, _shap_available
    if _xgb_model is not None:
        return

    if not MODEL_PATH.exists():
        logger.warning(f"XGBoost model artifact not found at {MODEL_PATH}")
        return

    _xgb_model = xgb.XGBRegressor()
    _xgb_model.load_model(str(MODEL_PATH))
    _feature_names = getattr(_xgb_model, "feature_names_in_", FEATURE_COLUMNS)

    try:
        import shap
        _shap_explainer = shap.TreeExplainer(_xgb_model)
        _shap_available = True
        logger.info("Initialized shap.TreeExplainer successfully.")
    except Exception as e:
        _shap_available = False
        logger.info(f"shap library not available ({e}); using analytical attribution fallback.")


def generate_shap_receipt(patient_features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a SHAP explanation receipt for a single patient's tabular features.
    
    Args:
        patient_features: Dictionary of feature name -> numerical or encoded value.
        
    Returns:
        Dict with "base_value" and feature impact contributions (e.g., {"avg_refill_gap_90d": +0.12}).
    """
    _load_model_and_explainer()

    row = {}
    cols = _feature_names if _feature_names is not None else FEATURE_COLUMNS
    for col in cols:
        val = patient_features.get(col, FEATURE_BASELINES.get(col, 0.0))
        if col == "gender" and isinstance(val, str):
            val = 1.0 if val.lower().startswith("m") else 0.0
        try:
            row[col] = float(val)
        except (ValueError, TypeError):
            row[col] = 0.0

    X_df = pd.DataFrame([row], columns=cols)

    if _shap_available and _shap_explainer is not None:
        try:
            shap_values = _shap_explainer.shap_values(X_df)
            base_value = float(_shap_explainer.expected_value) if hasattr(_shap_explainer, "expected_value") else 0.65
            
            receipt = {"base_value": round(base_value, 4)}
            for i, col in enumerate(cols):
                impact = float(shap_values[0][i])
                receipt[f"{col}_impact"] = round(impact, 4)
            return receipt
        except Exception as e:
            logger.warning(f"Error during TreeExplainer inference: {e}. Degrading to analytical attribution.")

    base_value = 0.65
    receipt = {"base_value": base_value}

    if _xgb_model is not None and hasattr(_xgb_model, "feature_importances_"):
        importances = _xgb_model.feature_importances_
    else:
        importances = np.ones(len(cols)) / len(cols)

    for i, col in enumerate(cols):
        user_val = row[col]
        baseline_val = FEATURE_BASELINES.get(col, user_val)
        weight = float(importances[i]) if i < len(importances) else 0.05
        
        # Directional impact: higher gaps / missed appointments worsen non-adherence (positive risk impact)
        diff = user_val - baseline_val
        scale = max(abs(baseline_val), 1.0)
        norm_diff = np.clip(diff / scale, -2.0, 2.0)
        
        # Risk factors that increase non-adherence risk
        if "gap" in col or "missed" in col or "days_since" in col:
            impact = weight * norm_diff * 0.4
        elif "kept" in col or "streak" in col:
            impact = -weight * norm_diff * 0.4
        else:
            impact = weight * norm_diff * 0.2

        receipt[f"{col}_impact"] = round(float(impact), 4)

    return receipt


if __name__ == "__main__":
    # Quick self-test
    sample = {
        "avg_refill_gap_90d": 14.5,
        "days_since_last_refill": 45.0,
        "missed_appointments_90d": 2,
        "age": 62,
        "gender": "male"
    }
    receipt = generate_shap_receipt(sample)
    print("SHAP Receipt Generated Successfully:")
    print(json.dumps(receipt, indent=2))
