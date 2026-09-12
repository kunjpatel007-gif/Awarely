"""
cqr.py
Conformal Quantile Regression using MAPIE v1.5+.
Wraps the trained XGBoost model with calibrated prediction intervals.
"""

import pandas as pd
import numpy as np
import xgboost as xgb
from mapie.regression import SplitConformalRegressor
from pathlib import Path


def load_data(calib_path: Path, test_path: Path):
    calib_df = pd.read_parquet(calib_path)
    test_df = pd.read_parquet(test_path)
    return calib_df, test_df


DROP_COLS = ["patient_id", "insurance_type", "pdc", "adherent", "window_start", "window_end"]
TARGET_COL = "pdc"


def prepare_features(df: pd.DataFrame):
    cols_to_drop = [c for c in DROP_COLS if c in df.columns]
    X = df.drop(columns=cols_to_drop)
    y = df[TARGET_COL] if TARGET_COL in df.columns else None
    return X, y


def predict_with_interval(mapie_80, mapie_90, features: pd.DataFrame):
    """
    Predict point estimates and intervals at 80% and 90% confidence.
    MAPIE v1.5: predict_interval() returns (y_pred, y_pis)
    where y_pis has shape (n_samples, 2, 1): [:, 0, 0]=lower, [:, 1, 0]=upper
    """
    y_pred_80, y_pis_80 = mapie_80.predict_interval(features)
    _, y_pis_90 = mapie_90.predict_interval(features)

    results = pd.DataFrame({
        "point_estimate": y_pred_80,
        "lower_80": y_pis_80[:, 0, 0],
        "upper_80": y_pis_80[:, 1, 0],
        "interval_width_80": y_pis_80[:, 1, 0] - y_pis_80[:, 0, 0],
        "lower_90": y_pis_90[:, 0, 0],
        "upper_90": y_pis_90[:, 1, 0],
        "interval_width_90": y_pis_90[:, 1, 0] - y_pis_90[:, 0, 0],
    })
    return results


def main():
    base_dir = Path(__file__).resolve().parent.parent

    model_path = base_dir / "ml" / "models" / "xgb_model.json"
    calib_path = base_dir / "data" / "calibration" / "calibration_set.parquet"
    test_path = base_dir / "data" / "calibration" / "test_set.parquet"
    out_dir = base_dir / "ml" / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "cqr_predictions.csv"

    # 1. Load model
    print("Loading XGBoost model...")
    model = xgb.XGBRegressor()
    model.load_model(str(model_path))

    # 2. Load data
    print("Loading data...")
    calib_df, test_df = load_data(calib_path, test_path)

    X_cal, y_cal = prepare_features(calib_df)
    X_test, y_test = prepare_features(test_df)

    # 3. Fit MAPIE SplitConformalRegressor at two confidence levels
    print("Fitting MAPIE SplitConformalRegressor (80% CI)...")
    mapie_80 = SplitConformalRegressor(
        estimator=model,
        confidence_level=0.80,
        prefit=True,
    )
    mapie_80.conformalize(X_cal, y_cal)

    print("Fitting MAPIE SplitConformalRegressor (90% CI)...")
    mapie_90 = SplitConformalRegressor(
        estimator=model,
        confidence_level=0.90,
        prefit=True,
    )
    mapie_90.conformalize(X_cal, y_cal)

    # 4. Predict on test set
    print("Predicting with intervals...")
    results_df = predict_with_interval(mapie_80, mapie_90, X_test)

    # Add patient_id back
    if "patient_id" in test_df.columns:
        results_df.insert(0, "patient_id", test_df["patient_id"].values)

    # 5. Save results
    results_df.to_csv(out_path, index=False)
    print(f"Predictions saved to {out_path}")

    # 6. Compute empirical coverage
    if y_test is not None:
        y_true = y_test.values
        cov_80 = np.mean((y_true >= results_df["lower_80"].values) & (y_true <= results_df["upper_80"].values))
        cov_90 = np.mean((y_true >= results_df["lower_90"].values) & (y_true <= results_df["upper_90"].values))

        print("\nEmpirical Coverage:")
        print(f"  80% Confidence Interval: {cov_80:.4f} (Expected: 0.80)")
        print(f"  90% Confidence Interval: {cov_90:.4f} (Expected: 0.90)")


if __name__ == "__main__":
    main()

