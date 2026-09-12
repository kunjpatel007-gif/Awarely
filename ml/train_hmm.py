"""
Trains a Hidden Markov Model to categorize patients into adherence states.
"""
import pandas as pd
import numpy as np
from hmmlearn.hmm import CategoricalHMM
import joblib
from pathlib import Path
import sys

def prepare_data(df: pd.DataFrame):
    """
    Extract weekly features and discretize into observation symbols.
    0 = no refill + no encounter
    1 = refill only
    2 = encounter only
    3 = both refill and encounter
    """
    # Sort to ensure sequences are ordered by patient and week
    if 'week_start' in df.columns:
        df = df.sort_values(['patient_id', 'week_start'])
    else:
        df = df.sort_values(['patient_id'])
    
    # Calculate symbols
    df['refill_flag'] = (df['refill_event'] > 0).astype(int)
    df['encounter_flag'] = (df['encounter_event'] > 0).astype(int)
    
    # 0: None, 1: Refill, 2: Encounter, 3: Both
    df['symbol'] = df['refill_flag'] * 1 + df['encounter_flag'] * 2
    
    # Extract sequences and lengths
    X = df[['symbol']].values
    lengths = df.groupby('patient_id').size().values
    
    return X, lengths, df

def train_hmm(X: np.ndarray, lengths: np.ndarray, n_components: int = 3):
    """
    Train a Categorical HMM.
    """
    # 3 hidden states, 4 possible observations
    model = CategoricalHMM(n_components=n_components, n_iter=100, random_state=42)
    model.fit(X, lengths)
    return model

def decode_states(model, X, lengths, df):
    """
    Decode states using Viterbi algorithm.
    """
    hidden_states = model.predict(X, lengths)
    df['hmm_state'] = hidden_states
    
    # Keep sequence
    cols = ['patient_id', 'hmm_state']
    if 'week_start' in df.columns:
        cols.insert(1, 'week_start')
        
    patient_states = df[cols].copy()
    return patient_states

def main():
    base_dir = Path(r"c:\Projects\MANIPAL HACKATHON 26")
    if str(base_dir) not in sys.path:
        sys.path.append(str(base_dir))
        
    data_path = base_dir / "data" / "processed" / "weekly_timeseries.parquet"
    models_dir = base_dir / "ml" / "models"
    outputs_dir = base_dir / "ml" / "outputs"
    
    models_dir.mkdir(parents=True, exist_ok=True)
    outputs_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Loading data from {data_path}...")
    try:
        df = pd.read_parquet(data_path)
    except FileNotFoundError:
        print(f"Error: {data_path} not found. Please run the ingestion pipeline first.")
        return
        
    print("Preparing data for HMM...")
    X, lengths, processed_df = prepare_data(df)
    
    print("Training CategoricalHMM...")
    model = train_hmm(X, lengths, n_components=3)
    
    print("Transition Matrix:")
    print(model.transmat_)
    print("Emission Probabilities (State Means):")
    print(model.emissionprob_)
    
    print("Decoding states...")
    states_df = decode_states(model, X, lengths, processed_df)
    
    out_csv = outputs_dir / "hmm_states.csv"
    states_df.to_csv(out_csv, index=False)
    print(f"Saved decoded states to {out_csv}")
    
    model_path = models_dir / "hmm_model.pkl"
    joblib.dump(model, model_path)
    print(f"Saved model to {model_path}")

if __name__ == "__main__":
    main()
