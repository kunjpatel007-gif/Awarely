"""
XGBoost training script for predicting PDC.
"""

import logging
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
CALIBRATION_DIR = PROJECT_ROOT / "data" / "calibration"
MODELS_DIR = PROJECT_ROOT / "ml" / "models"
OUTPUTS_DIR = PROJECT_ROOT / "ml" / "outputs"



def train_and_evaluate(data_path: Path = None) -> None:
    """Train XGBoost regression model. Called by run_pipeline.py or standalone."""
    # Ensure directories exist
    CALIBRATION_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

    if data_path is None:
        data_path = DATA_PROCESSED_DIR / "tabular_features.parquet"
    data_path = Path(data_path)

    if not data_path.exists():
        logger.error(f"Data file not found at {data_path}")
        return

    logger.info(f"Loading data from {data_path}...")
    df = pd.read_parquet(data_path)

    # Prepare features and target
    target_col = "pdc"
    non_feature_cols = ["patient_id", "insurance_type", "window_start", "window_end", target_col, "adherent"]

    # Drop missing target rows
    df = df.dropna(subset=[target_col])

    feature_cols = [c for c in df.columns if c not in non_feature_cols]

    X = df[feature_cols]
    y = df[target_col]

    logger.info(f"Data shape: {df.shape}")
    logger.info(f"Number of features: {len(feature_cols)}")
    logger.info(f"Features: {feature_cols}")

    # Split: 60% train, 20% calibration, 20% test
    X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.4, random_state=42)
    X_cal, X_test, y_cal, y_test = train_test_split(X_temp, y_temp, test_size=0.5, random_state=42)

    logger.info(f"Train size: {len(X_train)}")
    logger.info(f"Calibration size: {len(X_cal)}")
    logger.info(f"Test size: {len(X_test)}")

    # Save calibration and test sets for CQR
    cal_path = CALIBRATION_DIR / "calibration_set.parquet"
    test_path = CALIBRATION_DIR / "test_set.parquet"
    df.loc[X_cal.index].to_parquet(cal_path, index=False)
    df.loc[X_test.index].to_parquet(test_path, index=False)
    logger.info(f"Saved calibration set to {cal_path}")
    logger.info(f"Saved test set to {test_path}")

    # Train model
    logger.info("Training XGBRegressor...")
    model = XGBRegressor(
        max_depth=6,
        n_estimators=200,
        learning_rate=0.05,
        objective="reg:squarederror",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    mae = mean_absolute_error(y_test, y_pred)

    logger.info(f"Test RMSE: {rmse:.4f}")
    logger.info(f"Test MAE:  {mae:.4f}")

    # Save model
    model_path = MODELS_DIR / "xgb_model.json"
    model.save_model(str(model_path))
    logger.info(f"Saved model to {model_path}")

    # Feature Importance
    importance = model.feature_importances_
    feat_imp = pd.DataFrame({"Feature": feature_cols, "Importance": importance})
    feat_imp = feat_imp.sort_values(by="Importance", ascending=False).head(20)

    plt.figure(figsize=(10, 8))
    plt.barh(feat_imp["Feature"], feat_imp["Importance"], color="skyblue")
    plt.gca().invert_yaxis()
    plt.xlabel("Importance")
    plt.title("Top 20 Feature Importances (XGBoost)")
    plt.tight_layout()

    plot_path = OUTPUTS_DIR / "feature_importance.png"
    plt.savefig(plot_path, dpi=150)
    plt.close()
    logger.info(f"Saved feature importance plot to {plot_path}")

    logger.info("XGBoost training complete.")


# Alias for backward compat
main = train_and_evaluate


if __name__ == "__main__":
    train_and_evaluate()

