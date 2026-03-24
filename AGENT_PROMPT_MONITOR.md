# YieldTracker — RSS Monitoring Panel (Shock/Vibe Gauges + Alerts)

Read this entire prompt. Use skills: frontend-design, systematic-debugging, verification-before-completion

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`
Well under test: Nabors X04, asset_id 74307056, iCruise (Halliburton)

All previous prompts are complete. The app has a working readings table, yield scatter plot, WITS channel mapper, and auto-trigger system. The `fetchLatestWitsRecord` in `corvaApi.ts` already merges raw WITS + summary-1ft + Cerebro into a single data object that the app polls every 5 seconds.

## Goal

Add a compact **RSS Monitoring Panel** that shows real-time shock/vibe levels, turbine RPM, and duty cycle with color-coded gauges and configurable alert thresholds. This gives the DD immediate situational awareness — especially important when lateral shock is running 29g (current Nabors X04 values).

The panel should sit as a new tab alongside "Readings" and "Yield Plot", or as a persistent strip above the tab content (your choice — but it should be visible without switching away from the readings table).

## Available Channels (confirmed on Nabors X04)

These are the actual `data.*` field names in the merged WITS record:

| Channel | Field Name | Current Value | Units | What It Measures |
|---------|-----------|---------------|-------|------------------|
| MWD Axial Shock | `mwd_axial_peak_shock` | 13.00 | g | Peak axial shock at MWD tool |
| MWD Lateral Shock | `mwd_lateral_peak_shock` | 29.00 | g | Peak lateral shock at MWD tool |
| RSS Whirl | `rsswhirl` | 1.00 | level | RSS lateral whirl indicator |
| RSS Turbine RPM | `rsslowtorqrpm` | 2100 | RPM | iCruise turbine RPM |
| Duty Cycle | `rsspsum` | 70.00 | % | RSS steering duty cycle |
| Gravity Toolface | `gravity_tool_face` | 73.13 | ° | Commanded gravity toolface |

Note: These field names are from the resolved channel map — the panel should read from the same merged WITS data that `useReadings.ts` uses, NOT create its own polling loop. We need a new hook or extend the existing polling to also update the monitoring values.

## Architecture

### New hook: `useRssMonitor.ts`

Create `src/effects/useRssMonitor.ts` that polls the latest WITS record (using `fetchLatestWitsRecord`) on a 5-second interval and extracts the monitoring channel values.

```typescript
export interface RssMonitorValues {
  mwdAxialShock: number | null;
  mwdLateralShock: number | null;
  rssWhirl: number | null;
  turbineRPM: number | null;
  dutyCycle: number | null;
  toolface: number | null;
  timestamp: number | null;
}

export interface RssMonitorThresholds {
  mwdAxialShock: { yellow: number; red: number };   // default: 10, 20
  mwdLateralShock: { yellow: number; red: number };  // default: 15, 30
  rssWhirl: { yellow: number; red: number };          // default: 2, 3
  turbineRPM: { low: number; critical: number };      // default: 1500, 1000 (INVERTED — low is bad)
}

export function useRssMonitor(
  assetId: number | undefined,
  channelMap: ResolvedChannelMap,
  enabled: boolean,
): {
  values: RssMonitorValues;
  thresholds: RssMonitorThresholds;
  setThresholds: (t: RssMonitorThresholds) => void;
}
```

**IMPORTANT:** The existing channel watcher in `useReadings.ts` already polls `fetchLatestWitsRecord` every 5 seconds when `isRunning` is true. The RSS monitor should also work when tracking is STOPPED — the DD needs to see shock levels even when not actively collecting yield readings. So `useRssMonitor` needs its own independent poll interval (5 seconds) that runs whenever the app is open, regardless of tracking state.

The hook should:
1. Poll `fetchLatestWitsRecord(assetId)` every 5 seconds
2. Extract values using the resolved channel map field names
3. Store thresholds in localStorage (keyed by `yieldtracker_monitor_thresholds`)
4. Return current values + thresholds + setter

### Channel field names

The monitoring channels are NOT in the `ResolvedChannelMap` (that only has steering/survey channels). The monitor channels should be read directly by field name from the merged WITS data object. Use these field names:

```typescript
const MONITOR_CHANNELS = {
  mwdAxialShock: 'mwd_axial_peak_shock',
  mwdLateralShock: 'mwd_lateral_peak_shock',
  rssWhirl: 'rsswhirl',
  turbineRPM: 'rsslowtorqrpm',
  dutyCycle: 'rsspsum',           // Already in channel map but read here too for display
  toolface: 'gravity_tool_face',  // Already in channel map but read here too for display
} as const;
```

**Future improvement:** These could be added to the channel map / WITS mapper so the DD can remap them per-rig. For now, hardcode them — we can add mapper support later.

### New component: `RssMonitorBar`

Create `src/components/RssMonitorBar/RssMonitorBar.tsx` — a compact horizontal strip that displays all monitoring values as color-coded gauges.

#### Layout

The bar should be a single row, ~48-56px tall, dark background (#1a1a1a), sitting between the RssToolInfo header and the ControlsBar. It should be always visible (not hidden behind a tab).

```
┌─────────────────────────────────────────────────────────────────────┐
│ AXIAL  13g ███░░  │ LATERAL  29g █████  │ WHIRL  1.0 █░░░░  │ RPM  2100 ████░  │
│        [■■□□□]    │          [■■■■■]    │        [■□□□□]     │      [■■■■□]     │
└─────────────────────────────────────────────────────────────────────┘
```

Each gauge should show:
1. **Label** — short name (e.g. "AXIAL", "LATERAL", "WHIRL", "TURB RPM")
2. **Value** — current numeric value with unit
3. **Color indicator** — background color or bar fill that goes:
   - Green (#4caf50) = normal / safe
   - Yellow/amber (#ff9800) = warning threshold
   - Red (#f44336) = danger threshold
4. **Trend arrow** (optional, nice-to-have) — ↑↓→ showing if the value is increasing, decreasing, or stable vs the previous poll

For **Turbine RPM**, the color logic is INVERTED:
- Green = RPM > 1500 (healthy)
- Yellow = RPM 1000-1500 (low, possible issue)
- Red = RPM < 1000 (critical — tool may be stalled)

#### Visual style

Use a compact bar chart or pill-shaped gauge for each metric. The fill width represents the value relative to a max scale:
- Axial shock: 0-40g scale
- Lateral shock: 0-50g scale
- Whirl: 0-5 scale
- Turbine RPM: 0-3000 scale

The gauge fill color changes based on thresholds. Use CSS transitions for smooth color changes.

#### Threshold configuration

Add a small gear/settings icon on the right side of the monitor bar. Clicking it opens a compact inline panel (below the bar) where the DD can adjust thresholds:

```
Thresholds:
  Axial Shock:   Yellow [10] g   Red [20] g
  Lateral Shock: Yellow [15] g   Red [30] g
  RSS Whirl:     Yellow [2]      Red [3]
  Turbine RPM:   Low [1500]      Critical [1000]
```

Each threshold is an editable number input. Changes persist to localStorage immediately.

### Wiring into App.tsx

In `App.tsx`:
1. Import and call `useRssMonitor(assetId, resolvedMapFinal, true)`
2. Render `<RssMonitorBar>` between the RssToolInfo header and the ControlsBar
3. Pass values and thresholds as props

```tsx
// In App.tsx
const { values: monitorValues, thresholds, setThresholds } = useRssMonitor(assetId, resolvedMapFinal, true);

// In the JSX, between RssToolInfo and ControlsBar:
<RssMonitorBar
  values={monitorValues}
  thresholds={thresholds}
  onThresholdsChange={setThresholds}
/>
```

### Avoid duplicate polling

The `useRssMonitor` hook will poll `fetchLatestWitsRecord` independently. This means when tracking is running, there will be two poll loops hitting the same endpoint (one from `useReadings` channel watcher, one from `useRssMonitor`). This is acceptable — the calls are lightweight (limit=1) and the 5-second interval is reasonable. 

If you want to optimize, you could share the polling between the two hooks by lifting the WITS poll to a parent hook and passing the latest record down. But for MVP, independent polls are fine.

## Files to Create

| File | Purpose |
|------|---------|
| `src/effects/useRssMonitor.ts` | Hook: poll WITS, extract monitor values, manage thresholds |
| `src/components/RssMonitorBar/RssMonitorBar.tsx` | Compact gauge strip component |
| `src/components/RssMonitorBar/RssMonitorBar.module.css` | Styles for the monitor bar |
| `src/components/RssMonitorBar/index.ts` | Export |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Import `useRssMonitor` and `RssMonitorBar`, wire them in between header and controls |

## What NOT to change

- `src/effects/useReadings.ts` — the channel watcher and takeReading logic are correct
- `src/api/corvaApi.ts` — the WITS fetch/merge logic is correct
- `src/witsMapper/` — channel mapping system is correct
- `src/components/ReadingsTable/` — table is correct
- `src/components/ControlsBar/` — controls are correct
- `src/calculations/` — math is correct

## Default Thresholds

Based on typical iCruise operating parameters and current Nabors X04 values:

```typescript
const DEFAULT_THRESHOLDS: RssMonitorThresholds = {
  mwdAxialShock: { yellow: 10, red: 20 },
  mwdLateralShock: { yellow: 15, red: 30 },
  rssWhirl: { yellow: 2, red: 3 },
  turbineRPM: { low: 1500, critical: 1000 },
};
```

## Color Logic

```typescript
function getAlertLevel(value: number | null, yellow: number, red: number): 'green' | 'yellow' | 'red' | 'unknown' {
  if (value == null) return 'unknown';
  if (value >= red) return 'red';
  if (value >= yellow) return 'yellow';
  return 'green';
}

// For turbine RPM (inverted — low is bad):
function getRpmAlertLevel(value: number | null, low: number, critical: number): 'green' | 'yellow' | 'red' | 'unknown' {
  if (value == null) return 'unknown';
  if (value <= critical) return 'red';
  if (value <= low) return 'yellow';
  return 'green';
}
```

## Styling Guidelines

- Match the existing app dark theme: background #1a1a1a, text #ddd, borders #333
- Use the existing `YIELD_COLORS` from constants.ts for green/yellow/red
- Gauges should be compact — the whole bar should be ~48-56px tall
- Use monospace font for values (same as the readings table)
- Gauge labels in uppercase, muted color (#888), 10-11px
- Values in bold, 13-14px, color matches the alert level
- Smooth CSS transitions on color changes (0.3s ease)

## Build Verification

Run `yarn build` after all changes. Fix all errors before considering done.

## Definition of Done

- [ ] `useRssMonitor` hook polls every 5 seconds independently of tracking state
- [ ] Monitor values extracted from merged WITS data using correct field names
- [ ] `RssMonitorBar` renders a compact horizontal strip with 4 gauges
- [ ] Each gauge shows label, value, unit, and color-coded fill
- [ ] Color coding: green (safe), yellow (warning), red (danger)
- [ ] Turbine RPM has inverted thresholds (low = bad)
- [ ] Thresholds configurable via inline settings panel
- [ ] Thresholds persist to localStorage
- [ ] Bar is always visible (not behind a tab)
- [ ] Works when tracking is stopped (independent polling)
- [ ] Matches existing dark theme
- [ ] **`yarn build` completes with ZERO errors**
