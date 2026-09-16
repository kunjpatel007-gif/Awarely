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
   Theme transition: a fast, full-viewport veil crossfades over the theme
   swap so no intermediate/mismatched colors are visible. No motion tied to
   the toggle's position — it covers the whole screen at once. Built
   imperatively on <body> so it never re-renders React, and removed from the
   DOM when finished.
   ========================================================================== */

/* ==========================================================================
   Theme "fracture" effect (v2). Cracks appear scattered across the whole
   viewport at once — multiple origin points, not the toggle's position —
   and light/darkness pops out of each one before a flood catches up and
   covers the swap. Fast (~420ms total) and built imperatively on <body> so
   it never re-renders React; removed from the DOM when finished.
   ========================================================================== */
const SVG_NS = 'http://www.w3.org/2000/svg';
const FX_SWAP_MS = 240;
const FX_TOTAL_MS = 420;

interface Crack { d: string; delay: number }
interface Burst { x: number; y: number; delay: number }

function buildScreenCracks(w: number, h: number): { cracks: Crack[]; bursts: Burst[] } {
  const cracks: Crack[] = [];
  const bursts: Burst[] = [];
  const pt = (px: number, py: number) => `${px.toFixed(1)} ${py.toFixed(1)}`;

  // Scatter origin points across the whole viewport in a jittered grid so
  // cracks appear all over the screen rather than from one spot.
  const cols = Math.max(3, Math.round(w / 340));
  const rows = Math.max(2, Math.round(h / 340));
  const cellW = w / cols;
  const cellH = h / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.25) continue; // skip some cells so it isn't a perfect grid
      const ox = c * cellW + cellW * (0.3 + Math.random() * 0.4);
      const oy = r * cellH + cellH * (0.3 + Math.random() * 0.4);
      const originDelay = Math.random() * 90;
      bursts.push({ x: ox, y: oy, delay: originDelay + 40 });

      const lines = 2 + Math.floor(Math.random() * 3); // 2-4 short cracks per origin
      for (let i = 0; i < lines; i++) {
        let angle = Math.random() * Math.PI * 2;
        const len = Math.min(cellW, cellH) * (0.5 + Math.random() * 0.5);
        let px = ox;
        let py = oy;
        let travelled = 0;
        let d = `M${pt(px, py)}`;
        while (travelled < len) {
          const step = 14 + Math.random() * 26;
          angle += (Math.random() - 0.5) * 0.7;
          px += Math.cos(angle) * step;
          py += Math.sin(angle) * step;
          travelled += step;
          d += ` L${pt(px, py)}`;
        }
        cracks.push({ d, delay: originDelay + Math.random() * 20 });
      }
    }
  }
  return { cracks, bursts };
}

function playThemeFracture(toDark: boolean, onSwap: () => void): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fx = document.createElement('div');
  fx.className = `theme-fx ${toDark ? 'theme-fx--dark' : 'theme-fx--light'}`;
  fx.setAttribute('aria-hidden', 'true');

  const { cracks, bursts } = buildScreenCracks(w, h);

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
  for (const c of cracks) {
    for (const g of [glow, core]) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', c.d);
      path.setAttribute('pathLength', '1');
      path.style.animationDelay = `${Math.round(c.delay)}ms`;
      g.appendChild(path);
    }
  }

  const burstLayer = document.createDocumentFragment();
  for (const b of bursts) {
    const el = document.createElement('div');
    el.className = 'theme-fx-burst';
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
    el.style.animationDelay = `${Math.round(b.delay)}ms`;
    burstLayer.appendChild(el);
  }

  const flood = document.createElement('div');
  flood.className = 'theme-fx-flood';

  fx.append(svg, burstLayer, flood);
  document.body.appendChild(fx);

  window.setTimeout(() => {
    // Swap under the flood: suspend transitions for 2 frames so nothing
    // visibly interpolates between the old and new palette.
    const html = document.documentElement;
    html.classList.add('theme-fx-swapping');
    onSwap();
    requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('theme-fx-swapping')));
  }, FX_SWAP_MS);

  window.setTimeout(() => {
    fx.remove();
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

    const toggleDarkMode = () => {
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
    fxPlaying.current = true;
    playThemeFracture(newMode, apply);
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
