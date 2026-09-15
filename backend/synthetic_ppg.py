"""
=============================================================================
The Vanishing Dose — Continuous Physiological PPG & Beat-to-Beat Simulator
Repository Root: D:/manipal h/Hackathon-Manipal
Author: Full-Stack / ML Integration Engineer

MATHEMATICAL ARCHITECTURE & PHYSIOLOGICAL FOUNDATIONS:
1. Fundamental Principle: Simulate Beats, Not BPM
   - Traditional synthetic telemetry creates artificial fixed-frequency sinusoids:
         sin(2 * pi * 1.2 * t)  -> fixed 1.2 Hz = 72 BPM
   - This simulator abolishes fixed frequency and directly simulates cardiac
     depolarization and ventricular ejection timing (RR / NN intervals).
   - The displayed heart rate and HRV metrics are NEVER generated directly.
     They EMERGE mathematically through SciPy peak detection on the continuous
     emitted PPG waveform:
         [Physiological State]
                 ↓
         [Correlated RR Intervals (Ornstein-Uhlenbeck + RSA)]
                 ↓
         [Discrete Beat Occurrence Times: t_beat[n+1] = t_beat[n] + RR[n]]
                 ↓
         [Dual-Component Asymmetric Gaussian PPG Pulse Morphology]
                 ↓
         [Sampled 50 Hz PPG Waveform + Drift + Noise]
                 ↓
         [Backend SciPy find_peaks()]
                 ↓
         [Extracted Peak Differences -> RR Intervals -> HR, SDNN, RMSSD]

2. Stochastic Process for RR Intervals:
   - Ornstein-Uhlenbeck mean-reverting process for slow, correlated baseline shifts:
         x[n+1] = x[n] + kappa * (0.0 - x[n]) * dt_beat + sigma_ou * sqrt(dt_beat) * epsilon[n]
     where:
         kappa: mean reversion speed (0.5 - 1.0 s^-1)
         sigma_ou: physiological volatility scale (0.025 - 0.040 s / sqrt(s))
         epsilon[n] ~ N(0, 1) standard normal variate
   - Respiratory Sinus Arrhythmia (RSA):
         RSA(t) = A_rsa * sin(2 * pi * f_resp * t + phi_resp)
     where:
         f_resp: ~0.25 Hz (normal 15 breaths/min respiration)
         A_rsa: 25 - 40 ms modulation under vagal tone; dampened during stress.
   - Beat interval:
         RR[n] = mu_RR + x[n] + RSA(t_n)
     where mu_RR = 60.0 / base_hr (baseline interval in seconds).

3. Pulse Morphology Model:
   - For each beat n occurring at t_beat[n] with interval T = RR[n]:
     tau = t - t_beat[n]  for 0 <= tau < 1.25 * T
     - Systolic component (rapid upstroke, gentle downstroke):
           P_sys(tau) = A_sys * exp(-0.5 * ((tau - mu_sys) / sigma_sys)^2)
           where sigma_sys = sigma_up (tau < mu_sys) or sigma_down (tau >= mu_sys)
           mu_sys = 0.14 * T, sigma_up = 0.04 * T, sigma_down = 0.09 * T
     - Dicrotic notch and diastolic reflection wave:
           P_dia(tau) = A_dia * exp(-0.5 * ((tau - mu_dia) / sigma_dia)^2)
           mu_dia = 0.38 * T, sigma_dia = 0.07 * T, A_dia = 0.26 * A_sys
   - This morphology guarantees that the systolic peak is prominent and easily
     detected by find_peaks(distance=20, prominence=0.15), while the dicrotic peak
     is safely below prominence and within the refractory window.

4. 50 Hz Continuous Streaming:
   - Sample period Ts = 1.0 / 50.0 = 0.020 seconds (20 ms).
   - Internal state is strictly preserved across calls (no phase resets).
=============================================================================
"""

import time
import math
import hashlib
from collections import deque
from dataclasses import dataclass
from typing import Dict, Any, List, Optional
import numpy as np


@dataclass
class SyntheticPPGConfig:
    """
    Configurable parameters for the physiological PPG simulator.
    These are MODEL PARAMETERS, NOT hardcoded physiological measurements.
    """
    sample_rate_hz: float = 50.0             # 50 Hz sampling (20 ms period)
    base_hr: float = 72.0                    # Patient baseline heart rate tendency (BPM)
    kappa: float = 0.70                      # Mean-reversion speed of the OU process (1/s)
    sigma_ou: float = 0.050                  # Moderated stochastic variability scale for slight twitching
    f_resp: float = 0.24                     # Respiration frequency (~14.4 breaths/min)
    a_rsa_normal: float = 0.045              # Moderated normal RSA amplitude (seconds, ~45 ms)
    a_rsa_stress: float = 0.015              # Blunted RSA amplitude during stress (~10 ms)
    noise_std: float = 0.015                 # Measurement sensor noise scale
    drift_freq: float = 0.04                 # Slow baseline drift frequency (Hz)
    drift_amp: float = 0.03                  # Slow baseline drift amplitude
    hmm_state: int = 0                       # Patient latent cognitive state (0=Stable, 1=Variable, 2=Burnout)
    patient_id: str = "default"              # Patient identifier for deterministic continuity
    seed: Optional[int] = None               # Optional PRNG seed


class SyntheticPPGSimulator:
    """
    Continuous, stateful, beat-driven PPG signal synthesizer.
    Simulates individual heartbeats and emits raw 50 Hz PPG samples.
    """

    def __init__(self, config: Optional[SyntheticPPGConfig] = None):
        self.config = config or SyntheticPPGConfig()
        self.fs = float(self.config.sample_rate_hz)
        self.dt = 1.0 / self.fs

        # Derive deterministic seed from patient_id if not explicitly provided
        if self.config.seed is not None:
            seed_val = self.config.seed
        else:
            h = hashlib.sha256(self.config.patient_id.encode("utf-8")).hexdigest()
            seed_val = int(h[:8], 16) % (2**31 - 1)
        self.rng = np.random.RandomState(seed_val)

        # Baseline RR interval (in seconds) derived from baseline HR parameter
        self.base_hr = max(45.0, min(140.0, float(self.config.base_hr)))
        self.mu_rr = 60.0 / self.base_hr

        # State for Ornstein-Uhlenbeck process (deviation from baseline RR)
        self.x = 0.0

        # Stress and autonomic state
        self.is_stressed = bool(self.config.hmm_state == 2)
        self.stress_target_offset_bpm = 22.0 if self.is_stressed else 0.0
        self.current_stress_offset = self.stress_target_offset_bpm
        self.time_in_state = 0.0
        self.state_duration = float(self.rng.uniform(30.0, 90.0))

        # Time & pulse scheduling state
        self.t = 0.0
        self.sample_index = 0
        self.active_beats: deque = deque()
        self.next_beat_time = 0.05  # First beat starts shortly after t=0

        # Phase offsets for respiration and drift
        self.phi_resp = float(self.rng.uniform(0, 2 * math.pi))
        self.phi_drift = float(self.rng.uniform(0, 2 * math.pi))

        # History of simulated RR intervals for internal diagnostics
        self.recent_simulated_rrs: deque = deque(maxlen=100)

    def _update_autonomic_state(self):
        """
        Implements a 5-state Hidden Semi-Markov Model (HSMM) with log-normal dwell times.
        States: 0=RESTING, 1=LIGHT_ACTIVITY, 2=PSYCHOLOGICAL_STRESS, 3=PHYSICAL_EXERTION, 4=SLEEP.
        HMM state biases the transition probabilities.
        """
        self.time_in_state += self.dt
        if self.time_in_state >= self.state_duration:
            self.time_in_state = 0.0
            
            # Transition logic biased by the clinical HMM state
            if self.config.hmm_state == 2: # Volatile: high stress/exertion
                probs = [0.10, 0.20, 0.50, 0.15, 0.05]
            elif self.config.hmm_state == 1: # Intermittent
                probs = [0.30, 0.35, 0.20, 0.10, 0.05]
            else: # Stable
                probs = [0.50, 0.30, 0.05, 0.05, 0.10]
                
            # Choose next state (0 to 4)
            next_state = int(self.rng.choice(5, p=probs))
            
            # Log-normal dwell times (μ, σ) in seconds
            dwell_params = {
                0: (4.0, 0.5),  # RESTING (~50s)
                1: (3.5, 0.4),  # LIGHT_ACTIVITY (~33s)
                2: (3.8, 0.6),  # PSYCHOLOGICAL_STRESS (~44s)
                3: (3.2, 0.3),  # PHYSICAL_EXERTION (~24s)
                4: (5.0, 0.8)   # SLEEP (~150s)
            }
            mu, sigma = dwell_params[next_state]
            self.state_duration = float(self.rng.lognormal(mean=mu, sigma=sigma))
            
            # Map state to sympathetic drive (is_stressed flag and target HR offset)
            self.is_stressed = (next_state == 2 or next_state == 3)
            
            if next_state == 0: self.stress_target_offset_bpm = 0.0
            elif next_state == 1: self.stress_target_offset_bpm = 8.0
            elif next_state == 2: self.stress_target_offset_bpm = 20.0
            elif next_state == 3: self.stress_target_offset_bpm = 35.0
            elif next_state == 4: self.stress_target_offset_bpm = -10.0

        # Smooth transition of sympathetic tone (avoid discontinuous step jumps)
        alpha = 0.01
        self.current_stress_offset = (1.0 - alpha) * self.current_stress_offset + alpha * self.stress_target_offset_bpm

    def _schedule_beat(self, t_onset: float):
        """
        Schedules a discrete cardiac beat at t_onset with a correlated RR interval.
        """
        self._update_autonomic_state()

        # Circadian Cosine Baseline (Process C)
        # Assuming t is in seconds, a 24h cycle is 86400s. 
        # A_1 is amplitude (5 BPM). phi is a random phase shift per patient.
        circadian_component = 5.0 * math.cos(2.0 * math.pi * (self.t / 86400.0) + self.phi_drift)
        
        # Effective baseline HR taking into account gradual sympathetic tone and circadian rhythm
        effective_base_hr = self.base_hr + self.current_stress_offset + circadian_component
        effective_mu_rr = 60.0 / effective_base_hr

        # Advance Ornstein-Uhlenbeck process by one beat interval
        dt_beat = effective_mu_rr
        ou_drift = self.config.kappa * (0.0 - self.x) * dt_beat
        ou_diffusion = self.config.sigma_ou * math.sqrt(dt_beat) * float(self.rng.normal(0, 1))
        self.x += ou_drift + ou_diffusion

        # Constrain OU deviation to physiological limits (+/- 30% of baseline interval)
        max_dev = 0.30 * effective_mu_rr
        self.x = max(-max_dev, min(max_dev, self.x))

        # Respiratory Sinus Arrhythmia (RSA) modulation
        a_rsa = self.config.a_rsa_stress if self.is_stressed else self.config.a_rsa_normal
        rsa = a_rsa * math.sin(2.0 * math.pi * self.config.f_resp * t_onset + self.phi_resp)

        # Resulting beat-to-beat RR interval in seconds
        rr = effective_mu_rr + self.x + rsa

        # Physiological bounds (40 BPM = 1.50 s, 160 BPM = 0.375 s)
        rr = max(0.40, min(1.45, rr))
        self.recent_simulated_rrs.append(rr)

        # Pulse morphology parameters scaled by beat duration RR
        dicrotic_amp = 0.16 if self.is_stressed else 0.28
        
        # Offset to place the R-peak exactly at t_onset, delaying the PPG by Pulse Transit Time (~0.15s)
        qt_interval = 0.35 * math.sqrt(rr) # Bazett's formula for T-wave positioning

        beat = {
            "t_onset": t_onset,
            "rr": rr,
            # PPG parameters (delayed relative to ECG R-peak)
            "mu_sys": 0.15 * rr,  # Delayed after R-peak
            "sigma_up": 0.04 * rr,
            "sigma_down": 0.09 * rr,
            "mu_dia": 0.38 * rr,
            "sigma_dia": 0.07 * rr,
            "amp_sys": 1.0,
            "amp_dia": dicrotic_amp,
            
            # ECG parameters (centered around t_onset=0)
            "p_mu": -0.15 * rr,
            "p_sigma": 0.02 * rr,
            "q_mu": -0.03 * rr,
            "q_sigma": 0.01 * rr,
            "r_mu": 0.0,
            "r_sigma": 0.015 * rr,
            "s_mu": 0.03 * rr,
            "s_sigma": 0.01 * rr,
            "t_mu": qt_interval,
            "t_sigma": 0.04 * rr,
            
            "duration": 1.25 * rr
        }
        self.active_beats.append(beat)
        self.next_beat_time = t_onset + rr

    def next_sample(self) -> Dict[str, Any]:
        """
        Generates and returns the single next 50 Hz PPG and ECG sample in sequence.
        Maintains internal streaming continuity.
        """
        # Schedule any beats whose occurrence time has arrived
        while self.t >= self.next_beat_time:
            self._schedule_beat(self.next_beat_time)

        # Accumulate pulse amplitudes from all overlapping active beats
        p_val = 0.0
        ecg_val = 0.0
        retained_beats = deque()

        for b in self.active_beats:
            tau = self.t - b["t_onset"]
            # Tau can be negative because ECG P-wave starts before t_onset (R-peak)
            # We retain the beat as long as tau < b["duration"]
            if tau >= b["duration"]:
                # Pulse has completely decayed; do not retain
                continue

            # Active beat: compute systolic and diastolic PPG components
            # Avoid math domain error if tau is highly negative for PPG, though Gaussian drops to 0 anyway
            if tau < b["mu_sys"]:
                p_sys = b["amp_sys"] * math.exp(-0.5 * ((tau - b["mu_sys"]) / b["sigma_up"])**2)
            else:
                p_sys = b["amp_sys"] * math.exp(-0.5 * ((tau - b["mu_sys"]) / b["sigma_down"])**2)

            p_dia = b["amp_dia"] * math.exp(-0.5 * ((tau - b["mu_dia"]) / b["sigma_dia"])**2)
            p_val += p_sys + p_dia
            
            # Active beat: compute ECG components (P, Q, R, S, T)
            ecg_p = 0.15 * math.exp(-0.5 * ((tau - b["p_mu"]) / b["p_sigma"])**2)
            ecg_q = -0.15 * math.exp(-0.5 * ((tau - b["q_mu"]) / b["q_sigma"])**2)
            ecg_r = 1.20 * math.exp(-0.5 * ((tau - b["r_mu"]) / b["r_sigma"])**2)
            ecg_s = -0.25 * math.exp(-0.5 * ((tau - b["s_mu"]) / b["s_sigma"])**2)
            ecg_t = 0.30 * math.exp(-0.5 * ((tau - b["t_mu"]) / b["t_sigma"])**2)
            ecg_val += ecg_p + ecg_q + ecg_r + ecg_s + ecg_t

            retained_beats.append(b)

        self.active_beats = retained_beats

        # Superimpose slow vasomotor baseline drift and subtle measurement noise
        drift = self.config.drift_amp * math.sin(2.0 * math.pi * self.config.drift_freq * self.t + self.phi_drift)
        noise = float(self.rng.normal(0, self.config.noise_std))

        # Center AC signal roughly around zero [-0.5, 1.0]
        ppg_sample = p_val + drift + noise - 0.20
        
        # ECG baseline drift is typically lower frequency and amplitude
        ecg_drift = self.config.drift_amp * 0.3 * math.sin(2.0 * math.pi * (self.config.drift_freq * 0.5) * self.t + self.phi_drift)
        ecg_noise = float(self.rng.normal(0, self.config.noise_std * 0.5))
        ecg_sample = ecg_val + ecg_drift + ecg_noise

        # Typical raw IR photodetector reading for MAX30102 sensor
        raw_ir = int(52000 + (ppg_sample * 5500))

        # Advance internal continuous time
        now_ms = int(time.time() * 1000)
        self.t += self.dt
        self.sample_index += 1

        return {
            "timestamp": now_ms,
            "ppg": round(float(ppg_sample), 4),
            "ecg": round(float(ecg_sample), 4),
            "source": "SYNTHETIC",
            "raw_ir": raw_ir
        }

    def generate_samples(self, n: int) -> List[Dict[str, Any]]:
        """
        Generates n consecutive samples while preserving internal continuous state.
        """
        return [self.next_sample() for _ in range(n)]

    def get_debug_info(self) -> Dict[str, Any]:
        """
        Returns simulator internal diagnostic state for logging/testing.
        Does not expose raw metrics to production clinician UI.
        """
        rrs = list(self.recent_simulated_rrs)
        mean_rr = float(np.mean(rrs)) if rrs else self.mu_rr
        return {
            "time_elapsed_s": round(self.t, 2),
            "sample_count": self.sample_index,
            "active_beats_count": len(self.active_beats),
            "current_ou_state_s": round(self.x, 4),
            "is_stressed": self.is_stressed,
            "current_stress_offset_bpm": round(self.current_stress_offset, 2),
            "recent_simulated_mean_rr_ms": round(mean_rr * 1000.0, 1),
            "implied_instantaneous_hr": round(60.0 / mean_rr, 1) if mean_rr > 0 else 0.0
        }
