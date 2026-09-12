"""
=============================================================================
The Vanishing Dose — Federated Learning Hospital Client Base
Author / Implementer: Person A Task (Completed)
Repository Root: D:/manipal h/Hackathon-Manipal

PURPOSE:
Simulates a privacy-preserving federated edge node (hospital/health system).
Enables local adherence model training across distributed clinical sites without
sharing raw patient records, complying with HIPAA and privacy regulations.
Implements FedAvg (Federated Averaging) parameter exchange.
=============================================================================
"""

import numpy as np
from typing import Dict, Any, Tuple, List


class HospitalClient:
    """
    Federated learning client representing an isolated hospital site.
    Trains locally on private patient cohorts and communicates only weight updates.
    """
    def __init__(self, hospital_id: str, n_patients: int = 500, noise_factor: float = 0.05, random_seed: int = 42):
        self.hospital_id = hospital_id
        self.n_patients = n_patients
        self.noise_factor = noise_factor
        np.random.seed(random_seed)

        # Generate local synthetic tabular features:
        # [days_since_last_refill, avg_refill_gap_90d, total_refills_90d, missed_appointments, age, vitals_proxy]
        self.X = np.random.randn(n_patients, 6)
        # Ground truth adherence PDC weights with site-specific demographic bias
        true_w = np.array([-0.35, -0.40, 0.30, -0.25, 0.10, 0.05])
        self.y = np.clip(0.70 + np.dot(self.X, true_w) + np.random.normal(0, noise_factor, n_patients), 0.0, 1.0)

        # Local model: Linear Ridge / Gradient Estimator weights (w: 6, b: 1)
        self.weights = np.zeros(6, dtype=np.float32)
        self.bias = 0.70

    def get_parameters(self) -> List[np.ndarray]:
        """Returns local model weights to the central federated coordinator."""
        return [self.weights.copy(), np.array([self.bias], dtype=np.float32)]

    def set_parameters(self, parameters: List[np.ndarray]):
        """Updates local model with global aggregated weights from central coordinator."""
        self.weights = parameters[0].copy()
        self.bias = float(parameters[1][0])

    def fit(self, parameters: List[np.ndarray], epochs: int = 15, lr: float = 0.01) -> Tuple[List[np.ndarray], int, Dict[str, Any]]:
        """
        Trains locally on private patient records using SGD for several local epochs.
        """
        self.set_parameters(parameters)

        # Local gradient descent
        for _ in range(epochs):
            preds = np.dot(self.X, self.weights) + self.bias
            errors = preds - self.y

            grad_w = (2.0 / self.n_patients) * np.dot(self.X.T, errors)
            grad_b = (2.0 / self.n_patients) * np.sum(errors)

            self.weights -= lr * grad_w
            self.bias -= lr * grad_b

        final_loss = float(np.mean((np.dot(self.X, self.weights) + self.bias - self.y) ** 2))
        return self.get_parameters(), self.n_patients, {"local_mse": round(final_loss, 5)}

    def evaluate(self, parameters: List[np.ndarray]) -> Tuple[float, int, Dict[str, Any]]:
        """Evaluates global parameters on local hospital test data."""
        self.set_parameters(parameters)
        preds = np.dot(self.X, self.weights) + self.bias
        mse = float(np.mean((preds - self.y) ** 2))
        mae = float(np.mean(np.abs(preds - self.y)))
        return mse, self.n_patients, {"mae": round(mae, 4)}
