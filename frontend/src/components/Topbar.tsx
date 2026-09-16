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
const FX_SWAP_MS = 130;
const FX_TOTAL_MS = 260;

function playThemeVeil(toDark: boolean, onSwap: () => void): void {
  const fx = document.createElement('div');
  fx.className = `theme-fx ${toDark ? 'theme-fx--dark' : 'theme-fx--light'}`;
  fx.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fx);

  window.setTimeout(() => {
    // Swap instantly at full opacity: suspend transitions for 2 frames so
    // nothing visibly interpolates between the old and new palette.
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
    playThemeVeil(newMode, apply);
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
