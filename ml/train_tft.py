"""
train_tft.py
Temporal Fusion Transformer training for medication adherence prediction.

HOW TO USE ON KAGGLE:
  1. Upload this file as a Kaggle Notebook (or copy-paste into a new notebook)
  2. Settings -> Accelerator -> GPU T4 x2 (free)
  3. Upload data/processed/weekly_timeseries.parquet and data/processed/tabular_features.parquet
     as Kaggle dataset inputs
  4. Run All -> download ml/models/tft_weights.pt when done
"""

import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from pathlib import Path

import torch
import pytorch_lightning as pl
from pytorch_lightning.callbacks import EarlyStopping, LearningRateMonitor
from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
from pytorch_forecasting.data import NaNLabelEncoder
from pytorch_forecasting.metrics import QuantileLoss


# ── Configuration ─────────────────────────────────────────────────────────────

# On Kaggle, data is at /kaggle/input/vanishing-dose-data/
# Locally, it's at data/processed/
KAGGLE_INPUT = Path("/kaggle/input/vanishing-dose-data")
LOCAL_INPUT = Path("data/processed")

DATA_DIR = KAGGLE_INPUT if KAGGLE_INPUT.exists() else LOCAL_INPUT
OUTPUT_DIR = Path("ml/models")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MAX_ENCODER_LENGTH = 8    # 8 weeks of history
MAX_PREDICTION_LENGTH = 4  # predict next 4 weeks
BATCH_SIZE = 32
MAX_EPOCHS = 30
LEARNING_RATE = 0.005


def prepare_tft_data(weekly_df: pd.DataFrame, tabular_df: pd.DataFrame) -> pd.DataFrame:
    """
    Merge weekly time series with static patient features for TFT input.
    TFT needs: time_idx, group_id, target, static categoricals, static reals, time-varying reals.
    """
    # Merge in static features from tabular
    static_cols = ["patient_id", "age", "gender", "medication_count", "insurance_type_enc"]
    static = tabular_df[static_cols].drop_duplicates(subset=["patient_id"])

    df = weekly_df.merge(static, on="patient_id", how="left")

    # TFT requires integer time index
    df["time_idx"] = df["week_idx"].astype(int)

    # Fill NaN vitals with -1 (sentinel for missing)
    for col in ["spo2_wk", "hr_wk"]:
        df[col] = df[col].fillna(-1.0)

    # Ensure patient_id is string for categorical encoding
    df["patient_id"] = df["patient_id"].astype(str)
    df["gender"] = df["gender"].astype(int)
    df["insurance_type_enc"] = df["insurance_type_enc"].astype(int)

    # Target: weekly PDC proxy — use cumulative days_supplied / (7 * (week_idx + 1))
    # For each patient, compute running coverage
    df = df.sort_values(["patient_id", "time_idx"])
    df["cumulative_supply"] = df.groupby("patient_id")["days_supplied_wk"].cumsum()
    df["cumulative_days"] = (df["time_idx"] + 1) * 7
    df["weekly_pdc"] = (df["cumulative_supply"] / df["cumulative_days"]).clip(0, 1)

    return df


def create_datasets(df: pd.DataFrame):
    """Create PyTorch Forecasting TimeSeriesDataSets for train/val."""

    # Only keep patients with enough data
    patient_counts = df.groupby("patient_id")["time_idx"].count()
    valid_patients = patient_counts[patient_counts >= MAX_ENCODER_LENGTH + MAX_PREDICTION_LENGTH].index
    df = df[df["patient_id"].isin(valid_patients)].copy()

    if len(df) == 0:
        raise ValueError("No patients have enough time steps. Check your data.")

    # Train/val split: 80/20 by patient
    patients = df["patient_id"].unique()
    np.random.seed(42)
    np.random.shuffle(patients)
    split_idx = int(0.8 * len(patients))
    train_patients = patients[:split_idx]
    val_patients = patients[split_idx:]

    train_df = df[df["patient_id"].isin(train_patients)]
    val_df = df[df["patient_id"].isin(val_patients)]

    # Define the training dataset
    training = TimeSeriesDataSet(
        train_df,
        time_idx="time_idx",
        target="weekly_pdc",
        group_ids=["patient_id"],
        max_encoder_length=MAX_ENCODER_LENGTH,
        max_prediction_length=MAX_PREDICTION_LENGTH,
        static_categoricals=["gender", "insurance_type_enc"],
        static_reals=["age", "medication_count"],
        time_varying_known_reals=["time_idx"],
        time_varying_unknown_reals=["refill_event", "days_supplied_wk", "encounter_event",
                                     "spo2_wk", "hr_wk", "weekly_pdc"],
        target_normalizer=None,
        categorical_encoders={"gender": NaNLabelEncoder(add_nan=True),
                              "insurance_type_enc": NaNLabelEncoder(add_nan=True)},
        add_relative_time_idx=True,
        add_target_scales=True,
        add_encoder_length=True,
    )

    # Validation dataset from training params
    validation = TimeSeriesDataSet.from_dataset(training, val_df, predict=True, stop_randomization=True)

    train_loader = training.to_dataloader(train=True, batch_size=BATCH_SIZE, num_workers=0)
    val_loader = validation.to_dataloader(train=False, batch_size=BATCH_SIZE, num_workers=0)

    return training, train_loader, val_loader


def train_tft(training: TimeSeriesDataSet, train_loader, val_loader):
    """Train the Temporal Fusion Transformer."""

    # Configure model
    tft = TemporalFusionTransformer.from_dataset(
        training,
        learning_rate=LEARNING_RATE,
        hidden_size=32,
        attention_head_size=2,
        dropout=0.1,
        hidden_continuous_size=16,
        output_size=7,  # 7 quantiles
        loss=QuantileLoss(),
        reduce_on_plateau_patience=3,
    )

    print(f"Model parameters: {tft.size() / 1e3:.1f}k")

    # Trainer
    early_stop = EarlyStopping(monitor="val_loss", patience=5, mode="min")
    lr_monitor = LearningRateMonitor()

    trainer = pl.Trainer(
        max_epochs=MAX_EPOCHS,
        accelerator="auto",  # will use GPU on Kaggle
        devices=1,
        gradient_clip_val=0.1,
        callbacks=[early_stop, lr_monitor],
        enable_progress_bar=True,
    )

    # Train
    trainer.fit(tft, train_dataloaders=train_loader, val_dataloaders=val_loader)

    return tft, trainer


def export_predictions(tft, val_loader, output_path: Path):
    """Export TFT predictions + attention weights for interpretability."""
    predictions = tft.predict(val_loader, return_x=True)

    # Save raw predictions as numpy
    pred_array = predictions.output.cpu().numpy()
    np.save(output_path / "tft_predictions.npy", pred_array)

    # Get attention weights (interpretability)
    interpretation = tft.interpret_output(predictions.output, reduction="sum")
    attention = interpretation["attention"]
    np.save(output_path / "tft_attention.npy", attention.cpu().numpy())

    print(f"Predictions shape: {pred_array.shape}")
    print(f"Saved to {output_path}")


def main():
    print("=" * 60)
    print("TFT Training — The Vanishing Dose")
    print("=" * 60)

    # Load data
    print(f"\nLoading data from {DATA_DIR}...")
    weekly_df = pd.read_parquet(DATA_DIR / "weekly_timeseries.parquet")
    tabular_df = pd.read_parquet(DATA_DIR / "tabular_features.parquet")
    print(f"  Weekly records: {len(weekly_df)}")
    print(f"  Patients: {weekly_df['patient_id'].nunique()}")

    # Prepare
    print("\nPreparing TFT input...")
    df = prepare_tft_data(weekly_df, tabular_df)
    print(f"  Merged records: {len(df)}")

    # Create datasets
    print("\nCreating TimeSeriesDataSets...")
    training, train_loader, val_loader = create_datasets(df)
    print(f"  Training batches: {len(train_loader)}")
    print(f"  Validation batches: {len(val_loader)}")

    # Train
    print("\nTraining TFT...")
    tft, trainer = train_tft(training, train_loader, val_loader)

    # Save model weights
    model_path = OUTPUT_DIR / "tft_weights.pt"
    torch.save(tft.state_dict(), model_path)
    print(f"\nModel saved to {model_path}")

    # Export predictions
    print("\nExporting predictions...")
    export_predictions(tft, val_loader, Path("ml/outputs"))

    print("\n" + "=" * 60)
    print("TFT training complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
