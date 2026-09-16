import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ==========================================================================
   Shared interaction primitives for The Vanishing Dose.
   No dependencies beyond React / react-dom. Every animated primitive respects
   prefers-reduced-motion (CSS handles keyframes; JS checks the media query).
   ========================================================================== */

export const OPEN_PALETTE_EVENT = 'vd:open-command-palette';

export const modKeyLabel: string =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '⌘'
    : 'Ctrl ';

/* ---------------------------------------------------------------- Icons -- */

export const Svg: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <svg
    className={`icon${className ? ` ${className}` : ''}`}
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const IconCheck = () => <Svg><path d="M3 8.5l3.2 3L13 4.5" /></Svg>;
export const IconCross = () => <Svg><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
export const IconCalendar = () => (
  <Svg><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></Svg>
);
export const IconPill = () => (
  <Svg><rect x="1.8" y="5.5" width="12.4" height="5" rx="2.5" transform="rotate(-45 8 8)" /><path d="M6.2 6.2l3.6 3.6" /></Svg>
);
export const IconBell = () => (
  <Svg><path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3L4 11z" /><path d="M6.5 14.5h3" /></Svg>
);
export const IconBack = () => <Svg><path d="M10 3.5L5.5 8l4.5 4.5" /></Svg>;
export const IconChevronDown = () => <Svg><path d="M4 6l4 4 4-4" /></Svg>;
export const IconArrowUp = () => <Svg><path d="M8 13V3M4 7l4-4 4 4" /></Svg>;
export const IconArrowDown = () => <Svg><path d="M8 3v10M4 9l4 4 4-4" /></Svg>;
export const IconAlert = () => (
  <Svg><path d="M8 2.5l6 10.5H2L8 2.5z" /><path d="M8 6.5v3M8 11.25v.01" /></Svg>
);
export const IconInfoDot = () => <Svg><circle cx="8" cy="8" r="2.5" /></Svg>;
export const IconInfo = () => <Svg><circle cx="8" cy="8" r="6" /><path d="M8 7.25V11M8 5v.01" /></Svg>;
export const IconEye = () => (
  <Svg><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></Svg>
);
export const IconSun = () => (
  <Svg>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
  </Svg>
);
export const IconMoon = () => <Svg><path d="M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1z" /></Svg>;
export const IconReset = () => (
  <Svg><path d="M2 8a6 6 0 1 0 6-6 6.5 6.5 0 0 0-4.5 1.83L2 5.33" /><path d="M2 2v3.33h3.33" /></Svg>
);
export const IconSearch = () => <Svg><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></Svg>;
export const IconCopy = () => (
  <Svg><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-1a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1" /></Svg>
);
export const IconSortAsc = () => <Svg><path d="M8 12V4M5 7l3-3 3 3" /></Svg>;
export const IconSortDesc = () => <Svg><path d="M8 4v8M5 9l3 3 3-3" /></Svg>;
export const IconSortNone = () => <Svg><path d="M5 6.5l3-3 3 3M5 9.5l3 3 3-3" /></Svg>;
export const IconHeart = () => (
  <Svg><path d="M8 13.5L2.9 8.6A3.1 3.1 0 0 1 8 4.5a3.1 3.1 0 0 1 5.1 4.1L8 13.5z" /></Svg>
);
export const IconSpinner = () => <Svg className="spin"><path d="M8 2a6 6 0 1 0 6 6" /></Svg>;
export const IconUser = () => <Svg><circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5a5 5 0 0 1 10 0" /></Svg>;
export const IconLayout = () => <Svg><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M6.5 2.5v11" /></Svg>;
export const IconPlay = () => <Svg><path d="M5 3.5v9l7-4.5-7-4.5z" /></Svg>;
export const IconPause = () => <Svg><path d="M5.5 3.5v9M10.5 3.5v9" /></Svg>;

/* ---------------------------------------------------------------- Hooks -- */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(REDUCED_QUERY).matches
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(REDUCED_QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Sliding indicator: measures the element matching `selector` inside the
 * container and exposes its box as --ind-x/--ind-y/--ind-w/--ind-h.
 * data-indicator="init" on first measure (no transition), then "ready".
 */
export function useIndicator(
  ref: { current: HTMLElement | null },
  selector: string,
  deps: React.DependencyList
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const active = el.querySelector<HTMLElement>(selector);
      if (!active) {
        el.removeAttribute('data-indicator');
        return;
      }
      el.style.setProperty('--ind-x', `${active.offsetLeft}px`);
      el.style.setProperty('--ind-y', `${active.offsetTop}px`);
      el.style.setProperty('--ind-w', `${active.offsetWidth}px`);
      el.style.setProperty('--ind-h', `${active.offsetHeight}px`);
      if (!el.hasAttribute('data-indicator')) {
        el.setAttribute('data-indicator', 'init');
        raf = requestAnimationFrame(() => el.setAttribute('data-indicator', 'ready'));
      }
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Mouse-follow spotlight for cards: sets --spot-x/--spot-y on the target. */
export function spotlight(e: React.MouseEvent<HTMLElement>): void {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--spot-x', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--spot-y', `${e.clientY - r.top}px`);
}

/** Wraps the first case-insensitive match of `query` in <mark>. */
export function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="hl">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/* ------------------------------------------------------------- Popover -- */

type Placement = 'top' | 'bottom';

interface PopoverProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: Placement;
  delay?: number;
  /** 'tip' = small dark tooltip, 'card' = rich hover card */
  variant?: 'tip' | 'card';
  /** Keep open while the pointer is over the bubble */
  interactive?: boolean;
  /** Open regardless of hover (e.g. keyboard focus on a table row) */
  forceOpen?: boolean;
  display?: 'inline' | 'block';
  className?: string;
}

export const Popover: React.FC<PopoverProps> = ({
  content,
  children,
  placement = 'top',
  delay = 250,
  variant = 'tip',
  interactive = false,
  forceOpen = false,
  display = 'inline',
  className = ''
}) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const [hovered, setHovered] = useState(false);
  const [side, setSide] = useState<Placement>(placement);
  const id = useId();
  const open = hovered || forceOpen;

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    []
  );

  const show = () => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setHovered(true), delay);
  };
  const hide = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHovered(false), interactive ? 120 : 0);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!anchor || !bubble) return;

    const place = () => {
      const a = anchor.getBoundingClientRect();
      const b = bubble.getBoundingClientRect();
      const gap = 10;
      const margin = 8;
      let s: Placement = placement;
      if (s === 'top' && a.top - b.height - gap < margin) s = 'bottom';
      else if (s === 'bottom' && a.bottom + b.height + gap > window.innerHeight - margin) s = 'top';
      const top = s === 'top' ? a.top - b.height - gap : a.bottom + gap;
      const left = Math.min(Math.max(a.left + a.width / 2 - b.width / 2, margin), window.innerWidth - b.width - margin);
      const arrow = Math.min(Math.max(a.left + a.width / 2 - left, 14), b.width - 14);
      bubble.style.setProperty('--pop-x', `${Math.round(left)}px`);
      bubble.style.setProperty('--pop-y', `${Math.round(top)}px`);
      bubble.style.setProperty('--pop-arrow', `${Math.round(arrow)}px`);
      setSide(s);
    };
    place();

    const close = () => setHovered(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    ro?.observe(bubble);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', place);
    window.addEventListener('keydown', onKey);
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, placement]);

  return (
    <>
      <span
        ref={anchorRef}
        className={`pop-anchor pop-anchor--${display}${className ? ` ${className}` : ''}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={open && variant === 'tip' ? id : undefined}
      >
        {children}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={bubbleRef}
            id={id}
            role={variant === 'tip' ? 'tooltip' : undefined}
            className={`pop pop--${variant} pop--${side}${interactive ? ' pop--interactive' : ''}`}
            onMouseEnter={interactive ? () => window.clearTimeout(closeTimer.current) : undefined}
            onMouseLeave={interactive ? hide : undefined}
          >
            {content}
            <span className="pop-arrow" aria-hidden="true" />
          </div>,
          document.body
        )}
    </>
  );
};

/** Small (i) button with an explanatory tooltip. */
export const InfoTip: React.FC<{ label: string; children: React.ReactNode; placement?: Placement }> = ({
  label,
  children,
  placement = 'top'
}) => (
  <Popover content={<div className="pop-body">{children}</div>} placement={placement}>
    <button type="button" className="info-tip" aria-label={label}>
      <IconInfo />
    </button>
  </Popover>
);

/* ------------------------------------------------------- Display bits -- */

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => <kbd className="kbd">{children}</kbd>;

/** Counts up to `value`. Screen readers only ever get the final value. */
export const AnimatedNumber: React.FC<{ value: number; format?: (n: number) => string; duration?: number }> = ({
  value,
  format = n => Math.round(n).toString(),
  duration = 700
}) => {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState<number>(reduced ? value : 0);
  const fromRef = useRef<number>(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = t >= 1 ? value : from + (value - from) * eased;
      fromRef.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, duration]);

  return (
    <>
      <span aria-hidden="true">{format(display)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
};

/** Compact interval bar: band = [lower, upper], dot = point estimate (all 0..1). */
export const RangeBar: React.FC<{
  lower: number;
  upper: number;
  point?: number;
  tone?: 'critical' | 'warn' | 'healthy' | 'neutral';
  size?: 'sm' | 'md';
}> = ({ lower, upper, point, tone = 'neutral', size = 'sm' }) => {
  const clamp = (n: number) => Math.min(100, Math.max(0, n * 100));
  const l = clamp(lower);
  const u = clamp(upper);
  const vars = {
    '--rb-l': `${l}%`,
    '--rb-w': `${Math.max(0, u - l)}%`,
    '--rb-p': `${point === undefined ? 0 : clamp(point)}%`
  } as React.CSSProperties;
  return (
    <span className={`range-bar range-bar--${size} accent-${tone}`} style={vars} aria-hidden="true">
      <span className="range-bar-band" />
      {point !== undefined && <span className="range-bar-point" />}
    </span>
  );
};

/* ------------------------------------------------------------ Controls -- */

export const SearchField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  compact?: boolean;
}> = ({ value, onChange, placeholder, label, compact = false }) => (
  <div className={`search-field${compact ? ' search-field--compact' : ''}`}>
    <IconSearch />
    <input
      type="search"
      className="search-input"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Escape' && value) {
          e.stopPropagation();
          onChange('');
        }
      }}
    />
    {value && (
      <button type="button" className="search-clear" aria-label="Clear search" onClick={() => onChange('')}>
        <IconCross />
      </button>
    )}
  </div>
);

export interface ChipOption<T extends string> {
  value: T;
  label: React.ReactNode;
  count?: number;
  tone?: 'critical' | 'warn' | 'healthy' | 'info';
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label
}: {
  options: Array<ChipOption<T>>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`chip${o.tone ? ` accent-${o.tone}` : ''}${value === o.value ? ' is-active' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.tone && <span className="chip-dot" aria-hidden="true" />}
          {o.label}
          {o.count !== undefined && <span className="chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export interface TabItem {
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
}

export const Tabs: React.FC<{ items: TabItem[]; label: string }> = ({ items, label }) => {
  const [active, setActive] = useState<string>(items[0]?.id ?? '');
  const listRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  useIndicator(listRef, '[aria-selected="true"]', [active, items.length]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = items.findIndex(t => t.id === active);
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    setActive(items[next].id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div className="tabs">
      <div className="tab-list" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
        {items.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            className="tab"
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="tab-indicator" aria-hidden="true" />
      </div>
      {items
        .filter(t => t.id === active)
        .map(t => (
          <div
            key={t.id}
            role="tabpanel"
            id={`${baseId}-panel-${t.id}`}
            aria-labelledby={`${baseId}-tab-${t.id}`}
            className="tab-panel"
          >
            {t.content}
          </div>
        ))}
    </div>
  );
};

export const CollapsiblePanel: React.FC<{
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, meta, actions, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <div className={`clinical-panel collapsible${open ? ' is-open' : ''}`}>
      <div className="panel-header">
        <button
          type="button"
          className="collapse-toggle"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen(o => !o)}
        >
          <span className="collapse-chevron">
            <IconChevronDown />
          </span>
          <span className="panel-title">{title}</span>
          {meta && <span className="panel-meta">{meta}</span>}
        </button>
        {actions && open && <div className="panel-tools">{actions}</div>}
      </div>
      <div className="collapse-region" id={regionId}>
        <div className="collapse-inner">{children}</div>
      </div>
    </div>
  );
};

export const Toast: React.FC<{ message: string; onClose: () => void; duration?: number }> = ({
  message,
  onClose,
  duration = 3000
}) => {
  const isError = message.startsWith('Failed');
  return (
    <div
      className={`action-toast${isError ? ' is-error' : ''}`}
      role="status"
      aria-live="polite"
      style={{ '--toast-duration': `${duration}ms` } as React.CSSProperties}
    >
      <span className="action-toast-icon">{isError ? <IconAlert /> : <IconCheck />}</span>
      <span className="action-toast-text">{message}</span>
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={onClose}>
        <IconCross />
      </button>
      <span className="action-toast-progress" key={message} aria-hidden="true" />
    </div>
  );
};

/* ------------------------------------------------ Visibility & motion -- */

/** True while the element intersects the viewport (or once, with `once`). */
export function useInView(
  ref: { current: Element | null },
  options: { once?: boolean; rootMargin?: string; threshold?: number } = {}
): boolean {
  const { once = false, rootMargin = '0px', threshold = 0.15 } = options;
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, rootMargin, threshold]);
  return inView;
}

/** False while the browser tab is hidden, so loops can stop burning CPU. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/** One-shot fade/rise as the block scrolls into view. */
export const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({
  children,
  delay = 0,
  className = ''
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const shown = useInView(ref, { once: true, rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
  return (
    <div
      ref={ref}
      className={`reveal${shown ? ' is-revealed' : ''}${className ? ` ${className}` : ''}`}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
};

/** Circular gauge (0..1). Decorative: always pair with the number in text. */
export const ProgressRing: React.FC<{
  value: number;
  tone?: 'critical' | 'warn' | 'healthy' | 'neutral' | 'info';
  size?: number;
}> = ({ value, tone = 'neutral', size = 44 }) => {
  const v = Math.min(1, Math.max(0, value));
  return (
    <svg
      className={`progress-ring accent-${tone}`}
      width={size}
      height={size}
      viewBox="0 0 44 44"
      aria-hidden="true"
      focusable="false"
      style={{ '--ring-offset': `${1 - v}` } as React.CSSProperties}
    >
      <circle className="progress-ring-track" cx="22" cy="22" r="18" pathLength={1} />
      <circle className="progress-ring-value" cx="22" cy="22" r="18" pathLength={1} />
    </svg>
  );
};

/** Shimmering placeholder block. */
export const Skeleton: React.FC<{ width?: string; height?: string; className?: string }> = ({
  width = '100%',
  height = '12px',
  className = ''
}) => (
  <span
    className={`skeleton${className ? ` ${className}` : ''}`}
    style={{ '--sk-w': width, '--sk-h': height } as React.CSSProperties}
    aria-hidden="true"
  />
);
