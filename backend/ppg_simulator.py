import time
import random
import math
import os
from .simulation.simulator import SimulatorV2

SIMULATOR_V2 = os.getenv("SIMULATOR_V2", "True").lower() in ("true", "1", "yes")

class PatientSimulatorV1:
    def __init__(self, patient_id: str, hmm_state: int):
        self.patient_id = patient_id
        self.hmm_state = hmm_state
        
        # Unique baseline HR and noise seed
        random.seed(hash(patient_id))
        self.baseline_hr = random.uniform(60, 85)
        self.noise_seed = random.uniform(0, 1000)
        
        self.state = "NORMAL"
        self.state_time = time.time()
        
        # Current simulated values for smooth transitions
        self.current_hr = self.baseline_hr
        
        # Time tracking for waveform generation
        self.t = 0.0
        self.dt = 1.0 / 50.0  # 50Hz
        
        # Event scheduling
        self._schedule_next_event()
        
    def _schedule_next_event(self):
        now = time.time()
        if self.state == "NORMAL":
            # Poisson process for stress episodes
            # Base rate: 1 episode every 4 minutes (240 seconds)
            rate = 1 / 240.0
            if self.hmm_state == 2:
                rate *= 3.0
            # Time until next episode (exponential distribution)
            # Add a safety bounds to avoid infinite wait or instant trigger
            wait_time = random.expovariate(rate) if rate > 0 else 240
            self.next_event_time = now + wait_time
        else:
            # STRESS_EPISODE
            # Lasts 30-90 seconds
            duration = random.uniform(30, 90)
            self.next_event_time = now + duration

    def _update_state(self):
        now = time.time()
        if now >= self.next_event_time:
            if self.state == "NORMAL":
                self.state = "STRESS_EPISODE"
            else:
                self.state = "NORMAL"
            self.state_time = now
            self._schedule_next_event()

    def tick(self) -> dict:
        self._update_state()
        now_ms = int(time.time() * 1000)
        
        # Determine target HR and noise level based on state
        if self.state == "STRESS_EPISODE":
            target_hr = random.uniform(95, 120)
            noise_amp = 0.05
            hrv_factor = 0.01  # Lower HRV
        else:
            target_hr = self.baseline_hr
            noise_amp = 0.02
            hrv_factor = 0.05  # Higher HRV
            
        # Smooth transition for HR
        alpha = 0.02
        self.current_hr = self.current_hr * (1 - alpha) + target_hr * alpha
        
        # Introduce HRV (Heart Rate Variability)
        # We modulate the HR slightly based on breathing/randomness
        respiratory_modulation = math.sin(2 * math.pi * 0.25 * self.t)  # ~15 breaths per min
        instantaneous_hr = self.current_hr + (self.current_hr * hrv_factor * respiratory_modulation)
        
        # Frequency in Hz
        f = instantaneous_hr / 60.0
        
        # Proper cardiac waveform shape using harmonics
        # Fundamental, dicrotic notch approximation
        phase = 2 * math.pi * f * self.t
        ppg_val = (
            math.sin(phase) 
            + 0.5 * math.sin(2 * phase + math.pi/4) 
            + 0.25 * math.sin(3 * phase + math.pi/8)
        )
        
        # Normalize somewhat and add noise
        ppg_val = ppg_val / 1.75
        
        # Add high-frequency noise
        noise = random.uniform(-noise_amp, noise_amp)
        ppg_val += noise
        
        # Generate raw_ir as an integer (typical values in tens of thousands)
        raw_ir = int(50000 + (ppg_val * 5000))
        
        self.t += self.dt
        
        return {
            "timestamp": now_ms,
            "ppg": round(ppg_val, 4),
            "raw_ir": raw_ir,
            "source": "SYNTHETIC"
        }

def PatientSimulator(patient_id: str, hmm_state: int, base_hr: float = 70.0):
    if SIMULATOR_V2:
        return SimulatorV2(patient_id, hmm_state, base_hr)
    return PatientSimulatorV1(patient_id, hmm_state)
