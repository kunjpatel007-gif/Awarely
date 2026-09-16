import React, { useEffect, useId, useState } from 'react';
import { IconPause, IconPlay, usePrefersReducedMotion } from '../components/ui';

interface Step {
  title: string;
  desc: string;
  detail: string;
}

interface Stream {
  label: string;
  labelTone: 'info' | 'healthy';
  terminalAccent: 'info' | 'warn';
  steps: Step[];
}

const STREAMS: Stream[] = [
  {
    label: 'REAL-TIME MONITORING',
    labelTone: 'info',
    terminalAccent: 'info',
    steps: [
      {
        title: 'Wearable Sensor',
        desc: "Pulse oximeter on patient's finger",
        detail:
          'A pulse oximeter streams the pulse waveform at 50 samples per second: live from the ESP32 hardware patient, simulated for the rest of the cohort.'
      },
      {
        title: 'Pulse Analysis',
        desc: 'Heart rate and variability',
        detail:
          'The waveform is band-pass filtered (0.5–5 Hz), beats are detected, and heart rate and heart-rate variability (SDNN) are computed.'
      },
      {
        title: 'Stress Detection',
        desc: 'Identifies elevated stress',
        detail: 'Low heart-rate variability alongside a raised heart rate is treated as a sign of acute stress.'
      },
      {
        title: 'Smart Reminders',
        desc: 'Adjusts timing based on stress',
        detail:
          'While stress is detected, non-critical reminders are deferred so they arrive when the patient can act on them.'
      }
    ]
  },
  {
    label: 'HEALTH RECORDS ANALYSIS',
    labelTone: 'healthy',
    terminalAccent: 'warn',
    steps: [
      {
        title: 'Health Records',
        desc: 'Pharmacy refills & appointments',
        detail: 'Refill timing and clinic appointment history are collected for each patient.'
      },
      {
        title: 'Pattern Detection',
        desc: 'Indirect behavioral signals',
        detail:
          'A hidden Markov model groups the record history into behaviour phases: stable routine, variable pattern or volatile phase.'
      },
      {
        title: 'Adherence Prediction',
        desc: 'Estimates medication compliance',
        detail: 'A model estimates how likely the patient is to be taking their medication as prescribed.'
      },
      {
        title: 'Confidence Check',
        desc: 'Flags uncertain predictions',
        detail:
          'Conformalized quantile regression wraps each estimate in a 90% prediction range. Wide ranges are flagged rather than guessed.'
      },
      {
        title: 'Explanation',
        desc: 'Shows why the prediction was made',
        detail: 'SHAP values show which record features pushed this patient’s estimate up or down.'
      },
      {
        title: 'Clinician Review',
        desc: 'Human judgement for uncertain cases',
        detail: 'Uncertain or out-of-range predictions go to the review queue, where a clinician makes the call.'
      }
    ]
  }
];

const TOUR_INTERVAL_MS = 2400;

const PipelineStream: React.FC<{ stream: Stream }> = ({ stream }) => {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovering, setHovering] = useState(false);
  const detailId = useId();
  const touring = playing && !hovering && !reduced;

  useEffect(() => {
    if (!touring) return;
    const t = window.setInterval(() => setActive(a => (a + 1) % stream.steps.length), TOUR_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [touring, stream.steps.length]);

  const last = stream.steps.length - 1;

  return (
    <div
      className="pipeline-flow-card"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="pipeline-head">
        <span className={`section-label tone-${stream.labelTone}`}>{stream.label}</span>
        {!reduced && (
          <button type="button" className="btn-outline pipeline-play" onClick={() => setPlaying(p => !p)}>
            {playing ? <IconPause /> : <IconPlay />}
            {playing ? 'Pause tour' : 'Play tour'}
          </button>
        )}
      </div>

      <div className="pipeline-steps">
        {stream.steps.map((step, i) => (
          <React.Fragment key={step.title}>
            {i > 0 && (
              <div
                className={`pipe-arrow${i <= active ? ' is-lit' : ''}${i === active ? ' is-flowing' : ''}`}
                aria-hidden="true"
              >
                <span className="pipe-flow-dot" />
              </div>
            )}
            <button
              type="button"
              className={`pipe-node${i === last ? ` pipe-node--terminal accent-${stream.terminalAccent}` : ''}${
                i <= active ? ' is-lit' : ''
              }${i === active ? ' is-active' : ''}`}
              aria-pressed={i === active}
              aria-controls={detailId}
              onClick={() => {
                setActive(i);
                setPlaying(false);
              }}
              onMouseEnter={() => setActive(i)}
              onFocus={() => {
                setActive(i);
                setPlaying(false);
              }}
            >
              <span className="pipe-node-title">{step.title}</span>
              <span className="pipe-node-desc">{step.desc}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="pipe-detail" id={detailId} aria-live={touring ? 'off' : 'polite'}>
        <span className="pipe-detail-step">
          Step {active + 1} of {stream.steps.length}
        </span>
        <p className="pipe-detail-text" key={active}>
          {stream.steps[active].detail}
        </p>
      </div>
    </div>
  );
};

export const SystemModelsPage: React.FC = () => {
  return (
    <div className="view-panel active-view view-stagger">
      <div className="page-intro">
        <h1 className="page-headline">How It Works</h1>
        <p className="page-desc">
          Our system uses two complementary approaches to help clinicians identify patients
          who may be struggling with medication adherence — without ever assuming non-compliance.
        </p>
      </div>

      <div className="pipeline-page">
        <div className="pipeline-view-container">
          {STREAMS.map(stream => (
            <PipelineStream key={stream.label} stream={stream} />
          ))}
        </div>
      </div>
    </div>
  );
};
