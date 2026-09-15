"""
=============================================================================
The Vanishing Dose — JITAI (Just-In-Time Adaptive Intervention) HRV Logic
Author: Full-Stack / ML Integration Engineer
Repository Root: D:/manipal h/Hackathon-Manipal

EXHAUSTIVE MATHEMATICAL DOCUMENTATION & CLINICAL STANDARDS:
1. 50 Hz Sampling Interval:
       Fs = 50.0 Hz
       Ts = 1.0 / Fs = 0.020 seconds = 20.0 milliseconds per sample (MS_PER_SAMPLE)

2. Peak Detection & Beat-to-Beat RR Intervals:
       Given a discrete PPG buffer [p_0, p_1, ..., p_{N-1}], systolic peaks are
       identified using SciPy `find_peaks(signal, distance=20, prominence=0.15)`.
       The 20-sample minimum distance corresponds to a 400 ms refractory window:
           20 samples * 20 ms/sample = 400 ms  -> max detectable HR = 60000 / 400 = 150 BPM
       For detected peak sample indices [peak_0, peak_1, ..., peak_{K-1}]:
           peak_diffs_samples_i = peak_{i+1} - peak_i
           RR_i (in ms) = peak_diffs_samples_i * (1000.0 / Fs)

3. Mean Heart Rate (BPM):
       mean_interval_ms = (1 / (K - 1)) * sum_{i=0}^{K-2} RR_i
       mean_hr_bpm = 60000.0 / mean_interval_ms

4. SDNN (Standard Deviation of NN/RR intervals):
       SDNN = sqrt( (1 / (K - 1)) * sum_{i=0}^{K-2} (RR_i - mean_interval_ms)^2 )
       SDNN represents total autonomic heart rate variability.
       Normal resting values typically range between 30 ms and 70 ms.
       SDNN < 25 ms indicates low HRV / sympathetic hyperactivation / acute stress.

5. RMSSD (Root Mean Square of Successive Differences):
       delta_RR_i = RR_{i+1} - RR_i
       RMSSD = sqrt( (1 / (K - 2)) * sum_{i=0}^{K-3} (delta_RR_i)^2 )
       RMSSD reflects short-term parasympathetic (vagal) modulation.

6. Why the Simulator Uses Correlated RR Variation:
       In healthy living subjects, heart rate does not jump randomly between beats,
       nor does it remain perfectly stationary like a digital crystal clock.
       An Ornstein-Uhlenbeck stochastic mean-reverting process models autonomic tone
       with continuous temporal correlation (RR[n] ~ RR[n-1]), while respiratory sinus
       arrhythmia (RSA) simulates vagal modulation with breathing (~0.24 Hz).

7. Why PPG is Generated from Beat Timing Instead of Directly Generating BPM:
       Generating BPM directly and computing fake PPG from it reverses physical causality.
       In real humans and physical MAX30102 sensors, heart muscle contractions produce
       pulse pressure waves. The photoplethysmogram measures arterial volume changes.
       By simulating beat timing -> pulse morphology -> raw PPG samples, the EXACT same
       signal processing pipeline (find_peaks -> RR -> HR/SDNN) analyzes both physical
       sensor data and simulated telemetry with zero discrepancies or fabricated outputs.
=============================================================================
"""

import numpy as np
from scipy.signal import find_peaks
from typing import Dict, Any, List, Union

# Sampling rate specification (matching ESP32 firmware delay(20) = 50 Hz)
SAMPLE_RATE_HZ: float = 50.0
MS_PER_SAMPLE: float = 1000.0 / SAMPLE_RATE_HZ  # 20.0 ms per sample

# JITAI Stress Threshold (SDNN < 25ms indicates low HRV / sympathetic activation / acute stress)
STRESS_HRV_SDNN_THRESHOLD_MS: float = 25.0


def calculate_hrv_metrics(ppg_array: Union[List[float], np.ndarray]) -> Dict[str, Any]:
    """
    Computes rigorous physiological HRV metrics in milliseconds from a PPG buffer.

    Args:
        ppg_array: List or numpy array of PPG values sampled at SAMPLE_RATE_HZ (50 Hz).

    Returns:
        Dict containing:
            - "sdnn_ms": Standard deviation of intervals in milliseconds (0.0 if insufficient data).
            - "rmssd_ms": Root mean square of successive differences in milliseconds (0.0 if insufficient data).
            - "mean_hr_bpm": Estimated heart rate in beats per minute (0.0 if insufficient data).
            - "peak_count": Number of systolic peaks detected.
            - "is_stressed": Boolean indicating whether JITAI intervention should trigger.
            - "sample_rate_hz": Nominal 50.0 Hz.
    """
    signal = np.asarray(ppg_array, dtype=np.float64)
    if len(signal) < 30:
        return {
            "sdnn_ms": 0.0,
            "rmssd_ms": 0.0,
            "mean_hr_bpm": 0.0,
            "peak_count": 0,
            "is_stressed": False,
            "sample_rate_hz": SAMPLE_RATE_HZ
        }

    # Detect systolic peaks in the AC waveform
    # distance=20 samples = 400 ms refractory period (accommodates up to 150 BPM)
    # prominence=0.15 rejects baseline drift and secondary dicrotic waves
    peaks, _ = find_peaks(signal, distance=20, prominence=0.15)

    if len(peaks) < 2:
        return {
            "sdnn_ms": 0.0,
            "rmssd_ms": 0.0,
            "mean_hr_bpm": 0.0,
            "peak_count": int(len(peaks)),
            "is_stressed": False,
            "sample_rate_hz": SAMPLE_RATE_HZ
        }

    # Convert peak distance from sample indices to milliseconds
    peak_diffs_samples = np.diff(peaks)
    intervals_ms = peak_diffs_samples * (1000.0 / SAMPLE_RATE_HZ)

    # SDNN (Standard deviation of NN intervals in ms)
    sdnn_ms = float(np.std(intervals_ms))

    # RMSSD (Root mean square of successive differences in ms)
    if len(intervals_ms) > 1:
        successive_diffs = np.diff(intervals_ms)
        rmssd_ms = float(np.sqrt(np.mean(successive_diffs ** 2)))
    else:
        rmssd_ms = sdnn_ms

    # Estimated Heart Rate (BPM)
    mean_interval_ms = float(np.mean(intervals_ms))
    mean_hr_bpm = round(60000.0 / mean_interval_ms, 1) if mean_interval_ms > 0 else 0.0

    # Stress flag: low HRV (sympathetic overdrive) or erratic outlier variance
    is_stressed = (0.0 < sdnn_ms < STRESS_HRV_SDNN_THRESHOLD_MS) or (sdnn_ms > 120.0)

    return {
        "sdnn_ms": round(sdnn_ms, 2),
        "rmssd_ms": round(rmssd_ms, 2),
        "mean_hr_bpm": mean_hr_bpm,
        "peak_count": int(len(peaks)),
        "is_stressed": bool(is_stressed),
        "sample_rate_hz": SAMPLE_RATE_HZ
    }


def calculate_hrv(ppg_array: Union[List[float], np.ndarray]) -> float:
    """
    Direct compatibility function matching master specification signature.
    Returns the SDNN proxy in milliseconds.
    """
    metrics = calculate_hrv_metrics(ppg_array)
    return metrics["sdnn_ms"]


if __name__ == "__main__":
    from backend.synthetic_ppg import SyntheticPPGSimulator, SyntheticPPGConfig
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=75.0, seed=42))
    samples = [s["ppg"] for s in sim.generate_samples(1500)]
    results = calculate_hrv_metrics(samples)
    print("HRV Calculation Unit Verification:")
    print(results)
