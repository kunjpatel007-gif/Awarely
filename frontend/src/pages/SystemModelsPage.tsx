import React, { useEffect, useId, useRef, useState } from 'react';
import {
  IconPause,
  IconPlay,
  Reveal,
  Svg,
  useDocumentVisible,
  useInView,
  usePrefersReducedMotion
} from '../components/ui';

/* ==========================================================================
   How It Works — animated, interactive pipeline.
   Performance rules: loops animate transform/opacity (or stroke offsets on
   tiny SVGs) only, only the ACTIVE step's illustration is mounted, and every
   loop pauses when the stream is off-screen or the tab is hidden.
   ========================================================================== */

type StreamKey = 'realtime' | 'records';

interface Step {
  title: string;
  desc: string;
  detail: string;
  input: string;
  output: string;
  icon: React.ReactNode;
}

interface Stream {
  key: StreamKey;
  label: string;
  labelTone: 'info' | 'healthy';
  summary: string;
  steps: Step[];
}

/* ---------------------------------------------------------------- Icons -- */
const IcSensor = () => <Svg><rect x="4" y="2.5" width="8" height="11" rx="4" /><circle cx="8" cy="6.5" r="1.25" /></Svg>;
const IcWave = () => <Svg><path d="M1.5 9h2.5l1.5-4 2.5 7 2-5 1 2h3.5" /></Svg>;
const IcGauge = () => <Svg><path d="M2.5 11.5a5.5 5.5 0 1 1 11 0" /><path d="M8 11.5l2.5-3.5" /></Svg>;
const IcBell = () => <Svg><path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3L4 11z" /><path d="M6.5 14.5h3" /></Svg>;
const IcRecords = () => <Svg><rect x="3" y="2" width="10" height="12" rx="1.5" /><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" /></Svg>;
const IcNodes = () => <Svg><circle cx="4" cy="11" r="2" /><circle cx="12" cy="11" r="2" /><circle cx="8" cy="4" r="2" /><path d="M5 9.3l2-3.6M11 9.3l-2-3.6M6 11h4" /></Svg>;
const IcTarget = () => <Svg><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" /></Svg>;
const IcRange = () => <Svg><path d="M2 8h12M4.5 5v6M11.5 5v6" /><circle cx="8" cy="8" r="1.5" /></Svg>;
const IcBars = () => <Svg><path d="M8 2v12M8 4.5h5M8 8H3.5M8 11.5h3.5" /></Svg>;
const IcClinician = () => <Svg><circle cx="6.5" cy="5" r="2.5" /><path d="M2 13.5a4.5 4.5 0 0 1 8.5-2M10.5 12l1.5 1.5 3-3" /></Svg>;

const STREAMS: Stream[] = [
  {
    key: 'realtime',
    label: 'REAL-TIME MONITORING',
    labelTone: 'info',
    summary: 'A wearable pulse signal becomes a stress-aware reminder, live.',
    steps: [
      {
        title: 'Wearable Sensor',
        desc: "Pulse oximeter on patient's finger",
        detail:
          'A pulse oximeter streams the pulse waveform at 50 samples per second: live from the ESP32 hardware patient, simulated for the rest of the cohort.',
        input: 'Fingertip light absorption',
        output: 'Raw pulse waveform',
        icon: <IcSensor />
      },
      {
        title: 'Pulse Analysis',
        desc: 'Heart rate and variability',
        detail:
          'The waveform is band-pass filtered (0.5–5 Hz), beats are detected, and heart rate and heart-rate variability (SDNN) are computed.',
        input: 'Raw pulse waveform',
        output: 'Heart rate, SDNN',
        icon: <IcWave />
      },
      {
        title: 'Stress Detection',
        desc: 'Identifies elevated stress',
        detail: 'Low heart-rate variability alongside a raised heart rate is treated as a sign of acute stress.',
        input: 'Heart rate, SDNN',
        output: 'Stress flag',
        icon: <IcGauge />
      },
      {
        title: 'Smart Reminders',
        desc: 'Adjusts timing based on stress',
        detail:
          'While stress is detected, non-critical reminders are deferred so they arrive when the patient can act on them.',
        input: 'Stress flag',
        output: 'Held or sent reminder',
        icon: <IcBell />
      }
    ]
  },
  {
    key: 'records',
    label: 'HEALTH RECORDS ANALYSIS',
    labelTone: 'healthy',
    summary: 'Refill and appointment history becomes an explained, confidence-checked estimate.',
    steps: [
      {
        title: 'Health Records',
        desc: 'Pharmacy refills & appointments',
        detail: 'Refill timing and clinic appointment history are collected for each patient.',
        input: 'Refill & appointment logs',
        output: 'Record history',
        icon: <IcRecords />
      },
      {
        title: 'Pattern Detection',
        desc: 'Indirect behavioral signals',
        detail:
          'A hidden Markov model groups the record history into behaviour phases: stable routine, variable pattern or volatile phase.',
        input: 'Record history',
        output: 'Behaviour phase',
        icon: <IcNodes />
      },
      {
        title: 'Adherence Prediction',
        desc: 'Estimates medication compliance',
        detail: 'A model estimates how likely the patient is to be taking their medication as prescribed.',
        input: 'Record features',
        output: 'Adherence estimate',
        icon: <IcTarget />
      },
      {
        title: 'Confidence Check',
        desc: 'Flags uncertain predictions',
        detail:
          'Conformalized quantile regression wraps each estimate in a 90% prediction range. Wide ranges are flagged rather than guessed.',
        input: 'Adherence estimate',
        output: '90% range, review flag',
        icon: <IcRange />
      },
      {
        title: 'Explanation',
        desc: 'Shows why the prediction was made',
        detail: 'SHAP values show which record features pushed this patient’s estimate up or down.',
        input: 'Model and patient features',
        output: 'Feature contributions',
        icon: <IcBars />
      },
      {
        title: 'Clinician Review',
        desc: 'Human judgement for uncertain cases',
        detail: 'Uncertain or out-of-range predictions go to the review queue, where a clinician makes the call.',
        input: 'Flagged patients',
        output: 'Clinician decision',
        icon: <IcClinician />
      }
    ]
  }
];

const TOUR_MS = 4200;

/* ------------------------------------------------------- Illustrations -- */

// A stylised pulse waveform (4 beats across 240 units, peaks at y≈32)
const PPG_PATH = (() => {
  const beats = 4;
  const w = 240 / beats;
  let d = '';
  for (let b = 0; b < beats; b++) {
    const x = b * w;
    d +=
      `${b === 0 ? 'M' : 'L'}${x},100 ` +
      `C${x + w * 0.12},100 ${x + w * 0.16},30 ${x + w * 0.26},32 ` +
      `S${x + w * 0.36},78 ${x + w * 0.44},74 ` +
      `S${x + w * 0.52},62 ${x + w * 0.6},70 ` +
      `S${x + w * 0.8},100 ${x + w},100 `;
  }
  return d;
})();
const PEAKS = [0, 1, 2, 3].map(b => b * 60 + 60 * 0.26);

const IllusSensor = () => (
  <svg className="illus" viewBox="0 0 240 140">
    <rect className="il-surface" x="14" y="12" width="70" height="42" rx="21" />
    <circle className="il-led" cx="36" cy="33" r="7" />
    <circle className="il-led-core" cx="36" cy="33" r="3.5" />
    <text className="il-label il-label--strong" x="96" y="30">Pulse oximeter</text>
    <text className="il-label" x="96" y="46">50 samples / second</text>
    <path className="il-grid" d="M0 122H240" />
    <g transform="translate(0 62) scale(1 .6)">
      <path className="il-wave il-draw" d={PPG_PATH} pathLength={1} />
    </g>
  </svg>
);

const IllusPulse = () => (
  <svg className="illus" viewBox="0 0 240 140">
    <text className="il-label il-label--strong" x="8" y="18">Beat-to-beat intervals</text>
    {PEAKS.slice(0, 3).map((x, i) => (
      <path
        key={x}
        className="il-rr"
        style={{ '--i': i } as React.CSSProperties}
        d={`M${x} 64V56H${PEAKS[i + 1]}V64`}
      />
    ))}
    <g transform="translate(0 62) scale(1 .6)">
      <path className="il-wave il-wave--faint" d={PPG_PATH} />
    </g>
    {PEAKS.map((x, i) => (
      <circle key={x} className="il-beat" style={{ '--i': i } as React.CSSProperties} cx={x} cy={62 + 32 * 0.6} r="5" />
    ))}
    <path className="il-grid" d="M0 122H240" />
  </svg>
);

const IllusStress = () => (
  <svg className="illus" viewBox="0 0 240 140">
    <path className="il-arc il-arc--healthy" d="M50 110 A70 70 0 0 1 85 49.4" />
    <path className="il-arc il-arc--warn" d="M85 49.4 A70 70 0 0 1 155 49.4" />
    <path className="il-arc il-arc--critical" d="M155 49.4 A70 70 0 0 1 190 110" />
    <g className="il-needle">
      <path d="M120 110L120 56" />
    </g>
    <circle className="il-hub" cx="120" cy="110" r="7" />
    <text className="il-label" x="44" y="132">Calm</text>
    <text className="il-label" x="196" y="132" textAnchor="end">Stressed</text>
  </svg>
);

const IllusReminder = () => (
  <svg className="illus" viewBox="0 0 240 140">
    <rect className="il-surface" x="72" y="6" width="96" height="128" rx="14" />
    <rect className="il-line" x="86" y="92" width="68" height="6" rx="3" />
    <rect className="il-line" x="86" y="106" width="48" height="6" rx="3" />
    <g className="il-notif">
      <rect className="il-card" x="80" y="26" width="80" height="44" rx="8" />
      <text className="il-label il-label--strong" x="90" y="45">Reminder</text>
      <rect className="il-line" x="90" y="53" width="44" height="5" rx="2.5" />
    </g>
    <g className="il-badge il-badge--hold">
      <circle cx="160" cy="26" r="11" />
      <path d="M160 20.5V26l3.5 2.5" />
    </g>
    <g className="il-badge il-badge--sent">
      <circle cx="160" cy="26" r="11" />
      <path d="M155 26l3.5 3.5 6-6.5" />
    </g>
    <text className="il-label il-state il-state--hold" x="184" y="30">Held</text>
    <text className="il-label il-state il-state--sent" x="184" y="30">Sent</text>
  </svg>
);

const MISSED = new Set([5, 11, 12, 19, 26]);
const IllusRecords = () => (
  <svg className="illus" viewBox="0 0 240 140">
    {Array.from({ length: 28 }, (_, i) => (
      <rect
        key={i}
        className={`il-cell${MISSED.has(i) ? ' il-cell--miss' : ''}`}
        style={{ '--i': i } as React.CSSProperties}
        x={30 + (i % 7) * 26}
        y={10 + Math.floor(i / 7) * 24}
        width="20"
        height="18"
        rx="4"
      />
    ))}
    <rect className="il-cell il-cell--static" x="30" y="118" width="12" height="12" rx="3" />
    <text className="il-label" x="48" y="128">Kept</text>
    <rect className="il-cell il-cell--miss il-cell--static" x="110" y="118" width="12" height="12" rx="3" />
    <text className="il-label" x="128" y="128">Missed</text>
  </svg>
);

const IllusPhases = () => (
  <svg className="illus" viewBox="0 0 240 140">
    <path className="il-link" d="M78 86 Q 88 56 104 48" />
    <path className="il-link" d="M136 48 Q 152 56 162 86" />
    <path className="il-link" d="M84 106 H156" />
    {[
      { cx: 60, cy: 100, cls: 'healthy', label: 'Stable' },
      { cx: 120, cy: 38, cls: 'warn', label: 'Variable' },
      { cx: 180, cy: 100, cls: 'critical', label: 'Volatile' }
    ].map((s, i) => (
      <g key={s.label}>
        <circle className={`il-state-ring il-tone--${s.cls}`} style={{ '--i': i } as React.CSSProperties} cx={s.cx} cy={s.cy} r="31" />
        <circle className={`il-state il-tone--${s.cls}`} cx={s.cx} cy={s.cy} r="24" />
        <text className="il-label il-label--center" x={s.cx} y={s.cy + 4} textAnchor="middle">{s.label}</text>
      </g>
    ))}
  </svg>
);

const HISTORY = [
  [34, 72], [58, 84], [80, 64], [104, 78], [126, 58], [150, 70], [172, 52], [196, 66]
];
const IllusPrediction = () => (
  <svg className="illus" viewBox="0 0 240 140">
    <path className="il-axis" d="M20 108H220" />
    {[0, 50, 100].map((t, i) => (
      <text key={t} className="il-label" x={20 + i * 100} y="126" textAnchor="middle">{t}%</text>
    ))}
    {HISTORY.map(([x, y], i) => (
      <circle key={i} className="il-dot" style={{ '--i': i } as React.CSSProperties} cx={x} cy={y} r="3.5" />
    ))}
    <path className="il-guide" d="M152 24V108" />
    <g className="il-estimate">
      <circle className="il-marker" cx="152" cy="108" r="7" />
      <text className="il-label il-label--strong" x="152" y="92" textAnchor="middle">Estimate</text>
    </g>
  </svg>
);

const IllusConfidence = () => (
  <svg className="illus" viewBox="0 0 240 140">
    <path className="il-axis" d="M20 96H220" />
    <rect className="il-band" x="58" y="82" width="140" height="28" rx="6" />
    <circle className="il-marker" cx="128" cy="96" r="6" />
    <text className="il-label il-label--center" x="128" y="72" textAnchor="middle">90% range</text>
    <g className="il-flag">
      <rect x="150" y="14" width="76" height="26" rx="13" />
      <text x="188" y="31" textAnchor="middle">Review</text>
    </g>
    <text className="il-label" x="20" y="126">Wide range = uncertain</text>
  </svg>
);

const SHAP_BARS = [70, 46, -38, 24, -16];
const IllusShap = () => (
  <svg className="illus" viewBox="0 0 240 140">
    <path className="il-axis" d="M120 10V122" />
    {SHAP_BARS.map((v, i) => (
      <rect
        key={i}
        className={`il-bar ${v > 0 ? 'il-bar--up' : 'il-bar--down'}`}
        style={{ '--i': i } as React.CSSProperties}
        x={v > 0 ? 120 : 120 + v}
        y={16 + i * 21}
        width={Math.abs(v)}
        height="13"
        rx="3"
      />
    ))}
    <text className="il-label" x="226" y="134" textAnchor="end">Raises risk</text>
    <text className="il-label" x="14" y="134">Lowers risk</text>
  </svg>
);

const QUEUE = ['critical', 'warn', 'critical', 'warn'];
const IllusReview = () => (
  <svg className="illus" viewBox="0 0 240 140">
    <g className="il-queue">
      {QUEUE.map((tone, i) => (
        <g key={i} className={`il-qcard il-qcard--${i}`}>
          <rect className="il-card" x="44" y={14 + i * 38} width="152" height="30" rx="7" />
          <circle className={`il-qdot il-tone--${tone}`} cx="60" cy={29 + i * 38} r="4.5" />
          <rect className="il-line" x="72" y={23 + i * 38} width="70" height="5" rx="2.5" />
          <rect className="il-line" x="72" y={32 + i * 38} width="44" height="5" rx="2.5" />
        </g>
      ))}
    </g>
    <g className="il-stamp">
      <circle cx="180" cy="29" r="12" />
      <path d="M174 29l4 4 7-7.5" />
    </g>
  </svg>
);

const ILLUSTRATIONS: Record<StreamKey, Array<() => React.ReactElement>> = {
  realtime: [IllusSensor, IllusPulse, IllusStress, IllusReminder],
  records: [IllusRecords, IllusPhases, IllusPrediction, IllusConfidence, IllusShap, IllusReview]
};

/* ------------------------------------------------------------- Stream -- */

const PipelineStream: React.FC<{ stream: Stream }> = ({ stream }) => {
  const reduced = usePrefersReducedMotion();
  const docVisible = useDocumentVisible();
  const rootRef = useRef<HTMLElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef, { threshold: 0.2 });
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [cycle, setCycle] = useState(0);
  const baseId = useId();

  const n = stream.steps.length;
  const live = inView && docVisible && !reduced;
  const touring = playing && !hovering && live;

  useEffect(() => {
    if (!touring) return;
    setCycle(c => c + 1); // restart the timer ring whenever the tour resumes
    const t = window.setInterval(() => {
      setActive(a => (a + 1) % n);
      setCycle(c => c + 1);
    }, TOUR_MS);
    return () => window.clearInterval(t);
  }, [touring, n]);

  const go = (i: number, stop = true) => {
    setActive(((i % n) + n) % n);
    if (stop) setPlaying(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (e.key === 'ArrowRight') next = (active + 1) % n;
    else if (e.key === 'ArrowLeft') next = (active - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else return;
    e.preventDefault();
    go(next);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  const step = stream.steps[active];
  const Illustration = ILLUSTRATIONS[stream.key][active];

  return (
    <section
      ref={rootRef}
      className={`flow flow--${stream.key}${live ? ' is-live' : ''}`}
      style={{ '--n': n, '--progress': n > 1 ? active / (n - 1) : 0, '--tour-ms': `${TOUR_MS}ms` } as React.CSSProperties}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-label={stream.label}
    >
      <header className="flow-head">
        <div>
          <span className={`section-label tone-${stream.labelTone}`}>{stream.label}</span>
          <p className="flow-sub">{stream.summary}</p>
        </div>
        <div className="flow-controls">
          <span className="flow-counter" aria-hidden="true">
            <span className="flow-counter-now" key={active}>{String(active + 1).padStart(2, '0')}</span>
            <span className="flow-counter-total">/ {String(n).padStart(2, '0')}</span>
          </span>
          <button type="button" className="btn-outline btn-icon" aria-label="Previous step" onClick={() => go(active - 1)}>
            <Svg><path d="M10 3.5L5.5 8l4.5 4.5" /></Svg>
          </button>
          {!reduced && (
            <button type="button" className="btn-outline flow-play" onClick={() => setPlaying(p => !p)}>
              {playing ? <IconPause /> : <IconPlay />}
              {playing ? 'Pause tour' : 'Play tour'}
            </button>
          )}
          <button type="button" className="btn-outline btn-icon" aria-label="Next step" onClick={() => go(active + 1)}>
            <Svg><path d="M6 3.5L10.5 8 6 12.5" /></Svg>
          </button>
        </div>
      </header>

      <div className="flow-track-scroll">
        <div className="flow-track" role="tablist" aria-label={`${stream.label} steps`} ref={tabsRef} onKeyDown={onKeyDown}>
          <div className="flow-rail" aria-hidden="true">
            <span className="flow-rail-fill" />
            <span className="flow-rail-lit">
              {touring && [0, 1, 2].map(i => <span key={i} className="flow-particle" style={{ '--i': i } as React.CSSProperties} />)}
            </span>
          </div>

          {stream.steps.map((s, i) => {
            const state = i < active ? ' is-done' : i === active ? ' is-active' : '';
            return (
              <button
                key={s.title}
                type="button"
                role="tab"
                id={`${baseId}-tab-${i}`}
                aria-selected={i === active}
                aria-controls={`${baseId}-panel`}
                tabIndex={i === active ? 0 : -1}
                className={`flow-node${state}${i === n - 1 ? ' flow-node--terminal' : ''}`}
                style={{ '--i': i } as React.CSSProperties}
                onClick={() => go(i)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="flow-orb">
                  <svg className="flow-ring" viewBox="0 0 52 52" aria-hidden="true" focusable="false">
                    <circle className="flow-ring-track" cx="26" cy="26" r="24" pathLength={1} />
                    {i === active && touring && (
                      <circle key={cycle} className="flow-ring-timer" cx="26" cy="26" r="24" pathLength={1} />
                    )}
                  </svg>
                  <span className="flow-orb-icon">{s.icon}</span>
                </span>
                <span className="flow-node-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="flow-node-title">{s.title}</span>
                <span className="flow-node-desc">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="flow-stage"
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active}`}
        aria-live={touring ? 'off' : 'polite'}
      >
        <div className="flow-copy" key={`copy-${active}`}>
          <span className="flow-stage-step">Step {active + 1} of {n}</span>
          <h3 className="flow-stage-title">{step.title}</h3>
          <p className="flow-stage-text">{step.detail}</p>
          <div className="flow-io">
            <span className="flow-io-chip">
              <span className="flow-io-key">In</span>
              {step.input}
            </span>
            <span className="flow-io-arrow" aria-hidden="true">
              <Svg><path d="M2 8h11M9.5 4.5L13 8l-3.5 3.5" /></Svg>
            </span>
            <span className="flow-io-chip flow-io-chip--out">
              <span className="flow-io-key">Out</span>
              {step.output}
            </span>
          </div>
        </div>
        <div className="flow-visual" key={`visual-${stream.key}-${active}`} aria-hidden="true">
          <Illustration />
        </div>
      </div>
    </section>
  );
};

/* ----------------------------------------------------------- Converge -- */

const CONVERGE_PATHS = [
  { id: 'rt', d: 'M240 50 C 320 50, 320 100, 400 100', tone: 'info', begin: 0 },
  { id: 'hr', d: 'M240 150 C 320 150, 320 100, 400 100', tone: 'healthy', begin: 0.6 },
  { id: 'rq', d: 'M600 100 C 690 100, 690 50, 780 50', tone: 'accent', begin: 1.2 },
  { id: 'ca', d: 'M600 100 C 690 100, 690 150, 780 150', tone: 'accent', begin: 1.8 }
];

const Converge: React.FC = () => {
  const reduced = usePrefersReducedMotion();
  const docVisible = useDocumentVisible();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inView = useInView(svgRef, { threshold: 0.2 });
  const uid = useId().replace(/:/g, '');

  // SMIL dots scale with the viewBox; pause them whenever they can't be seen
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof svg.pauseAnimations !== 'function') return;
    if (inView && docVisible) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [inView, docVisible]);

  const box = (x: number, y: number, label: string, cls: string, w = 200) => (
    <g className={`cv-box ${cls}`}>
      <rect x={x} y={y} width={w} height="44" rx="12" />
      <text x={x + w / 2} y={y + 27} textAnchor="middle">{label}</text>
    </g>
  );

  return (
    <section className={`converge${inView ? ' is-inview' : ''}`} aria-label="Where it comes together">
      <div className="flow-head">
        <div>
          <span className="section-label">WHERE IT COMES TOGETHER</span>
          <p className="flow-sub">Both streams feed one clinician-facing dashboard.</p>
        </div>
      </div>
      <div className="converge-scroll">
        <svg
          ref={svgRef}
          className="converge-svg"
          viewBox="0 0 1000 200"
          role="img"
          aria-label="Real-time monitoring and health records analysis both feed the clinician dashboard, which drives the review queue and clinician actions."
        >
          {CONVERGE_PATHS.map((p, i) => (
            <path
              key={p.id}
              id={`${uid}-${p.id}`}
              className={`cv-path cv-path--${p.tone}`}
              style={{ '--i': i } as React.CSSProperties}
              d={p.d}
              pathLength={1}
            />
          ))}
          {!reduced &&
            CONVERGE_PATHS.map(p =>
              [0, 1].map(k => (
                <circle key={`${p.id}-${k}`} className={`cv-dot cv-dot--${p.tone}`} r="5" visibility="hidden">
                  <set attributeName="visibility" to="visible" begin={`${p.begin + k * 1.2}s`} />
                  <animateMotion dur="2.4s" repeatCount="indefinite" begin={`${p.begin + k * 1.2}s`}>
                    <mpath href={`#${uid}-${p.id}`} />
                  </animateMotion>
                </circle>
              ))
            )}
          {box(10, 28, 'Real-time monitoring', 'cv-box--info', 230)}
          {box(10, 128, 'Health records analysis', 'cv-box--healthy', 230)}
          <g className="cv-hub">
            <rect className="cv-hub-glow" x="392" y="64" width="216" height="72" rx="20" />
            <rect x="400" y="72" width="200" height="56" rx="14" />
            <text x="500" y="106" textAnchor="middle">Clinician dashboard</text>
          </g>
          {box(780, 28, 'Review queue', 'cv-box--out')}
          {box(780, 128, 'Clinician actions', 'cv-box--out')}
        </svg>
      </div>
    </section>
  );
};

/* --------------------------------------------------------------- Page -- */

const SystemModelsPageInner: React.FC = () => {
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
          {STREAMS.map((stream, i) => (
            <Reveal key={stream.key} delay={i * 80}>
              <PipelineStream stream={stream} />
            </Reveal>
          ))}
          <Reveal>
            <Converge />
          </Reveal>
        </div>
      </div>
    </div>
  );
};

export const SystemModelsPage = React.memo(SystemModelsPageInner);
