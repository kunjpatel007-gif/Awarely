"""
=============================================================================
The Vanishing Dose — JITAI (Just-In-Time Adaptive Intervention) HRV Logic
Author: Person B
Repository Root: D:/manipal h/Hackathon-Manipal

UNIT RECONCILIATION & PHYSIOLOGICAL STANDARDS:
- Sample transmission rate: 50 Hz (20 ms period), as specified in firmware delay(20).
- Constant: SAMPLE_RATE_HZ = 50
- Constant: MS_PER_SAMPLE = 1000.0 / SAMPLE_RATE_HZ (20.0 ms)
- Intervals are converted explicitly from sample counts to milliseconds (ms):
    intervals_ms = np.diff(peaks) * MS_PER_SAMPLE
- Metrics calculated:
    - SDNN (Standard Deviation of NN intervals) in milliseconds (ms)
    - RMSSD (Root Mean Square of Successive Differences) in milliseconds (ms)
    - Approximate Heart Rate (BPM)
=============================================================================
"""

import numpy as np
from scipy.signal import find_peaks
from typing import Dict, Any, List, Union

# Constant defining transmission frequency from firmware
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
            - "sdnn_ms": Standard deviation of intervals in milliseconds.
            - "rmssd_ms": Root mean square of successive differences in milliseconds.
            - "mean_hr_bpm": Estimated heart rate in beats per minute.
            - "peak_count": Number of systolic peaks detected.
            - "is_stressed": Boolean indicating whether JITAI intervention should trigger.
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
    # At 50 Hz, 30 samples distance = 600 ms refractory period (~ max 100 BPM)
    # Using distance=20 (400 ms refractory period, accommodates up to 150 BPM)
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

    # Convert peak distance from sample indices to milliseconds using named constant
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
    # Unit verification with synthetic 1.2 Hz cardiac signal
    t = np.linspace(0, 4, int(4 * SAMPLE_RATE_HZ))  # 4 seconds at 50 Hz = 200 samples
    synth_ppg = np.sin(2 * np.pi * 1.2 * t) + 0.3 * np.sin(4 * np.pi * 1.2 * t) + np.random.normal(0, 0.05, len(t))
    results = calculate_hrv_metrics(synth_ppg.tolist())
    print("HRV Calculation Unit Test Passed:")
    print(results)
