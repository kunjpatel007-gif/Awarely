import random
from .hsmm import HSMMState

class NoiseGenerator:
    def __init__(self, patient_id: str):
        self.rng = random.Random(hash(patient_id))
        # Simple implementation for pink noise (Voss-McCartney approximation)
        self.b0 = 0.0
        self.b1 = 0.0
        self.b2 = 0.0
        self.b3 = 0.0
        self.b4 = 0.0
        self.b5 = 0.0
        self.b6 = 0.0
        
    def _pink_noise(self):
        white = self.rng.uniform(-1.0, 1.0)
        self.b0 = 0.99886 * self.b0 + white * 0.0555179
        self.b1 = 0.99332 * self.b1 + white * 0.0750759
        self.b2 = 0.96900 * self.b2 + white * 0.1538520
        self.b3 = 0.86650 * self.b3 + white * 0.3104856
        self.b4 = 0.55000 * self.b4 + white * 0.5329522
        self.b5 = -0.7616 * self.b5 - white * 0.0168980
        pink = self.b0 + self.b1 + self.b2 + self.b3 + self.b4 + self.b5 + self.b6 + white * 0.5362
        self.b6 = white * 0.115926
        return pink * 0.01 # scale down
        
    def overlay(self, ecg: float, ppg: float, state: HSMMState) -> dict:
        noise = self._pink_noise()
        
        motion = 0.0
        if state == HSMMState.PHYSICAL_EXERTION:
            if self.rng.random() < 0.05:
                motion = self.rng.uniform(-0.15, 0.15)
                
        return {
            "ecg": ecg + noise,
            "ppg": ppg + noise + motion
        }
