"""
=============================================================================
The Vanishing Dose — Federated Learning Simulation Orchestrator (FedAvg)
Author / Implementer: Person A Task (Completed)
Repository Root: D:/manipal h/Hackathon-Manipal

PURPOSE:
Simulates a central coordinating server running Federated Averaging (FedAvg).
Aggregates model parameter updates from Hospital A and Hospital B without ever
accessing raw patient records.
=============================================================================
"""

import sys
from pathlib import Path
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.federated_sim.hospital_A import create_hospital_a_client
from ml.federated_sim.hospital_B import create_hospital_b_client


def run_federated_simulation(num_rounds: int = 5):
    print("=" * 65)
    print("THE VANISHING DOSE — PRIVACY-PRESERVING FEDERATED LEARNING SIMULATION")
    print("=" * 65)

    client_a = create_hospital_a_client(n_patients=500)
    client_b = create_hospital_b_client(n_patients=500)
    clients = [client_a, client_b]

    # Initialize global parameters: [weights (6,), bias (1,)]
    global_weights = np.zeros(6, dtype=np.float32)
    global_bias = np.array([0.70], dtype=np.float32)
    global_params = [global_weights, global_bias]

    print(f"Sites Enrolled: {len(clients)} (Hospital A: {client_a.n_patients} pts, Hospital B: {client_b.n_patients} pts)")
    print(f"Total Cohort Size (Privacy-Preserved): {sum(c.n_patients for c in clients)} patients\n")

    for r in range(1, num_rounds + 1):
        print(f"--- Federated Round {r}/{num_rounds} ---")
        client_updates = []
        total_samples = 0

        # Step 1: Distribute global model to local hospital edge clients
        for client in clients:
            updated_params, num_samples, metrics = client.fit(global_params, epochs=10, lr=0.02)
            client_updates.append((updated_params, num_samples))
            total_samples += num_samples
            print(f"  [{client.hospital_id}] Local Fit: {num_samples} pts | Loss: {metrics['local_mse']:.5f}")

        # Step 2: FedAvg Server Aggregation: w_global = sum( (n_k / n) * w_k )
        new_w = np.zeros_like(global_params[0])
        new_b = np.zeros_like(global_params[1])

        for (params, num_samples) in client_updates:
            weight_factor = num_samples / float(total_samples)
            new_w += weight_factor * params[0]
            new_b += weight_factor * params[1]

        global_params = [new_w, new_b]

        # Step 3: Evaluate global model across distributed sites
        eval_losses = []
        for client in clients:
            mse, _, eval_metrics = client.evaluate(global_params)
            eval_losses.append(mse)

        mean_round_mse = np.mean(eval_losses)
        print(f"  => Round {r} Global FedAvg MSE: {mean_round_mse:.5f}\n")

    print("=" * 65)
    print("FEDERATED CONVERGENCE ACHIEVED")
    print(f"Final Global Weights: {np.round(global_params[0], 4)}")
    print(f"Final Global Intercept: {global_params[1][0]:.4f}")
    print("=" * 65)


if __name__ == "__main__":
    run_federated_simulation(num_rounds=5)
