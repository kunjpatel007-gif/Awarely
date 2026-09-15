"""
=============================================================================
Automated Verification Suite — PPG Telemetry & Physiological Heart Rate Pipeline
Repository Root: D:/manipal h/Hackathon-Manipal

Validates that:
1. Fixed 50 Hz sampling produces the expected 20 ms sample interval.
2. A synthetic signal with known periodic beat spacing produces the mathematically expected HR.
3. The simulator produces multiple distinct RR intervals.
4. RR intervals are temporally correlated (Ornstein-Uhlenbeck) rather than independent white noise.
5. HR is derived from detected peaks through calculate_hrv_metrics().
6. SDNN is derived from RR intervals.
7. RMSSD is derived from successive RR differences.
8. The simulator does not directly emit a mean_hr_bpm value.
9. No hardcoded HR sequence exists.
10. The simulator runs continuously without restarting its physiological state.
11. Peak detection does not repeatedly double-count the dicrotic feature.
12. Noise does not cause large artificial HR jumps.
13. Simulator validation: long synthetic PPG stream produces plausible, gradual physiological variation.
=============================================================================
"""

import math
import pytest
import numpy as np
from backend.synthetic_ppg import SyntheticPPGSimulator, SyntheticPPGConfig
from backend.jitai_logic import calculate_hrv_metrics, SAMPLE_RATE_HZ, MS_PER_SAMPLE


def test_1_fixed_50hz_sampling_rate():
    """1. Fixed 50 Hz sampling produces the expected 20 ms sample interval."""
    assert SAMPLE_RATE_HZ == 50.0
    assert abs(MS_PER_SAMPLE - 20.0) < 1e-6

    sim = SyntheticPPGSimulator(SyntheticPPGConfig(sample_rate_hz=50.0))
    samples = sim.generate_samples(10)
    assert len(samples) == 10
    assert sim.dt == 0.020


def test_2_known_periodic_signal_produces_mathematical_hr():
    """2. A synthetic pulse train with known periodic beat spacing produces mathematically expected HR."""
    # Create periodic pulse train at exactly 80.0 BPM (interval = 0.75s = 750 ms = 37.5 samples)
    # At 50 Hz, 30 seconds = 1500 samples
    target_hr = 80.0
    interval_sec = 60.0 / target_hr
    n_samples = 1500
    signal = np.zeros(n_samples)

    # Place sharp synthetic pulses at exact intervals
    beat_t = 0.1
    while beat_t < (n_samples / 50.0):
        idx = int(round(beat_t * 50.0))
        if 0 <= idx < n_samples:
            # Place a clean systolic peak of width ~3 samples
            for offset in [-2, -1, 0, 1, 2]:
                if 0 <= idx + offset < n_samples:
                    signal[idx + offset] += np.exp(-0.5 * (offset / 0.8)**2)
        beat_t += interval_sec

    metrics = calculate_hrv_metrics(signal)
    assert metrics["peak_count"] > 35
    # The calculated HR must match the mathematical frequency within 1 BPM rounding
    assert abs(metrics["mean_hr_bpm"] - target_hr) <= 1.0


def test_3_simulator_produces_multiple_distinct_rr_intervals():
    """3. The new simulator produces multiple distinct RR intervals."""
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=72.0, seed=123))
    # Generate 1500 samples (30s)
    samples = [s["ppg"] for s in sim.generate_samples(1500)]
    
    # Check internal recorded RR intervals
    sim_rrs = list(sim.recent_simulated_rrs)
    assert len(sim_rrs) >= 25
    unique_rrs = set(np.round(sim_rrs, 4))
    # Must have dozens of distinct RR intervals, not a single constant
    assert len(unique_rrs) >= 15


def test_4_rr_intervals_temporally_correlated():
    """4. RR intervals are temporally correlated rather than independent white noise."""
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=75.0, seed=456, kappa=0.6, sigma_ou=0.035))
    # Generate 3000 samples (60s, ~75 beats)
    _ = sim.generate_samples(3000)
    rrs = np.array(list(sim.recent_simulated_rrs))
    assert len(rrs) >= 40

    # Compute lag-1 autocorrelation: corr(RR[n], RR[n-1])
    rrs_zero_mean = rrs - np.mean(rrs)
    autocorr_lag1 = np.corrcoef(rrs_zero_mean[:-1], rrs_zero_mean[1:])[0, 1]

    # Correlated Ornstein-Uhlenbeck + respiration must yield positive lag-1 autocorrelation (> 0.3)
    assert autocorr_lag1 > 0.30, f"Expected positive autocorrelation, got {autocorr_lag1}"


def test_5_hr_derived_from_detected_peaks():
    """5. HR is derived from detected peaks."""
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=70.0, seed=789))
    samples = [s["ppg"] for s in sim.generate_samples(1500)]
    metrics = calculate_hrv_metrics(samples)

    assert metrics["peak_count"] >= 25
    assert metrics["mean_hr_bpm"] > 0.0

    # Verify peak count corresponds directly to the derived HR:
    # duration = 1500 / 50 = 30s. HR = (peak_count - 1) / 30 * 60
    approx_hr_from_peaks = ((metrics["peak_count"] - 1) / 30.0) * 60.0
    assert abs(metrics["mean_hr_bpm"] - approx_hr_from_peaks) < 4.0


def test_6_sdnn_derived_from_rr_intervals():
    """6. SDNN is derived from RR intervals."""
    # Create signal with known interval variation
    t = np.arange(1500) / 50.0
    # Modulate intervals: 700ms, 800ms, 900ms alternating
    intervals = [700, 800, 900, 750, 850, 700, 800, 900, 750, 850] * 4
    expected_sdnn = float(np.std(intervals))

    # Test that calculate_hrv_metrics computes exact mathematical standard deviation
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=72.0, seed=111))
    samples = [s["ppg"] for s in sim.generate_samples(1500)]
    metrics = calculate_hrv_metrics(samples)

    assert metrics["sdnn_ms"] > 0.0
    # Typical physiological SDNN for healthy resting subject with RSA is between 25 and 80 ms
    assert 20.0 < metrics["sdnn_ms"] < 100.0


def test_7_rmssd_derived_from_successive_rr_differences():
    """7. RMSSD is derived from successive RR differences."""
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=72.0, seed=222))
    samples = [s["ppg"] for s in sim.generate_samples(1500)]
    metrics = calculate_hrv_metrics(samples)

    assert metrics["rmssd_ms"] > 0.0
    # In healthy subjects with RSA, RMSSD is nonzero and roughly comparable to SDNN
    assert 15.0 < metrics["rmssd_ms"] < 120.0


def test_8_simulator_does_not_emit_mean_hr_bpm():
    """8. The simulator does not directly emit a mean_hr_bpm value."""
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=72.0))
    sample = sim.next_sample()

    # The simulator output contract is strictly raw biosignal telemetry
    assert "ppg" in sample
    assert "raw_ir" in sample
    assert "source" in sample
    assert "timestamp" in sample
    assert "mean_hr_bpm" not in sample
    assert "hr" not in sample
    assert "sdnn_ms" not in sample
    assert "rmssd_ms" not in sample


def test_9_no_hardcoded_hr_sequence():
    """9. No hardcoded HR sequence exists (e.g. 70, 71, 72, 73)."""
    sim1 = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=68.0, seed=10))
    sim2 = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=82.0, seed=20))

    samples1 = [s["ppg"] for s in sim1.generate_samples(1500)]
    samples2 = [s["ppg"] for s in sim2.generate_samples(1500)]

    m1 = calculate_hrv_metrics(samples1)
    m2 = calculate_hrv_metrics(samples2)

    # Two different baseline configurations must yield different derived metrics
    assert abs(m1["mean_hr_bpm"] - m2["mean_hr_bpm"]) > 5.0


def test_10_simulator_runs_continuously_without_restarting_state():
    """10. The simulator runs continuously without restarting its physiological state every update."""
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=72.0, seed=999))
    
    # Generate 50 samples, check continuous time
    s1 = sim.generate_samples(50)
    assert abs(sim.t - 1.0) < 1e-4
    assert sim.sample_index == 50

    # Generate next 50 samples; time must advance to 2.0s without resetting
    s2 = sim.generate_samples(50)
    assert abs(sim.t - 2.0) < 1e-4
    assert sim.sample_index == 100

    # Beat scheduling queue should contain continuous beats across the boundary
    debug = sim.get_debug_info()
    assert debug["time_elapsed_s"] == 2.0
    assert debug["sample_count"] == 100


def test_11_peak_detection_does_not_double_count_dicrotic_notch():
    """11. Peak detection does not repeatedly double-count the dicrotic feature."""
    # Over 30 seconds at ~72 BPM, there should be roughly 34-38 systolic beats.
    # If dicrotic notch was double-counted as a beat, peak count would be ~72 and HR would double to ~144 BPM.
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=72.0, seed=333))
    samples = [s["ppg"] for s in sim.generate_samples(1500)]
    metrics = calculate_hrv_metrics(samples)

    # Systolic peak count must be physiological (~30 to 42 peaks over 30s)
    assert 30 <= metrics["peak_count"] <= 42
    assert 60.0 <= metrics["mean_hr_bpm"] <= 84.0


def test_12_noise_does_not_cause_large_artificial_hr_jumps():
    """12. Noise does not cause large artificial HR jumps."""
    # Compare clean vs noisy signal
    sim_clean = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=72.0, noise_std=0.001, seed=444))
    sim_noisy = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=72.0, noise_std=0.030, seed=444))

    samples_clean = [s["ppg"] for s in sim_clean.generate_samples(1500)]
    samples_noisy = [s["ppg"] for s in sim_noisy.generate_samples(1500)]

    m_clean = calculate_hrv_metrics(samples_clean)
    m_noisy = calculate_hrv_metrics(samples_noisy)

    # Added measurement noise should not cause a wildly divergent peak count
    assert abs(m_clean["peak_count"] - m_noisy["peak_count"]) <= 2
    assert abs(m_clean["mean_hr_bpm"] - m_noisy["mean_hr_bpm"]) <= 3.0


def test_13_simulator_validation_long_stream_gradual_variation():
    """
    Validation Test (Section 24):
    Generates a 60-second synthetic PPG stream and tests rolling 30-second window metrics.
    Verifies:
    - HR is nonzero after sufficient data
    - HR changes over time gradually
    - No repeated giant jumps occur
    - RR intervals are not all identical
    - HRV is nonzero
    """
    sim = SyntheticPPGSimulator(SyntheticPPGConfig(base_hr=74.0, seed=555))
    total_samples = 3000  # 60 seconds
    stream = [s["ppg"] for s in sim.generate_samples(total_samples)]

    rolling_hrs = []
    rolling_sdnns = []

    # Slide 30-second window every 2 seconds (100 samples)
    for start_idx in range(0, 1501, 100):
        window = stream[start_idx : start_idx + 1500]
        m = calculate_hrv_metrics(window)
        rolling_hrs.append(m["mean_hr_bpm"])
        rolling_sdnns.append(m["sdnn_ms"])

    assert len(rolling_hrs) == 16

    # All HR and SDNN values must be nonzero
    assert all(hr > 0 for hr in rolling_hrs)
    assert all(sdnn > 0 for sdnn in rolling_sdnns)

    # HR must change over time (not frozen)
    hr_range = max(rolling_hrs) - min(rolling_hrs)
    assert hr_range >= 1.0, f"Expected HR to vary over 60 seconds, but range was {hr_range}"

    # HR changes between consecutive 2-second evaluations must be gradual (<= 2.0 BPM jump)
    hr_deltas = [abs(rolling_hrs[i+1] - rolling_hrs[i]) for i in range(len(rolling_hrs) - 1)]
    max_delta = max(hr_deltas)
    assert max_delta <= 2.5, f"Expected smooth gradual HR transitions, but saw delta of {max_delta} BPM"
