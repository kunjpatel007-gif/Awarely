"""JITAI HRV logic: SDNN, RMSSD, and stress detection from 50 Hz PPG buffers."""


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

    peak_diffs_samples = np.diff(peaks)
    intervals_ms = peak_diffs_samples * (1000.0 / SAMPLE_RATE_HZ)

    sdnn_ms = float(np.std(intervals_ms))

    if len(intervals_ms) > 1:
        successive_diffs = np.diff(intervals_ms)
        rmssd_ms = float(np.sqrt(np.mean(successive_diffs ** 2)))
    else:
        rmssd_ms = sdnn_ms

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
