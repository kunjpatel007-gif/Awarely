import React, { useState, useEffect, useRef } from 'react';
import { ViewType } from '../types';
import { API_BASE_URL } from '../services/api';
import { hmmStateToLabel, clinicalStatusToLabel } from '../lib/clinicalLabels';
import { IconMoon, IconReset, IconSearch, IconSun, Kbd, OPEN_PALETTE_EVENT, Popover, modKeyLabel } from './ui';

interface TopbarProps {
  currentView: ViewType;
  activePatientId: string;
  patientStatus?: string;
  hmm_state?: number;
}

/* ==========================================================================
   Theme "fracture" effect.
   Cracks shoot out from the toggle; going light, light bursts through them,
   going dark, darkness floods out. The theme swaps at the peak (~400 ms) and
   the whole effect is gone by ~800 ms. Built imperatively on <body> so it
   never re-renders React, and removed from the DOM when finished.
   ========================================================================== */
const SVG_NS = 'http://www.w3.org/2000/svg';
const FX_SWAP_MS = 400;
const FX_TOTAL_MS = 800;

interface Crack { d: string; delay: number; fork: boolean }

function buildCracks(x: number, y: number, w: number, h: number): Crack[] {
  const cracks: Crack[] = [];
  const reach = Math.hypot(w, h);
  const branches = 10;
  const pt = (px: number, py: number) => `${px.toFixed(1)} ${py.toFixed(1)}`;
  for (let i = 0; i < branches; i++) {
    const base = (i / branches) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
    const maxLen = reach * (0.35 + Math.random() * 0.6);
    let angle = base;
    let px = x;
    let py = y;
    let len = 0;
    let seg = 0;
    let d = `M${pt(px, py)}`;
    while (len < maxLen) {
      const step = 26 + Math.random() * 58;
      angle = base + Math.max(-0.55, Math.min(0.55, angle - base + (Math.random() - 0.5) * 0.9));
      px += Math.cos(angle) * step;
      py += Math.sin(angle) * step;
      len += step;
      d += ` L${pt(px, py)}`;
      if (seg > 1 && Math.random() < 0.3) {
        let fa = angle + (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.55);
        let fx = px;
        let fy = py;
        let fl = 0;
        const flen = 50 + Math.random() * 150;
        let fd = `M${pt(fx, fy)}`;
        while (fl < flen) {
          const s = 18 + Math.random() * 36;
          fa += (Math.random() - 0.5) * 0.8;
          fx += Math.cos(fa) * s;
          fy += Math.sin(fa) * s;
          fl += s;
          fd += ` L${pt(fx, fy)}`;
        }
        cracks.push({ d: fd, delay: 50 + (len / maxLen) * 110, fork: true });
      }
      seg++;
    }
    cracks.push({ d, delay: Math.random() * 30, fork: false });
  }
  return cracks;
}

function playThemeFracture(x: number, y: number, toDark: boolean, onSwap: () => void): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fx = document.createElement('div');
  fx.className = `theme-fx ${toDark ? 'theme-fx--dark' : 'theme-fx--light'}`;
  fx.setAttribute('aria-hidden', 'true');
  fx.style.setProperty('--fx-x', `${x}px`);
  fx.style.setProperty('--fx-y', `${y}px`);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'theme-fx-cracks');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  for (const layer of ['glow', 'core'] as const) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', `theme-fx-${layer}`);
    svg.appendChild(g);
  }
  const [glow, core] = Array.from(svg.children) as SVGGElement[];
  for (const c of buildCracks(x, y, w, h)) {
    for (const g of [glow, core]) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', c.d);
      path.setAttribute('pathLength', '1');
      if (c.fork) path.setAttribute('class', 'is-fork');
      path.style.animationDelay = `${Math.round(c.delay)}ms`;
      g.appendChild(path);
    }
  }

  const impact = document.createElement('div');
  impact.className = 'theme-fx-impact';
  const rays = document.createElement('div');
  rays.className = 'theme-fx-rays';
  const flood = document.createElement('div');
  flood.className = 'theme-fx-flood';

  fx.append(flood, rays, svg, impact);
  document.body.appendChild(fx);

  const app = document.getElementById('root');
  app?.classList.add('theme-fx-shake');

  window.setTimeout(() => {
    // Swap instantly under the burst: suspend colour transitions for 2 frames
    const html = document.documentElement;
    html.classList.add('theme-fx-swapping');
    onSwap();
    requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('theme-fx-swapping')));
  }, FX_SWAP_MS);
  window.setTimeout(() => {
    fx.remove();
    app?.classList.remove('theme-fx-shake');
  }, FX_TOTAL_MS);
}

const TopbarInner: React.FC<TopbarProps> = ({
  currentView,
  activePatientId,
  patientStatus = 'Nominal',
  hmm_state = 0
}) => {
  const [clock, setClock] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const fxPlaying = useRef(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleDarkMode = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (fxPlaying.current) return; // ignore double-clicks mid-effect
    const newMode = !isDarkMode;
    const apply = () => {
      setIsDarkMode(newMode);
      if (newMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    };

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      apply();
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    fxPlaying.current = true;
    playThemeFracture(r.left + r.width / 2, r.top + r.height / 2, newMode, apply);
    window.setTimeout(() => {
      fxPlaying.current = false;
    }, FX_TOTAL_MS);
  };

  const titles: Record<ViewType, string> = {
    overview: 'Patient Overview',
    diagnostics: 'Patient Details',
    queue: 'Review Queue',
    models: 'How It Works'
  };

  const shortPatient = activePatientId ? activePatientId.replace('test-patient-', 'P-') : 'P-0825';
  
  const displayStatus = clinicalStatusToLabel(patientStatus);
  const displayHmm = hmmStateToLabel(hmm_state);

  const getStatusDot = () => {
    if (patientStatus === 'High Risk') return 'red';
    if (patientStatus === 'Review Required') return 'amber';
    return 'green';
  };

  const handleResetDemo = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/reset`, { method: 'POST' });
      alert('Demo state has been reset successfully. The page will now reload.');
      window.location.reload();
    } catch (e) {
      alert('Failed to reset demo state.');
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title" key={currentView}>{titles[currentView]}</span>
        {currentView === 'diagnostics' && (
          <>
            <span className="topbar-sep" aria-hidden="true">/</span>
            <div className="patient-context-pill">
              <span className={`dot ${getStatusDot()}`} aria-hidden="true" />
              <span className="mono-val">{shortPatient}</span>
              <span className="mono-dim">{displayStatus} - {displayHmm}</span>
            </div>
          </>
        )}
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className="btn-outline search-trigger"
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          aria-label="Search patients and pages"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <IconSearch />
          <span className="search-trigger-label">Search patients</span>
          <Kbd>{modKeyLabel}K</Kbd>
        </button>
        <button
          type="button"
          className="btn-outline theme-toggle"
          onClick={toggleDarkMode}
        >
          <span className="theme-toggle-icon" key={isDarkMode ? 'sun' : 'moon'}>
            {isDarkMode ? <IconSun /> : <IconMoon />}
          </span>
          <span className="theme-toggle-label" key={isDarkMode ? 'light' : 'dark'}>
            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </span>
        </button>
        <Popover content={<div className="pop-body">Resets the demo backend state, then reloads the page.</div>} placement="bottom">
          <button 
            type="button"
            className="btn-outline btn-tone-warn" 
            onClick={handleResetDemo}
          >
            <IconReset />
            Reset Demo
          </button>
        </Popover>
        <span className="time-indicator">{clock}</span>
      </div>
    </header>
  );
};

export const Topbar = React.memo(TopbarInner);
