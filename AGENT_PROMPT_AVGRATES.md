# YieldTracker — Average Rates From Depth (Popup Calculator)

Read this entire prompt. Use skills: frontend-design, systematic-debugging, verification-before-completion

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`

The DD wants to calculate the average BR/TR/DLS from a specific depth to the current depth (or to another depth). This helps them understand the overall steering trend over a section — e.g. "what's my average build rate from 18700 to here?"

## Goal

Add an **"Average From Depth"** popup/modal that:
1. Lets the DD enter a start depth (and optionally an end depth)
2. Filters the readings to those within the depth range
3. Calculates and displays the average RSS BR, RSS TR, RSS DLS, MWD BR, MWD TR, MWD DLS, DC%, and resultant TF over that range
4. Shows the number of readings included and the total course length

## UI

### Trigger

Add a small button in the ControlsBar (near the Take Reading button) or below the tab bar — labeled **"Avg Rates"** or **"Averages"** with a calculator icon. Clicking it opens a modal/popup overlay.

### Modal Layout

```
┌─────────────────────────────────────────────┐
│  Average Rates Calculator              [X]  │
│                                             │
│  From Depth: [18700___] ft                  │
│  To Depth:   [18992___] ft  (or leave empty │
│               for latest reading)           │
│                                             │
│  ─── Results (12 readings, 292.4 ft) ─────  │
│                                             │
│         RSS          MWD                    │
│  BR:    2.34         1.98    °/100ft        │
│  TR:    8.76         7.21    °/100ft        │
│  DLS:   9.07         7.48    °/100ft        │
│                                             │
│  Avg DC:     68.5%                          │
│  Avg TF Set: 74.2°                         │
│  Avg Res TF: 81.3°                         │
│  Total CL:   292.4 ft                       │
│  Readings:   12                             │
│                                             │
│           [Copy to Clipboard]               │
└─────────────────────────────────────────────┘
```

### Behavior

1. When the modal opens, pre-fill "From Depth" with the first reading's depth and "To Depth" with the last reading's depth (or leave "To Depth" empty to mean "latest")
2. As the DD changes either depth input, recalculate immediately (no submit button needed — reactive)
3. Filter readings where `reading.depth >= fromDepth && reading.depth <= toDepth`
4. Only include readings that have non-null rate values (skip the first reading which has no rates, skip readings where MWD rates are 0 due to no MWD update)
5. Display averages rounded to 2 decimal places

### Calculations

```typescript
// Filter readings in range
const inRange = readings.filter(r => r.depth >= fromDepth && r.depth <= toDepth);

// For averaging rates, skip readings with null rates (first reading, etc.)
const withRssRates = inRange.filter(r => r.br != null && r.dls != null);
const withMwdRates = inRange.filter(r => r.mwdBr != null && r.mwdDls != null && r.mwdDls !== 0);

// Simple arithmetic mean
const avgRssBr = mean(withRssRates.map(r => r.br!));
const avgRssTr = mean(withRssRates.map(r => r.tr ?? 0));
const avgRssDls = mean(withRssRates.map(r => r.dls!));

const avgMwdBr = mean(withMwdRates.map(r => r.mwdBr!));
const avgMwdTr = mean(withMwdRates.map(r => r.mwdTr ?? 0));
const avgMwdDls = mean(withMwdRates.map(r => r.mwdDls!));

const avgDc = mean(inRange.filter(r => r.dutyCycle != null).map(r => r.dutyCycle!));
const avgTfSet = circularMeanDeg(inRange.filter(r => r.toolFaceSet != null).map(r => r.toolFaceSet!));
const avgResTf = circularMeanDeg(withRssRates.filter(r => r.resultantTF != null).map(r => r.resultantTF!));

const totalCl = inRange.reduce((sum, r) => sum + (r.courseLength ?? 0), 0);

function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
```

**IMPORTANT:** Use `circularMeanDeg` from `src/calculations/surveyMath.ts` for toolface averaging — you can't just arithmetic-mean angles (350° and 10° would give 180° which is wrong).

### Copy to Clipboard

The "Copy to Clipboard" button copies a plain text summary:

```
YieldTracker Average Rates: 18700.0 - 18992.4 ft (12 readings, 292.4 ft)
RSS BR: 2.34  TR: 8.76  DLS: 9.07 °/100ft
MWD BR: 1.98  TR: 7.21  DLS: 7.48 °/100ft
Avg DC: 68.5%  TF Set: 74.2°  Res TF: 81.3°
```

## Implementation

### New component: `AverageRatesModal`

Create `src/components/AverageRatesModal/AverageRatesModal.tsx`:

```typescript
interface AverageRatesModalProps {
  readings: YieldReading[];
  onClose: () => void;
}
```

This is a React portal or a simple overlay div with `position: fixed`, centered on screen. Dark theme matching the app (#1e1e1e background, #333 border).

### Wire into App.tsx

Add state: `const [showAvgRates, setShowAvgRates] = useState(false);`

Add a button in the controls area or below the tab bar:
```tsx
<button onClick={() => setShowAvgRates(true)}>Avg Rates</button>
```

Render the modal when open:
```tsx
{showAvgRates && (
  <AverageRatesModal readings={readings} onClose={() => setShowAvgRates(false)} />
)}
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/AverageRatesModal/AverageRatesModal.tsx` | Modal component with depth inputs + calculated averages |
| `src/components/AverageRatesModal/AverageRatesModal.module.css` | Styles |
| `src/components/AverageRatesModal/index.ts` | Barrel export |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add state for modal visibility, add trigger button, render modal |

## Styling

- Modal overlay: semi-transparent black backdrop (#000 at 50% opacity)
- Modal box: #1e1e1e background, #444 border, border-radius 8px, max-width 420px, centered
- Close button [X] in top-right corner
- Depth inputs: same style as ControlsBar inputs (dark background, monospace font)
- Results section: two-column layout (RSS | MWD) with rate labels on the left
- Values in monospace bold, color-coded (green for values within normal range, or just white)
- Copy button: same style as other app buttons

## Build Verification

Run `yarn build` after all changes. Fix all errors.

## Definition of Done

- [ ] "Avg Rates" button visible in the UI
- [ ] Modal opens with From/To depth inputs
- [ ] Pre-fills with first/last reading depths
- [ ] Recalculates averages reactively as depths change
- [ ] Shows RSS BR/TR/DLS, MWD BR/TR/DLS, Avg DC, Avg TF Set, Avg Res TF
- [ ] Uses circularMeanDeg for toolface averaging
- [ ] Filters out zero-DLS MWD readings (no MWD update)
- [ ] Shows reading count and total course length
- [ ] Copy to Clipboard works with plain text summary
- [ ] Click outside modal or X button closes it
- [ ] Matches dark theme
- [ ] **`yarn build` completes with ZERO errors**
