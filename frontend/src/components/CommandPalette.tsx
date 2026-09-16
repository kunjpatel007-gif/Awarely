import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PatientSummary, ViewType } from '../types';
import { clinicalStatusToLabel } from '../lib/clinicalLabels';
import { statusDot } from './PatientPreview';
import { IconLayout, IconSearch, IconUser, Kbd, OPEN_PALETTE_EVENT, modKeyLabel } from './ui';

interface CommandPaletteProps {
  patients: PatientSummary[];
  onSelectPatient: (patientId: string) => void;
  onSelectView: (view: ViewType) => void;
}

type PaletteItem =
  | { key: string; kind: 'view'; view: ViewType; label: string }
  | { key: string; kind: 'patient'; patient: PatientSummary; label: string };

const VIEWS: Array<{ view: ViewType; label: string }> = [
  { view: 'overview', label: 'Patient Overview' },
  { view: 'diagnostics', label: 'Patient Details' },
  { view: 'queue', label: 'Review Queue' },
  { view: 'models', label: 'How It Works' }
];

const shortId = (pid: string) => pid.replace('test-patient-', 'P-');

export const CommandPalette: React.FC<CommandPaletteProps> = ({ patients, onSelectPatient, onSelectView }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const listId = useId();

  // ⌘K / Ctrl+K anywhere, or the Topbar search button
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery('');
      setIndex(0);
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    restoreFocusRef.current?.focus?.();
    restoreFocusRef.current = null;
    return undefined;
  }, [open]);

  const q = query.trim().toLowerCase();

  const { views, matches } = useMemo(() => {
    const v: PaletteItem[] = VIEWS.filter(x => !q || x.label.toLowerCase().includes(q)).map(x => ({
      key: `view-${x.view}`,
      kind: 'view' as const,
      view: x.view,
      label: x.label
    }));
    const pool = q
      ? patients.filter(p => p.patient_id.toLowerCase().includes(q) || shortId(p.patient_id).toLowerCase().includes(q))
      : [...patients].sort((a, b) => a.base_risk - b.base_risk);
    const m: PaletteItem[] = pool.slice(0, q ? 8 : 5).map(p => ({
      key: `patient-${p.patient_id}`,
      kind: 'patient' as const,
      patient: p,
      label: shortId(p.patient_id)
    }));
    return { views: v, matches: m };
  }, [q, patients]);

  const items = useMemo(() => [...views, ...matches], [views, matches]);
  const active = Math.min(index, Math.max(0, items.length - 1));

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, listId]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    if (item.kind === 'view') onSelectView(item.view);
    else onSelectPatient(item.patient.patient_id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex(items.length ? (active + 1) % items.length : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex(items.length ? (active - 1 + items.length) % items.length : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // keep focus inside the dialog
    }
  };

  if (!open) return null;

  const renderItem = (item: PaletteItem, i: number) => (
    <div
      key={item.key}
      id={`${listId}-opt-${i}`}
      role="option"
      aria-selected={i === active}
      className="palette-item"
      onMouseMove={() => i !== active && setIndex(i)}
      onMouseDown={e => e.preventDefault()}
      onClick={() => choose(item)}
    >
      <span className="palette-item-icon">{item.kind === 'view' ? <IconLayout /> : <IconUser />}</span>
      {item.kind === 'view' ? (
        <span className="palette-item-main">{item.label}</span>
      ) : (
        <>
          <span className="palette-item-main">
            <span className="mono-val">{item.label}</span>
            <span className="palette-item-meta">
              <span className={`dot ${statusDot(item.patient.clinical_status)}`} aria-hidden="true" />
              {clinicalStatusToLabel(item.patient.clinical_status)}
            </span>
          </span>
          <span className={`palette-item-value${item.patient.base_risk < 0.60 ? ' tone-critical' : ''}`}>
            {(item.patient.base_risk * 100).toFixed(1)}%
          </span>
        </>
      )}
    </div>
  );

  return createPortal(
    <div
      className="palette-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search patients and pages">
        <div className="palette-search">
          <IconSearch />
          <input
            ref={inputRef}
            className="palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items.length ? `${listId}-opt-${active}` : undefined}
            aria-autocomplete="list"
            placeholder="Search patient ID or page"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="palette-list" role="listbox" id={listId} aria-label="Results">
          {items.length === 0 ? (
            <div className="palette-empty">No patients or pages match “{query.trim()}”.</div>
          ) : (
            <>
              {views.length > 0 && <div className="palette-group" role="presentation">Pages</div>}
              {views.map((item, i) => renderItem(item, i))}
              {matches.length > 0 && (
                <div className="palette-group" role="presentation">
                  {q ? 'Patients' : 'Lowest adherence'}
                </div>
              )}
              {matches.map((item, i) => renderItem(item, views.length + i))}
            </>
          )}
        </div>

        <div className="palette-foot">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span><Kbd>Enter</Kbd> open</span>
          <span><Kbd>{modKeyLabel}K</Kbd> toggle</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

