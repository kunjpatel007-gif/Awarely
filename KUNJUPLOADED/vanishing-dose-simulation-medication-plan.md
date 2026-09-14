# Implementation Plan: Deep Research Simulation Integration & Medication Fix

**Project:** The Vanishing Dose
**Phase:** 2 — replaces the naive backend simulator with the physiological math from the Deep Research report; fixes the hardcoded medication display bug.
**Depends on:** Phase 1 (Multi-Tenant Hardware & Simulation Architecture) — this plan extends `telemetry_buffer.py`, `ppg_simulated.py`, and the HMM-frequency tie-in built there. Do not start this phase until Phase 1's acceptance criteria are met, since this rewrite sits directly on top of that plumbing.

---

## 0. Scope & Sequencing

| # | Workstream | Goal | Priority |
|---|------------|------|----------|
| 1 | Polypharmacy Medication Fix | Replace hardcoded "Hypertension — Daily 08:00" with realistic, deterministic per-patient regimens | P0 (small, low-risk, do first) |
| 2 | High-Fidelity PPG/EKG Simulation Rewrite | Replace memoryless state machine + sine waves with circadian + HSMM + autonomic-control + ECGSYN/PPG synthesis model | P0 (large, higher-risk) |

**Recommendation:** ship #1 first as an isolated, fast PR — it's independent of the simulator internals and de-risks nothing else. Treat #2 as its own multi-step effort behind a feature flag so a demo-breaking regression in the new simulator doesn't take the medication fix down with it.

---

## 1. The "Hypertension" Medication Bug (Polypharmacy Simulation)

### 1.1 Root cause
The raw Synthea medication tables weren't carried into the production Docker image by the ML pipeline, so every patient falls through to a single hardcoded display string.

### 1.2 Design requirements
- **Deterministic per patient:** regenerating the same patient shouldn't reshuffle their medication list on every request/reload — seed the generator with the patient ID so `patient-042` always gets the same regimen unless explicitly regenerated.
- **Clinically coherent, not random:** a patient's medications should loosely correlate with whatever condition data already exists for them (if `condition` fields are present), rather than being pure noise — e.g. don't give a diabetes-only patient five unrelated cardiac drugs. If no condition data exists per-patient, fall back to a general medication pool.
- **Schedule variety:** times of day should be spread (morning/midday/evening/bedtime), not clustered at 08:00, so the UI actually demonstrates multi-dose-per-day tracking.

### 1.3 [MODIFY] `backend/main.py`

- Update `_load_clinical_data()`:
  ```python
  import random

  MEDICATION_POOL = {
      "hypertension": [("Lisinopril", "08:00"), ("Amlodipine", "08:00"), ("Losartan", "08:00")],
      "diabetes":      [("Metformin", "12:00"), ("Glipizide", "08:00")],
      "cholesterol":   [("Atorvastatin", "21:00"), ("Rosuvastatin", "21:00")],
      "general":       [("Aspirin", "08:00"), ("Omeprazole", "07:30"), ("Levothyroxine", "06:30")],
  }

  def generate_medications(patient_id: str, conditions: list[str] | None) -> list[dict]:
      rng = random.Random(patient_id)  # deterministic per patient
      pools = [MEDICATION_POOL.get(c.lower(), []) for c in (conditions or [])]
      candidates = [m for pool in pools if pool for m in pool] or MEDICATION_POOL["general"]
      count = rng.randint(1, min(5, max(1, len(candidates))))
      chosen = rng.sample(candidates, k=count)
      return [{"name": name, "time": time} for name, time in chosen]
  ```
- Call this inside `_load_clinical_data()` per patient and attach the result as `medications` on the patient record before it's returned/cached.
- **Persistence decision needed:** decide whether this is generated fresh per request (cheap, but risks visible list "reshuffling" across two API calls if `conditions` input changes) or generated once and written to the patient store at seed time (safer for demo consistency). Recommend the latter — generate at seed/startup time and store, not per-request.

### 1.4 [MODIFY] `frontend/src/types/index.ts`
```ts
export interface Medication {
  name: string;
  time: string; // "HH:MM", 24-hour
}

export interface PatientSummary {
  // ...existing fields
  medications: Medication[];
}

export interface PatientDiagnostics {
  // ...existing fields
  medications: Medication[];
}
```

### 1.5 [MODIFY] `frontend/src/pages/DiagnosticsPage.tsx`
- Remove the hardcoded `"Hypertension — Daily 08:00"` string entirely (grep the codebase for it — it may appear in more than one component/mock file).
- Render:
  ```tsx
  <ul className="medication-list">
    {patient.medications.map((med) => (
      <li key={med.name}>
        <span className="med-name">{med.name}</span>
        <span className="med-time">Daily {med.time}</span>
      </li>
    ))}
  </ul>
  ```
- Handle the empty-array edge case (`medications.length === 0`) with a "No medications on file" state rather than rendering nothing silently.

### 1.6 Acceptance criteria
- [ ] No component in the frontend renders the literal string "Hypertension — Daily 08:00".
- [ ] Reloading a patient's diagnostics page shows the same medication list every time (deterministic).
- [ ] Different patients show different medication counts (1–5) and different times of day.
- [ ] Patients with condition data show medications plausibly related to that condition.

---

## 2. High-Fidelity PPG/EKG Simulation Rewrite

### 2.1 Why this replaces (not just extends) Phase 1's simulator
Phase 1's `ppg_simulated.py` used a memoryless two-state machine (`NORMAL` / `STRESS_EPISODE`) driven by a Poisson trigger, scaled by HMM state. This phase replaces that mechanism with a proper Hidden Semi-Markov Model and physiologically grounded waveform synthesis. The **causality contract from Phase 1 still holds** and must not regress:
> Stress episodes are generated independently of adherence; HMM state only tunes *how often* the model enters a stress-like state. Detection reads the waveform, not the HMM.

Concretely, that means: the HMM behavioral-phase signal is allowed to bias the HSMM's transition probability *into* the `Psychological Stress` state — it must not directly set `state = STRESS` or feed into the detector.

### 2.2 Proposed module structure

Replace the single `backend/ppg_simulator.py` with a package, keeping a thin orchestrator so the rest of the backend's import surface doesn't change:

```
backend/simulation/
  __init__.py
  circadian.py        # Process C — cosinor HR baseline + HRV scaling
  hsmm.py              # 5-state Hidden Semi-Markov Model, log-normal dwell times
  autonomic.py         # bi-exponential ODE for HR transitions between states
  ecg_synth.py         # ECGSYN 3D trajectory model for PQRST morphology
  ppg_synth.py         # multi-Gaussian digital volume pulse
  noise.py             # 1/f pink noise + motion artifacts
  simulator.py         # orchestrator: ties all of the above into one per-tick sample
backend/ppg_simulator.py  # thin re-export of simulation.simulator for backward compatibility
```

### 2.3 Circadian Baseline — `circadian.py`

Multi-component cosinor model for baseline HR:
```
HR_circ(t) = MESOR + Σ_k A_k · cos(2π·k·(t − φ_k) / 24)
```
- `MESOR` (midline estimating statistic of rhythm): 65–75 BPM, one deterministic value per patient (seeded).
- Primary 24h component amplitude `A_1`: 5–10 BPM.
- Add a smaller ultradian harmonic (`k=2`, ~12h period) at low amplitude if the "multi-component" requirement in the research report calls for more than a single cosine — confirm against the source report whether a second harmonic is specified or whether 24h-only satisfies "multi-component."
- **Baseline HRV** scales as an inverse-quadratic function of instantaneous HR — implement as a tunable function, e.g. `HRV_baseline(HR) = k / HR²` with `k` calibrated so HRV falls in a clinically plausible ms range at rest vs. elevated HR. Confirm the exact constant `k` and bounds against the research report rather than guessing a value here.

### 2.4 Hidden Semi-Markov Model — `hsmm.py`

Five states: `RESTING`, `LIGHT_ACTIVITY`, `PSYCHOLOGICAL_STRESS`, `PHYSICAL_EXERTION`, `SLEEP`.

- Unlike an HMM, dwell time in each state is drawn explicitly rather than being geometric (memoryless):
  ```
  dwell_time ~ LogNormal(μ_state, σ_state)
  ```
  Each state needs its own `(μ, σ)` pair — pull these from the research report rather than inventing them; get this wrong and the whole "organic" feel of Phase 1 regresses.
- Transition matrix `P[state_i → state_j]` governs which state is entered next once dwell time expires (self-transitions excluded, since dwell time already models staying).
- **HMM tie-in (replaces Phase 1's Poisson-rate multiplier):** for patients whose adherence-HMM behavioral phase is `Volatile`, scale up `P[* → PSYCHOLOGICAL_STRESS]` (renormalizing the row) rather than modifying dwell-time distributions. This is the direct replacement for Phase 1's `VOLATILE_MULTIPLIER` and should live in the same read-only, one-directional pattern established there — the HSMM reads HMM state, nothing reads back.

### 2.5 Bi-Exponential Autonomic Control — `autonomic.py`

HR doesn't jump instantly between HSMM states — it converges toward the new state's target HR via first-order dynamics, with different time constants depending on direction:
```
dHR/dt = (HR_target − HR) / τ
```
- **Parasympathetic withdrawal** (fast, e.g. resting → stress): `τ_p = 1.0–1.5 s`
- **Sympathetic activation/recovery** (slower, e.g. stress → resting): `τ_s = 5.0–8.3 s`
- Implementation: integrate this ODE numerically each simulation tick (Euler is fine at high enough sample rate; use RK4 if the tick interval is coarse enough to cause visible discretization error — verify empirically rather than assuming).
- Select `τ` per tick based on the sign of `(HR_target − HR)` and which HSMM transition is in effect, not just the raw sign of the delta, since the same direction can arise from different physiological transitions with different research-specified constants — confirm mapping rules against the report.

### 2.6 Waveform Synthesis

**ECG — `ecg_synth.py` (McSharry ECGSYN-style 3D ODE):**
```
dx/dt = α·x − ω·y
dy/dt = α·y + ω·x
dz/dt = −Σᵢ aᵢ·Δθᵢ·exp(−Δθᵢ²/(2bᵢ²)) − (z − z₀)
```
where `α = 1 − √(x²+y²)`, `θ = atan2(y, x)`, `Δθᵢ = (θ − θᵢ) mod 2π`, and `ω = 2π·HR/60` — HR here comes directly from `autonomic.py`'s current instantaneous value each tick, not the circadian baseline alone.
- The five `(aᵢ, bᵢ, θᵢ)` Gaussian parameters correspond to the P, Q, R, S, T waves.
- Apply **Bazett's correction** to rate-scale the QT-related Gaussian widths/positions: `QTc = QT / √(RR)`, using it to adjust `bᵢ`/`θᵢ` for the T wave so the morphology doesn't look identical at 50 BPM and 150 BPM.

**PPG — `ppg_synth.py` (3-component multi-Gaussian digital volume pulse):**
```
PPG(t) = Σᵢ₌₁³ Aᵢ · exp(−(t − μᵢ)² / (2σᵢ²))
```
- Components: systolic peak, dicrotic notch, diastolic peak.
- **Sympathetic hemodynamic deformation:** under `PSYCHOLOGICAL_STRESS` / `PHYSICAL_EXERTION`, vasoconstriction typically blunts/removes the dicrotic notch — reduce that Gaussian's amplitude (`A₂`) as a function of current sympathetic drive rather than toggling it on/off discretely, to keep the transition organic.

### 2.7 Physiological Noise — `noise.py`
- **1/f pink noise:** implement via the Voss-McCartney algorithm (cheap, no FFT needed per-tick) or precomputed FFT-filtered noise buffers if performance allows — pick one and note the choice, since they have different runtime-cost profiles at scale (see §2.9).
- **Motion artifacts:** short-duration, higher-amplitude transient bursts/baseline wander, correlated with the `PHYSICAL_EXERTION` HSMM state (don't just apply them uniformly at random — they should make physiological sense given the current state).

### 2.8 Orchestration — `simulator.py`
Single per-tick entry point consumed by Phase 1's `telemetry_buffer.py`:
```python
def tick(patient_state: PatientSimState) -> Sample:
    hmm_state = get_current_hmm_state(patient_state.patient_id)   # read-only, as in Phase 1
    hsmm_state = patient_state.hsmm.step(hmm_state)
    target_hr = circadian.hr_at(patient_state.t) + hsmm_state.hr_offset
    hr = autonomic.step(patient_state.current_hr, target_hr, transition=hsmm_state.transition)
    ecg_sample = ecg_synth.sample(hr, patient_state.ecg_phase)
    ppg_sample = ppg_synth.sample(hr, hsmm_state.sympathetic_drive)
    noisy = noise.overlay(ecg_sample, ppg_sample, hsmm_state)
    return noisy
```
- Detection logic downstream (the stress detector that triggers JITAI) continues to read only the resulting waveform samples, per the Phase 1 causality contract — do not add a shortcut that reads `hsmm_state.state == PSYCHOLOGICAL_STRESS` directly from the detector.

### 2.9 Performance considerations
- This is meaningfully heavier per-tick than Phase 1's sine-wave generator (an ODE integration plus two synthesis models plus noise, per patient, per tick). Before wiring this in for every simulated patient concurrently:
  - Benchmark single-patient tick cost first.
  - Decide on sample rate (waveform fidelity vs. CPU budget) — this doesn't need to match real ECG sample rates (250–500 Hz) if the frontend chart can't usefully render that density; pick the lowest rate that still looks organic.
  - If ticking every simulated patient in real time becomes a bottleneck at demo scale, consider a hybrid: precompute a buffer of N seconds ahead per patient on a background task and stream from that buffer, rather than synthesizing exactly at wall-clock time.

### 2.10 Rollout plan
- Put the new simulator behind a flag (e.g. `SIMULATOR_V2=true`) so Phase 1's simulator remains a fallback if the rewrite isn't demo-stable in time.
- Run both simulators side by side against a couple of test patients and visually compare before cutting over — this is math-heavy code with several free parameters pulled from a research report, so a silent unit mismatch (seconds vs. milliseconds, BPM vs. Hz) is the most likely failure mode.

### 2.11 File-level change list

| File | Change |
|---|---|
| `backend/simulation/circadian.py` | New — cosinor HR baseline + HRV scaling |
| `backend/simulation/hsmm.py` | New — 5-state HSMM with log-normal dwell times, HMM-biased transitions |
| `backend/simulation/autonomic.py` | New — bi-exponential ODE integrator |
| `backend/simulation/ecg_synth.py` | New — ECGSYN 3D trajectory + Bazett scaling |
| `backend/simulation/ppg_synth.py` | New — multi-Gaussian PPG with sympathetic deformation |
| `backend/simulation/noise.py` | New — pink noise + motion artifacts |
| `backend/simulation/simulator.py` | New — per-tick orchestrator |
| `backend/ppg_simulator.py` | Reduced to re-export/back-compat shim |
| `backend/telemetry/telemetry_buffer.py` | Update call site to new orchestrator (Phase 1 file) |
| `backend/config.py` (or equivalent) | Add `SIMULATOR_V2` flag |

### 2.12 Acceptance criteria
- [ ] Waveform for a `RESTING` patient shows realistic RR-interval variability (not a fixed period).
- [ ] Transitioning into `PSYCHOLOGICAL_STRESS` shows a smooth multi-second ramp in HR, not an instant jump.
- [ ] QRS morphology visibly narrows/widens with HR (Bazett scaling working).
- [ ] PPG dicrotic notch visibly diminishes during stress/exertion states vs. resting.
- [ ] Volatile-phase (HMM state 2) patients enter `PSYCHOLOGICAL_STRESS` measurably more often than stable-phase patients over a multi-minute window (same causality check as Phase 1, re-verified post-rewrite).
- [ ] Detection/JITAI trigger logic still reads only waveform output, confirmed by code review (no direct `hsmm_state` read in the detector).
- [ ] Per-tick generation cost benchmarked and confirmed to support the expected number of concurrent simulated patients in real time.

---

## 3. Suggested Build Order

1. Ship the medication fix (§1) independently — quick win, unblocks UI testing of the diagnostics page medication list.
2. Implement `circadian.py` + `hsmm.py` in isolation with unit tests against known dwell-time/HR-range expectations (no waveform synthesis yet — just verify the state/HR trace looks right on its own).
3. Implement `autonomic.py`, feed it the state/HR trace from step 2, verify smooth transitions visually (a simple line-chart debug view is enough at this stage).
4. Implement `ecg_synth.py` and `ppg_synth.py` against the smoothed HR trace.
5. Add `noise.py` last, once the clean signal looks right — noise on top of a wrong signal makes debugging harder.
6. Wire the HMM-biased transition probability into `hsmm.py` and re-run the Phase 1 causality check.
7. Benchmark performance (§2.9), then flip `SIMULATOR_V2` on for a side-by-side comparison before full cutover.

## 4. Testing & Validation

- **Unit tests per module:** dwell-time sampling matches expected log-normal parameters; ODE integrator converges to target HR within expected settling time for given `τ`; Bazett scaling produces expected QT deltas at a couple of reference HRs.
- **Visual review:** render a few minutes of output per patient type (resting, volatile) and eyeball against real PPG/ECG references for plausibility.
- **Causality regression test:** same check as Phase 1 — confirm via logs/code path that JITAI triggers originate from waveform detection, not HMM state, after the rewrite.
- **Load test:** run N concurrent simulated patients (N = expected demo roster size) and confirm tick latency stays within budget.
- **Side-by-side comparison:** Phase 1 simulator vs. `SIMULATOR_V2` on the same patient seed, checked before cutover.

## 5. Open Questions / Risks

- Are the exact `(μ, σ)` dwell-time parameters, HRV scaling constant, and Bazett coefficients fully specified in the Deep Research report, or do some need to be tuned/estimated? Flag any gaps before the "heavy-duty code engineer subagent" starts writing — better to resolve missing constants now than mid-implementation.
- Numerical stability of the ECGSYN ODE at low tick rates — may need RK4 instead of Euler; decide after the first benchmark, not preemptively.
- Whether `SIMULATOR_V2` should be a global flag or per-patient — a per-patient flag would let you cut over the hardware-comparison patients gradually without an all-or-nothing risk on demo day.
- Confirm whether the "multi-component" cosinor requirement means more than one harmonic, or just "MESOR + one cosine term" — affects `circadian.py` scope.

## 6. Next Step
Once the constants above are confirmed against the source report, this plan is ready to hand to implementation — treat §1 and §2 as separate PRs/branches given their very different risk profiles.
