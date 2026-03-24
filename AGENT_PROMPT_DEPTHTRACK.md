# YieldTracker — Depth Track Plot (Multi-Channel Strip Chart)

Read this entire prompt. Use skills: frontend-design, systematic-debugging, verification-before-completion

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`
Well under test: Nabors X04, asset_id 74307056, iCruise (Halliburton)

The app has a "Readings" tab (table) and a "Yield Plot" tab (DC vs DLS scatter). The existing scatter plot uses raw SVG (no charting library). The readings array (`YieldReading[]`) contains all collected data points with depth, RSS inc/az, MWD inc/az, rates (BR/TR/DLS), MWD rates, DC%, TF, resultant TF, and section.

Additionally, the `useRssMonitor` hook provides real-time shock/vibe values (mwd_axial_peak_shock, mwd_lateral_peak_shock, rsswhirl, rsslowtorqrpm) but those are NOT stored per-reading — they're live-only values. For the depth track, we'll plot what's IN the readings data.

## Goal

Add a **Depth Track Plot** — a vertical strip chart that shows multiple channels plotted against depth. This is the standard visualization every DD uses to understand the story of a run: where rates spiked, where the tool was efficient, where shock was high, and how steering commands related to wellbore response.

## Tab Setup

Add a third tab: `'depthTrack'` alongside `'table'` and `'scatter'`.

In `src/types.ts`, update:
```typescript
export type TabId = 'table' | 'scatter' | 'depthTrack';
```

In `src/constants.ts`, update `TABS`:
```typescript
export const TABS: { id: TabId; label: string }[] = [
  { id: 'table', label: 'Readings' },
  { id: 'scatter', label: 'Yield Plot' },
  { id: 'depthTrack', label: 'Depth Track' },
];
```

## Architecture

### Layout: Vertical strip chart with shared depth axis

The depth track is a set of **side-by-side vertical panels** (called "tracks"), each plotting a different set of channels against the same depth axis. Depth runs top-to-bottom (shallowest at top, deepest at bottom) — this is the drilling convention.

```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Inc (°)  │ Az (°)   │ DLS      │ DC %     │ TF (°)   │
│          │          │ (°/100ft)│          │          │
│  RSS ─── │  RSS ─── │  RSS ─── │ ████████ │  Set ─── │
│  MWD --- │  MWD --- │  MWD --- │          │  Res --- │
│          │          │          │          │          │
│  ←depth→ │  ←depth→ │  ←depth→ │  ←depth→ │  ←depth→ │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

### Track definitions

Define 5 tracks, each with its own x-axis scale:

| Track | Label | Lines | Colors | Scale |
|-------|-------|-------|--------|-------|
| 1 | Inclination | RSS Inc (solid), MWD Inc (dashed) | `#4caf50` RSS, `#888` MWD | Auto-range from data ±2° |
| 2 | Azimuth | RSS Az (solid), MWD Az (dashed) | `#2196f3` RSS, `#888` MWD | Auto-range from data ±5° |
| 3 | DLS | RSS DLS (solid), MWD DLS (dashed) | `#ff9800` RSS, `#888` MWD | 0 to max(DLS)*1.2 |
| 4 | Duty Cycle | DC% (filled area) | `#9c27b0` fill with 30% opacity | 0 to 100 |
| 5 | Toolface | TF Set (solid), Resultant TF (dashed) | `#e91e63` Set, `#888` Resultant | 0 to 360° |

### Component: `DepthTrackPlot`

Create `src/components/DepthTrackPlot/DepthTrackPlot.tsx`.

Props:
```typescript
interface DepthTrackPlotProps {
  readings: YieldReading[];
}
```

### Implementation approach: Pure SVG (same as YieldScatterPlot)

Use the same raw SVG approach as the existing scatter plot — no external charting library. This keeps the bundle small and gives full control over the dark theme styling.

The chart is rendered as a single SVG with 5 track columns:

```typescript
const TRACK_WIDTH = 110;  // Width of each track panel
const TRACK_GAP = 4;      // Gap between tracks
const LABEL_HEIGHT = 40;  // Header area for track labels
const DEPTH_AXIS_WIDTH = 55; // Left margin for depth labels
const PADDING = { top: 10, right: 10, bottom: 20 };

// Total width: DEPTH_AXIS_WIDTH + 5 * TRACK_WIDTH + 4 * TRACK_GAP + PADDING.right
// ≈ 55 + 550 + 16 + 10 = 631px — fits in the Corva app width
```

### Depth axis (shared, left side)

- Depth runs top-to-bottom (y=0 at shallowest reading, y=max at deepest)
- Tick marks every 10ft (or auto-scaled based on depth range)
- Depth labels in 12px monospace, color #888
- Horizontal grid lines at each depth tick, extending across all tracks (very faint, #2a2a2a)

### Line rendering

For each track, plot the readings as connected line segments:

```typescript
// Build SVG polyline points for a channel
function buildLinePath(
  readings: YieldReading[],
  getValue: (r: YieldReading) => number | null,
  scaleX: (v: number) => number,  // Maps channel value to x position within track
  scaleY: (depth: number) => number,  // Maps depth to y position
): string {
  const points: string[] = [];
  for (const r of readings) {
    const val = getValue(r);
    if (val == null) continue;
    points.push(`${scaleX(val)},${scaleY(r.depth)}`);
  }
  return points.join(' ');
}
```

Use `<polyline>` for solid lines and `<polyline stroke-dasharray="4 3">` for dashed lines.

### Filled area (Duty Cycle track)

For the DC% track, render as a filled area chart:
```typescript
// Area from 0% to actual DC%
<polygon points={`${x0},${y0} ${...valuePoints} ${x0},${yN}`} fill="#9c27b0" fillOpacity={0.3} />
<polyline points={valuePoints} fill="none" stroke="#9c27b0" strokeWidth={1.5} />
```

### Track headers

Each track has a header showing the track name and the scale range:
```
┌─────────────┐
│  Inc (°)    │
│  88 — 94    │
└─────────────┘
```

Header background: #1e1e1e, text: #aaa for label, #666 for scale range.

### Tooltips

When hovering over any track at a given depth, show a horizontal crosshair line across all tracks and a tooltip showing all values at that depth:

```
Depth: 18720.5 ft
RSS Inc: 91.23°  MWD Inc: 90.54°
RSS Az: 276.41°  MWD Az: 273.89°
DLS: 5.82  MWD DLS: 4.21
DC: 70%  TF Set: 73.1°  Res TF: 85.2°
```

Use a vertical cursor tracker — on mousemove, calculate which depth index is closest to the mouse Y position and display the crosshair + tooltip.

### Section coloring

Use a subtle background color band to show which section each reading belongs to:
- Curve: very faint amber (#f59e0b at 5% opacity)
- U-Turn: very faint purple (#8b5cf6 at 5% opacity)

These are vertical bands behind the line traces, spanning the depth range of each section's readings.

### Scrolling / Zooming

If there are many readings spanning a large depth range, the chart should be scrollable vertically. Set a minimum height per foot (e.g. 3px/ft) so the detail is readable, and let the container scroll.

For MVP, just auto-size the SVG height based on depth range with a minimum pixels-per-foot ratio. Don't implement pinch-zoom — keep it simple.

### Empty state

When there are fewer than 2 readings, show a centered message: "At least 2 readings needed for depth track"

## Wiring into App.tsx

In `App.tsx`, add the import and render the new tab:

```tsx
import { DepthTrackPlot } from './components/DepthTrackPlot';

// In the tab content area:
{activeTab === 'depthTrack' && (
  <DepthTrackPlot readings={readings} />
)}
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/DepthTrackPlot/DepthTrackPlot.tsx` | Main depth track component |
| `src/components/DepthTrackPlot/DepthTrackPlot.module.css` | Styles |
| `src/components/DepthTrackPlot/index.ts` | Barrel export |

## Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `'depthTrack'` to `TabId` union |
| `src/constants.ts` | Add depth track tab to `TABS` array |
| `src/App.tsx` | Import `DepthTrackPlot`, render in tab content |

## What NOT to change

- `src/components/YieldScatterPlot/` — scatter plot is correct
- `src/components/ReadingsTable/` — table is correct
- `src/effects/useReadings.ts` — readings logic is correct
- `src/effects/useRssMonitor.ts` — monitor is correct
- `src/calculations/` — math is correct

## Styling

- Match the existing dark theme: background #141414, grid lines #2a2a2a, axis lines #555
- Line colors as specified per track
- Use monospace font for all numeric values
- Track headers: uppercase labels, 10-11px, #888
- Depth labels: 11px monospace, #888
- Tooltip: same style as the scatter plot tooltip (dark background, white text, 12px)

## Build Verification

Run `yarn build` after all changes. Fix all errors.

## Definition of Done

- [ ] New "Depth Track" tab appears alongside "Readings" and "Yield Plot"
- [ ] 5 vertical tracks: Inclination, Azimuth, DLS, Duty Cycle, Toolface
- [ ] Depth axis runs top-to-bottom (drilling convention)
- [ ] RSS channels as solid lines, MWD channels as dashed lines
- [ ] DC% shown as filled area chart
- [ ] Each track auto-scales its x-axis to the data range
- [ ] Track headers show label and scale range
- [ ] Horizontal crosshair + tooltip on hover showing all values at that depth
- [ ] Section coloring (curve=amber, uturn=purple) as subtle background bands
- [ ] Scrollable if depth range is large
- [ ] Empty state for < 2 readings
- [ ] Matches existing dark theme
- [ ] **`yarn build` completes with ZERO errors**
