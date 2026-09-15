"""
=============================================================================
The Vanishing Dose — Patient PPG Simulator Adapter
Author: Full-Stack / ML Integration Engineer
Repository Root: D:/manipal h/Hackathon-Manipal

Connects the high-fidelity beat-driven SyntheticPPGSimulator to the backend
WebSocket endpoints, replacing fixed-frequency sinusoidal generators with
physiologically continuous beat-to-beat modeling.
=============================================================================
"""

from typing import Dict, Any
from .synthetic_ppg import SyntheticPPGSimulator, SyntheticPPGConfig


class PatientSimulatorAdapter:
    """
    Adapter wrapping SyntheticPPGSimulator with the tick() interface
    expected by backend WebSocket streaming endpoints.
    """
    def __init__(self, patient_id: str, hmm_state: int, base_hr: float = 70.0):
        self.patient_id = patient_id
        self.hmm_state = hmm_state
        self.base_hr = base_hr
        
        config = SyntheticPPGConfig(
            sample_rate_hz=50.0,
            base_hr=base_hr,
            hmm_state=hmm_state,
            patient_id=patient_id
        )
        self.simulator = SyntheticPPGSimulator(config)

    def tick(self) -> Dict[str, Any]:
        """Generate next 50 Hz sample."""
        return self.simulator.next_sample()

    def get_debug_info(self) -> Dict[str, Any]:
        """Expose internal simulator diagnostics for testing/logging."""
        return self.simulator.get_debug_info()


# Canonical factory function matching existing backend signature
def PatientSimulator(patient_id: str, hmm_state: int, base_hr: float = 70.0) -> PatientSimulatorAdapter:
    return PatientSimulatorAdapter(patient_id, hmm_state, base_hr)


# Backwards compatibility alias
PatientSimulatorV1 = PatientSimulatorAdapter
