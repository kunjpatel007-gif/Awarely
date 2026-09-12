"""
run_pipeline.py
End-to-end pipeline: Parse FHIR data -> Feature Engineering -> Train models -> Evaluate

Usage:
    python scripts/run_pipeline.py --synthea-dir data/synthea_output --output-dir data/processed
"""

import argparse
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def main():
    parser = argparse.ArgumentParser(description="The Vanishing Dose — End-to-End Pipeline")
    parser.add_argument("--synthea-dir", type=str, default="data/synthea_output",
                        help="Path to Synthea FHIR bundle directory")
    parser.add_argument("--mimic-dir", type=str, default=None,
                        help="Path to MIMIC-IV Demo NDJSON directory (optional, used for calibration)")
    parser.add_argument("--output-dir", type=str, default="data/processed",
                        help="Path to save processed feature files")
    parser.add_argument("--skip-training", action="store_true",
                        help="Skip model training (only run data processing)")
    args = parser.parse_args()

    synthea_dir = PROJECT_ROOT / args.synthea_dir
    mimic_dir = PROJECT_ROOT / args.mimic_dir if args.mimic_dir else None
    output_dir = PROJECT_ROOT / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    cal_dir = PROJECT_ROOT / "data" / "calibration"
    cal_dir.mkdir(parents=True, exist_ok=True)

    # ── Step 1: Parse FHIR Data ──────────────────────────────────────────────
    print("=" * 60)
    print("STEP 1: Parsing FHIR data")
    print("=" * 60)

    from ingestion.fhir_parser import (
        parse_synthea_bundle_dir, parse_medication_dispenses, 
        parse_encounters, parse_observations, parse_patients
    )

    if not synthea_dir.exists():
        print(f"\nERROR: Synthea directory not found at {synthea_dir}")
        print("Run Synthea first: scripts/generate_synthea.ps1")
        print("\nAlternatively, generate quick test data with:")
        print("  python scripts/run_pipeline.py --generate-test-data")
        sys.exit(1)

    dataframes = parse_synthea_bundle_dir(synthea_dir)
    patients = dataframes["patients"]
    dispenses = dataframes["dispenses"]
    encounters = dataframes["encounters"]
    observations = dataframes["observations"]

    print(f"\n  Patients:     {len(patients)}")
    print(f"  Dispenses:    {len(dispenses)}")
    print(f"  Encounters:   {len(encounters)}")
    print(f"  Observations: {len(observations)}")

    # ── Step 2: Feature Engineering ──────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 2: Feature Engineering")
    print("=" * 60)

    from ingestion.feature_engineering import compute_pdc, build_tabular_features, build_weekly_timeseries

    print("\n  Computing PDC...")
    pdc_df = compute_pdc(dispenses)
    print(f"    Patients with PDC: {len(pdc_df)}")
    print(f"    Mean PDC: {pdc_df['pdc'].mean():.3f}")
    print(f"    Non-adherent (PDC < 0.80): {(pdc_df['adherent'] == 0).sum()} / {len(pdc_df)}")

    print("\n  Building tabular features...")
    tabular_df = build_tabular_features(patients, dispenses, encounters, observations, pdc_df)
    tabular_path = output_dir / "tabular_features.parquet"
    tabular_df.to_parquet(tabular_path, index=False)
    print(f"    Saved to {tabular_path} ({len(tabular_df)} rows x {len(tabular_df.columns)} cols)")

    print("\n  Building weekly time series...")
    weekly_df = build_weekly_timeseries(dispenses, encounters, observations, pdc_df)
    weekly_path = output_dir / "weekly_timeseries.parquet"
    weekly_df.to_parquet(weekly_path, index=False)
    print(f"    Saved to {weekly_path} ({len(weekly_df)} rows)")

    if args.skip_training:
        print("\n  --skip-training flag set. Stopping after data processing.")
        return

    # ── Step 3: Train XGBoost ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 3: Training XGBoost")
    print("=" * 60)

    from ml.train_xgboost import train_and_evaluate
    train_and_evaluate(tabular_path)

    # ── Step 4: Train HMM ────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 4: Training HMM")
    print("=" * 60)

    from ml.train_hmm import main as train_hmm_main
    train_hmm_main()

    # ── Step 5: CQR ─────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 5: Conformal Quantile Regression")
    print("=" * 60)

    from ml.cqr import main as run_cqr
    run_cqr()

    # ── Step 6: Evaluation ───────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 6: Generating Evaluation Charts")
    print("=" * 60)

    from ml.evaluate import main as generate_charts
    generate_charts()

    # ── Done ─────────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"\n  Processed data:  {output_dir}")
    print(f"  Models:          {PROJECT_ROOT / 'ml' / 'models'}")
    print(f"  Charts:          {PROJECT_ROOT / 'ml' / 'outputs'}")
    print(f"\n  Next steps:")
    print(f"    1. Upload ml/train_tft.py to Kaggle (GPU T4) for TFT training")
    print(f"    2. Run dashboard:  streamlit run dashboard/app.py")
    print(f"    3. Run gateway:    uvicorn ingestion.fhir_gateway.main:app --reload")


if __name__ == "__main__":
    main()
