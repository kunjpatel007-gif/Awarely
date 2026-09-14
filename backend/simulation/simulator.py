import time
import math
from .circadian import CircadianModel
from .hsmm import HSMM, HSMMState
from .autonomic import AutonomicModel
from .ecg_synth import ECGSynth
from .ppg_synth import PPGSynth
from .noise import NoiseGenerator

class SimulatorV2:
    def __init__(self, patient_id: str, hmm_state: int, base_hr: float = 70.0):
        self.patient_id = patient_id
        self.hmm_state = hmm_state
        
        self.t = 0.0
        self.dt = 1.0 / 50.0 # 50 Hz
        
        self.circadian = CircadianModel(mesor=base_hr)
        self.hsmm = HSMM(patient_id)
        self.autonomic = AutonomicModel()
        self.ecg = ECGSynth()
        self.ppg = PPGSynth()
        self.noise = NoiseGenerator(patient_id)
        
        self.current_hr = self.circadian.hr_at(0)
        
    def tick(self) -> dict:
        now_ms = int(time.time() * 1000)
        
        hsmm_state = self.hsmm.step(self.dt, self.hmm_state)
        
        # State-based HR offset and sympathetic drive
        hr_offset = 0.0
        sympathetic_drive = 0.0
        if hsmm_state == HSMMState.LIGHT_ACTIVITY:
            hr_offset = 15.0
        elif hsmm_state == HSMMState.PSYCHOLOGICAL_STRESS:
            hr_offset = 30.0
            sympathetic_drive = 0.8
        elif hsmm_state == HSMMState.PHYSICAL_EXERTION:
            hr_offset = 50.0
            sympathetic_drive = 1.0
        elif hsmm_state == HSMMState.SLEEP:
            hr_offset = -10.0
            
        target_hr = self.circadian.hr_at(self.t) + hr_offset
        
        self.current_hr = self.autonomic.step(self.current_hr, target_hr, self.dt, hsmm_state)
        
        # HRV scaling: HRV_baseline(HR) = k / HR^2
        # k calibrated to 30000.0 to ensure 4-second SDNN > 25ms threshold at rest
        k = 30000.0
        hrv_amp = k / (self.current_hr**2) if self.current_hr > 0 else 0
        rsa = math.sin(2 * math.pi * 0.25 * self.t) # Respiratory sinus arrhythmia
        instantaneous_hr = self.current_hr + hrv_amp * rsa
        
        ecg_val = self.ecg.sample(instantaneous_hr, self.dt)
        phase = (math.atan2(self.ecg.y, self.ecg.x) + math.pi) / (2 * math.pi)
        
        ppg_val = self.ppg.sample(instantaneous_hr, phase, sympathetic_drive)
        
        noisy = self.noise.overlay(ecg_val, ppg_val, hsmm_state)
        final_ppg = noisy["ppg"]
        
        # normalize
        final_ppg = final_ppg / 2.0
        raw_ir = int(50000 + (final_ppg * 5000))
        
        self.t += self.dt
        
        return {
            "timestamp": now_ms,
            "ppg": round(final_ppg, 4),
            "raw_ir": raw_ir,
            "source": "SYNTHETIC_V2"
        }
