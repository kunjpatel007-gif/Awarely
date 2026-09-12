"""
=============================================================================
The Vanishing Dose — Federated Node: Hospital A (Urban Healthcare Center)
Author / Implementer: Person A Task (Completed)
Repository Root: D:/manipal h/Hackathon-Manipal
=============================================================================
"""

import sys
from pathlib import Path

# Add project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.federated_sim.hospital_client import HospitalClient


def create_hospital_a_client(n_patients: int = 500) -> HospitalClient:
    """Instantiates Hospital A client representing an urban clinical population."""
    return HospitalClient(
        hospital_id="Hospital_A_Urban",
        n_patients=n_patients,
        noise_factor=0.06,
        random_seed=101
    )


if __name__ == "__main__":
    client = create_hospital_a_client()
    print(f"Initialized {client.hospital_id} with {client.n_patients} private patient records.")
    initial_params = client.get_parameters()
    updated_params, count, metrics = client.fit(initial_params, epochs=10)
    print(f"Local training complete. Sample count: {count}, Metrics: {metrics}")
