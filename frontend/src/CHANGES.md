# The Vanishing Dose — UI overhaul v3 (interactive layer)

## Install
Copy `src/` over your frontend `src/`, then rebuild:

    docker-compose build frontend && docker-compose up -d frontend

**15 files: 12 replaced, 3 new.** No new npm packages.

- New: `components/ui.tsx`, `components/PatientPreview.tsx`, `components/CommandPalette.tsx`
- Replaced: `App.tsx` (only adds the palette mount), `styles/stitch.css`, the other 6 components, all 4 pages
- Untouched, byte-identical: `main.tsx`, `lib/clinicalLabels.ts`, `services/api.ts`, `hooks/useTelemetry.ts`, `types/index.ts`, `constants.ts`

## What's new
**Everywhere**
- Hover pop-ups are back. Cards, panels and pipeline nodes lift on hover, and metric cards get a cursor spotlight. The live waveform box is deliberately excluded.
- Command palette: press ⌘K / Ctrl+K, or use the Search button in the top bar, to jump to any patient or page. It works fully from the keyboard.
- Theme toggle does a circular reveal from the button (View Transitions API). Browsers without it, or with reduced motion, switch instantly.
- The sidebar has a sliding active indicator and status tooltips.

**Overview**
- Search by patient ID.
- Sortable Patient ID, Adherence and Score Range columns. The first click puts the clinically urgent end first.
- Hover a patient ID, or Tab onto a row, to get a preview card with adherence, 90% range bar, phase, review reason, meds and sensor.
- Inline range bars, count-up stats and a sliding filter indicator.
- A "Showing X of Y" footer. The original silently cut the list at 50 rows; now the cut is visible.
- The System Status tooltip shows each model's real on/off state from `/summary`.

**Patient Details**
- The prediction confidence chart is now mounted (it was never rendered before). Hover it for a readout and band highlighting.
- Key Risk Factors has Top factors / All contributions tabs. This is where `ShapPanel` is now used. Each factor has a magnitude bar and a raw SHAP value tooltip.
- Action buttons show a spinner and block double-submits while a request is in flight.
- Other additions:
  - a copy-patient-ID button
  - info tooltips on every metric
  - a heartbeat icon paced to live BPM
  - HR/SDNN chips on the stress alert
  - a collapsible, filterable clinical profile
  - an Event Log with an Alerts filter and slide-in for new entries
- Toasts are dismissible, show a countdown bar, and use a red style for failures.

**Review Queue**
- Status filter chips with counts.
- Per-row spinners.
- The flag-reason tooltip shows the raw model flag and range width.
- Preview cards on patient IDs.
- Action buttons wrap to a 2×2 grid below 1500px, so the table never scrolls sideways.

**How It Works**
- Interactive pipeline: an auto-playing tour with pause/play that pauses on hover.
- Click, hover or focus any step to read what it does.
- Lit connectors with a flowing dot.

## Safety & behaviour
- No API calls added. Every number, unit and rounding is unchanged. Status colours are fixed and every status still has a text label.
- Count-up animation is used only on cohort totals, never on patient values. Screen readers only get the final number.
- All motion respects `prefers-reduced-motion`.

## Verification (sandbox: mocked API + 50 Hz WebSocket, headless Chromium)
- `tsc -p tsconfig.app.json` (your config): 0 errors.
- With `strict` and `noUnused*` forced on: only the same 4 pre-existing warnings as the original code.
- CSS: 0 classes removed (183 added), no `transition: all`, reduced-motion block present.
- Interaction suite passed with 0 console errors or warnings. It covered:
  - tooltips, hover and keyboard preview cards
  - sort, search and filters
  - palette → P-0803
  - CI readout, tabs, collapse, event filter
  - toast, theme toggle
  - queue chips, auto-tour
- Queue table: no horizontal overflow at 1280, 1440 or 1920px.

**Please check on your side:** real backend + ESP32 stream, Safari/Firefox, and the "How It Works" step descriptions. I wrote those from the system design, so confirm they match your implementation.

## Still open (not changed, behaviour-level)
- **Clinical safety:** while the summary loads, Overview and Sidebar show hard-coded counts (198 / 25 / 48). They look like real data.
- Theme choice isn't persisted.
- Reset Demo hard-codes `http://localhost:8000/api/reset` instead of using `VITE_API_URL`.
- `useTelemetry` lives in `App`, so the whole tree re-renders about 50 times per second.
