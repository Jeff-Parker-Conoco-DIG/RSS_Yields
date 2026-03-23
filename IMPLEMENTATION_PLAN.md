# RSS Yields — Corva App Implementation Plan

**App Key:** `copca.rss-yields.ui`
**Segment:** drilling
**Scope:** Single-well, real-time RSS steering performance tracker with WITS channel mapping

---

## What This App Does

Compares **RSS near-bit surveys** (Inc/Az at RSS depth) against **MWD surveys** (Inc/Az at MWD depth) to calculate actual steering performance between stations. Supports both **Halliburton iCruise** and **SLB PowerDrive** via a configurable WITS channel mapper. Provides a survey comparison table, yield-vs-duty-cycle scatter plot, and historical cross-well comparison.

---

## Architecture Overview

```
src/
├── index.js                    # Corva entry: { component: App, settings: AppSettings }
├── App.tsx                     # Main app — tab host (Table | Scatter | History)
├── AppSettings.tsx             # Settings panel (WITS mapper config, units, display prefs)
├── types.ts                    # All TypeScript interfaces
├── constants.ts                # RSS vendor profiles, default channel maps, colors
├── custom.d.ts                 # CSS module declarations
│
├── api/
│   ├── corvaApi.ts             # Corva API wrappers (surveys, WITS, Cerebro, drillstrings)
│   └── witsChannelMap.ts       # WITS channel resolver — maps vendor-specific mnemonics
│
├── witsMapper/
│   ├── WitsMapperPanel.tsx     # UI for viewing/editing channel mappings per vendor
│   ├── WitsMapperPanel.module.css
│   ├── channelProfiles.ts      # Built-in profiles: iCruise, PowerDrive, generic
│   ├── types.ts                # WitsProfile, ChannelMapping interfaces
│   └── index.ts
│
├── calculations/
│   ├── surveyMath.ts           # BUR, TUR, DLS, minimum curvature, course length
│   ├── yieldCalc.ts            # RSS yield metrics, DC-to-DLS regression
│   └── stationPairing.ts       # Pairs RSS near-bit surveys with MWD survey stations
│
├── components/
│   ├── SurveyComparisonTable/
│   │   ├── SurveyComparisonTable.tsx    # Main spreadsheet-style table
│   │   ├── SurveyComparisonTable.module.css
│   │   ├── columnDefs.ts                # Column definitions matching the spreadsheet
│   │   └── index.ts
│   ├── YieldScatterPlot/
│   │   ├── YieldScatterPlot.tsx         # DLS vs Duty Cycle scatter with regression line
│   │   ├── YieldScatterPlot.module.css
│   │   └── index.ts
│   ├── HistoricalComparison/
│   │   ├── HistoricalComparison.tsx     # Cross-well RSS yield comparison
│   │   ├── HistoricalComparison.module.css
│   │   └── index.ts
│   ├── RssToolInfo/
│   │   ├── RssToolInfo.tsx              # Current RSS config summary card
│   │   └── index.ts
│   └── common/
│       ├── StatusBadge.tsx              # Good/Warning/Bad yield indicator
│       ├── RefreshButton.tsx            # Manual refresh trigger
│       └── ExportMenu.tsx              # Excel/PDF export
│
├── effects/
│   ├── useRssSurveyData.ts    # Core hook: fetches + pairs RSS vs MWD surveys
│   ├── useWitsRealtime.ts     # WebSocket subscription to WITS data
│   ├── useCerebroData.ts      # Halliburton Cerebro raw data hook
│   ├── useDrillstringInfo.ts  # Current BHA/RSS tool identification
│   ├── useHistoricalYields.ts # Cross-well historical data
│   └── useSettings.ts         # Persisted user preferences
│
├── reports/
│   ├── excelExport.ts         # xlsx-js-style export of survey table
│   └── pdfExport.ts           # jspdf summary report
│
├── utils/
│   ├── logger.ts              # Prefixed console logging
│   ├── unitConversion.ts      # ft↔m, °/100ft↔°/30m
│   └── formatting.ts          # Number formatting, angle display
│
└── test/
    ├── setup.ts
    ├── __mocks__/
    │   └── @corva/ui/clients.ts
    └── surveyMath.test.ts
```

---

## Phase 1: Project Scaffolding & Data Layer

### 1.1 — Scaffold the Corva app

Create the project at `/PycharmProjects/RSS_Yields/` using the standard Corva UI app structure cloned from BHA-Intelligence's config:

- `package.json` — same deps as BHA-Intelligence plus any new ones
- `config-overrides.js` — webpack config (copy from BHA-Intelligence)
- `tsconfig.json` — TypeScript config
- `manifest.json` — new app key, new dataset permissions
- `src/index.js` — standard Corva entry point
- `src/App.tsx` — skeleton with tab navigation
- `src/AppSettings.tsx` — settings with WITS mapper integration
- `src/types.ts`, `src/constants.ts`, `src/custom.d.ts`

### 1.2 — manifest.json datasets

```json
{
  "datasets": {
    "corva.data.actual_survey":                 { "permissions": ["read"] },
    "corva.data.drillstring":                   { "permissions": ["read"] },
    "corva.wits":                               { "permissions": ["read"] },
    "corva.wits.summary-1ft":                   { "permissions": ["read"] },
    "corva.drilling.halliburton.cerebro-raw":   { "permissions": ["read"] },
    "corva.directional.rotational-tendency":    { "permissions": ["read"] },
    "corva.directional.toolface.summary-1ft":   { "permissions": ["read"] },
    "corva.directional.slide-sheet":            { "permissions": ["read"] },
    "corva.directional.surveys":                { "permissions": ["read"] },
    "corva.data.well-sections":                 { "permissions": ["read"] }
  }
}
```

### 1.3 — API layer (`src/api/corvaApi.ts`)

Adapt the BHA-Intelligence pattern (dual client setup with standalone fallback). New fetch functions:

| Function | Dataset | Purpose |
|----------|---------|---------|
| `fetchAllSurveyStations(assetId)` | `corva/data.actual_survey` | All MWD survey stations for the well (not just latest) |
| `fetchWitsNearBitInc(assetId, depthRange)` | `corva/wits` or `corva/wits.summary-1ft` | Continuous inc/az at RSS depth |
| `fetchCerebroRaw(assetId, depthRange)` | `corva/drilling.halliburton.cerebro-raw` | iCruise duty cycle, TF set, near-bit inc/az |
| `fetchCurrentDrillstring(assetId)` | `corva/data.drillstring` | Active BHA — identify RSS tool type, bit-to-survey distance |
| `fetchSlideSheet(assetId)` | `corva/directional.slide-sheet` | Slide records with depths (for context) |
| `fetchDirectionalTendency(assetId)` | `corva/directional.rotational-tendency` | Pre-calculated build/turn rates |

---

## Phase 2: WITS Channel Mapper

This is the key differentiator — different RSS vendors use different WITS mnemonics for the same physical measurements.

### 2.1 — Channel profiles (`src/witsMapper/channelProfiles.ts`)

```typescript
export interface WitsChannelProfile {
  id: string;                    // 'icruise' | 'powerdrive' | 'custom'
  vendorName: string;            // 'Halliburton iCruise' | 'SLB PowerDrive'
  channels: {
    nearBitInc: string;          // WITS mnemonic for near-bit inclination
    nearBitAz: string;           // WITS mnemonic for near-bit azimuth
    dutyCycle: string;           // Steering duty cycle / proportion
    toolFaceSet: string;         // Commanded toolface
    toolFaceActual: string;      // Actual achieved toolface
    toolFaceStdDev: string;      // Toolface quality metric
    steeringForce: string;       // RSS-specific steering metric
    turbineRPM?: string;         // iCruise turbine RPM
    peakLateral?: string;        // Lateral vibration
    hfto?: string;               // High-frequency torsional oscillation
    bitRPM?: string;             // Near-bit RPM
  };
  dataSource: 'wits' | 'cerebro' | 'wits+cerebro';
}

// Built-in profiles
export const ICRUISE_PROFILE: WitsChannelProfile = {
  id: 'icruise',
  vendorName: 'Halliburton iCruise',
  channels: {
    nearBitInc:    'continuous_inclination',   // LINC2 in Pason
    nearBitAz:     'mwd_continuous_azimuth',   // LAZM2 in Pason
    dutyCycle:     'iCDutyCycle',              // From Cerebro
    toolFaceSet:   'iCTFSet',                 // From Cerebro
    toolFaceActual:'iCTFActual',              // From Cerebro
    toolFaceStdDev:'iCTFStdDev',             // From Cerebro
    steeringForce: 'iCSteerForce',           // From Cerebro
    turbineRPM:    'iCTurbRPM',              // From Cerebro
    peakLateral:   'iCPeakLateral',          // From Cerebro
    bitRPM:        'iCBitRPM',               // From Cerebro
  },
  dataSource: 'wits+cerebro',
};

export const POWERDRIVE_PROFILE: WitsChannelProfile = {
  id: 'powerdrive',
  vendorName: 'SLB PowerDrive',
  channels: {
    nearBitInc:     'continuous_inclination',  // May differ — user maps this
    nearBitAz:      'mwd_continuous_azimuth',
    dutyCycle:      'steering_ratio',          // SLB terminology
    toolFaceSet:    'toolface_setpoint',
    toolFaceActual: 'toolface_actual',
    toolFaceStdDev: 'toolface_stddev',
    steeringForce:  'steering_force',
  },
  dataSource: 'wits',
};
```

### 2.2 — WITS mapper UI (`src/witsMapper/WitsMapperPanel.tsx`)

Settings panel component where user can:
- Select active RSS vendor profile (dropdown)
- Override any channel mapping (text input per field)
- Save custom profiles to app settings
- "Auto-detect" button that queries WITS for a recent depth and shows which channels have data

### 2.3 — Channel resolver (`src/api/witsChannelMap.ts`)

Runtime resolver that takes the active profile and translates generic requests ("get me near-bit inc") into the correct dataset + field path. This sits between the hooks and the API layer.

```typescript
export function resolveChannel(
  profile: WitsChannelProfile,
  channel: keyof WitsChannelProfile['channels'],
): { dataset: string; field: string } | null {
  const mnemonic = profile.channels[channel];
  if (!mnemonic) return null;

  // Cerebro channels come from a different dataset
  if (mnemonic.startsWith('iC') && profile.dataSource.includes('cerebro')) {
    return {
      dataset: 'corva/drilling.halliburton.cerebro-raw',
      field: `data.${mnemonic}`,
    };
  }

  // Standard WITS channels
  return {
    dataset: 'corva/wits.summary-1ft',
    field: `data.${mnemonic}`,
  };
}
```

---

## Phase 3: Survey Math & Station Pairing

### 3.1 — Survey math (`src/calculations/surveyMath.ts`)

Pure functions, no side effects, fully unit-testable:

```typescript
/** Build rate in °/100ft */
export function buildRate(inc1: number, inc2: number, courseLengthFt: number): number;

/** Turn rate in °/100ft (handles azimuth wrapping at 0/360) */
export function turnRate(az1: number, az2: number, courseLengthFt: number): number;

/** Dogleg severity using minimum curvature method in °/100ft */
export function dls(inc1: number, inc2: number, az1: number, az2: number, courseLengthFt: number): number;

/** Course length between two stations */
export function courseLength(md1: number, md2: number): number;

/** Azimuth difference normalized to [-180, 180] */
export function azimuthDelta(az1: number, az2: number): number;
```

### 3.2 — Station pairing (`src/calculations/stationPairing.ts`)

The critical logic that matches RSS near-bit readings to MWD survey stations:

```typescript
export interface PairedStation {
  // MWD survey (from data.actual_survey)
  mwdDepth: number;
  mwdInc: number;
  mwdAz: number;

  // RSS near-bit survey (from WITS/Cerebro)
  rssDepth: number;
  rssInc: number;
  rssAz: number;

  // Calculated between this station and previous
  courseLength: number;
  mwdBUR: number;
  mwdTUR: number;
  mwdDLS: number;
  rssBUR: number;
  rssTUR: number;
  rssDLS: number;
  deltaInc: number;
  deltaAz: number;

  // Steering parameters (averaged over interval)
  avgDutyCycle: number | null;
  avgToolFaceSet: number | null;
  avgToolFaceActual: number | null;
  toolFaceStdDev: number | null;
  avgSteeringForce: number | null;

  // Metadata
  timestamp: number;
  bitToSurveyDistance: number;
}
```

Pairing algorithm:
1. Sort MWD stations by measured_depth ascending
2. For each consecutive pair of MWD stations, find the corresponding RSS readings within that depth interval
3. Use the RSS readings closest to the MWD survey depths (or interpolate)
4. Calculate BUR/TUR/DLS for both MWD and RSS station pairs
5. Average Cerebro/WITS steering parameters (DC, TF) over the interval between stations

### 3.3 — Yield calculations (`src/calculations/yieldCalc.ts`)

```typescript
/** DLS per % duty cycle — the tool's steering efficiency */
export function yieldPerDC(dls: number, dutyCycle: number): number;

/** Linear regression of DLS vs DC across all stations */
export function yieldRegression(stations: PairedStation[]): {
  slope: number;      // DLS per 1% DC
  intercept: number;  // Residual DLS at 0% DC (gravity/formation effect)
  rSquared: number;   // Fit quality
};

/** Motor contribution to BUR/TUR (if hybrid motor+RSS BHA) */
export function motorContribution(
  totalBUR: number, rssBUR: number,
  bendAngle: number, motorYield: number,
): { motorBUR: number; motorTUR: number };
```

---

## Phase 4: React Hooks (Data Layer)

### 4.1 — `useRssSurveyData` (core hook)

```typescript
interface UseRssSurveyDataResult {
  stations: PairedStation[];
  loading: boolean;
  error: string | null;
  rssToolName: string | null;
  bitToSurveyDistance: number | null;
  refresh: () => void;
}

function useRssSurveyData(
  assetId: number | undefined,
  channelProfile: WitsChannelProfile,
): UseRssSurveyDataResult;
```

Flow:
1. Fetch current drillstring → identify RSS component → get bit-to-survey distance
2. Fetch all MWD survey stations
3. Fetch WITS near-bit inc/az (using resolved channel names)
4. Fetch Cerebro data (if iCruise)
5. Run station pairing
6. Return paired stations

### 4.2 — `useWitsRealtime` (WebSocket)

Subscribes to `corva/wits` for the active asset. On new data:
- Extract near-bit inc/az from the incoming record (using active channel map)
- If new survey station detected (depth delta > threshold), trigger re-pair
- Update the latest partial station in real-time

```typescript
function useWitsRealtime(
  assetId: number | undefined,
  channelProfile: WitsChannelProfile,
  onNewData: (record: WitsRecord) => void,
): { connected: boolean; lastUpdate: number | null };
```

### 4.3 — `useCerebroData`

For iCruise: fetches Cerebro raw records over the current well's depth range. Returns duty cycle, toolface, steering force arrays indexed by depth.

### 4.4 — `useDrillstringInfo`

Fetches current drillstring, finds the RSS component, returns:
- RSS tool name/vendor
- Bit-to-survey distance
- Whether a motor is also present (hybrid BHA)
- Motor config (if hybrid)

### 4.5 — `useHistoricalYields`

For the History tab: takes a list of offset well asset IDs, runs the same survey fetch + pairing for each, returns aggregated yield curves for comparison.

---

## Phase 5: UI Components

### 5.1 — Survey Comparison Table

Columns matching your spreadsheet layout:

| Group | Columns |
|-------|---------|
| **Depth** | Bit Depth, C.L., RSS Depth, MWD Depth |
| **RSS Survey** | RSS-Inc, RSS-Az |
| **MWD Survey** | MWD-Inc, MWD-Az |
| **Calculated** | BUR, TUR, DLS (RSS), DLS (MWD) |
| **Deltas** | D-Inc, D-Az, M-BUR, M-TUR |
| **Steering** | DC (%), TF Set, TF Actual, TF StdDev |
| **Quality** | RSS vs MWD DLS delta, Yield (DLS/%DC) |

Features:
- Color coding: green when RSS-DLS ≈ MWD-DLS, red when divergent
- Sortable columns
- Sticky header
- Row highlight for latest station
- Inline sparklines for DC and TF over interval (stretch goal)

### 5.2 — Yield Scatter Plot

SVG scatter plot (custom, following BHA-Intelligence chart patterns):
- **X-axis:** Duty Cycle (%)
- **Y-axis:** DLS achieved (°/100ft)
- Each point = one survey interval
- Linear regression line overlaid
- R² annotation
- Color by: section, formation, or time
- Tooltip: station depth, DC, DLS, TF set
- Click-to-highlight corresponding table row

### 5.3 — Historical Comparison

- Dropdown: select offset wells (from Corva platform well list)
- Overlay yield curves from multiple wells
- Filter by RSS tool type, formation, section
- Box plot view: yield distribution per tool/vendor

### 5.4 — RSS Tool Info Card

Summary header card showing:
- Current RSS tool name, vendor, serial number
- Bit-to-survey distance
- Active channel profile
- Last survey depth/time
- WebSocket connection status indicator (pulse animation)

---

## Phase 6: App Settings

Via `AppSettings.tsx` + `useSettings` hook:

| Setting | Type | Default |
|---------|------|---------|
| `activeProfile` | string | `'icruise'` |
| `customChannelOverrides` | Record | `{}` |
| `unitSystem` | `'imperial' \| 'metric'` | `'imperial'` |
| `dlsNormalization` | `'per100ft' \| 'per30m'` | `'per100ft'` |
| `yieldDivergenceThreshold` | number | `0.5` (°/100ft) |
| `colorMode` | `'divergence' \| 'section' \| 'time'` | `'divergence'` |
| `showMotorContribution` | boolean | `true` |
| `historicalWellIds` | number[] | `[]` |

---

## Phase 7: Reports & Export

### Excel export (`src/reports/excelExport.ts`)
Using `xlsx-js-style` (already a dep in BHA-Intelligence):
- Full survey comparison table with conditional formatting
- Summary sheet with yield regression stats
- Chart-ready data layout

### PDF export (`src/reports/pdfExport.ts`)
Using `jspdf` + `jspdf-autotable`:
- One-page RSS yield summary
- Scatter plot rendered as embedded image (canvas → PNG)
- Table of top-10 and bottom-10 yield intervals

---

## Phase 8: Testing

### Unit tests (Jest + ts-jest)
- `surveyMath.test.ts` — BUR/TUR/DLS against hand-calculated values
- `stationPairing.test.ts` — pairing algorithm with mock data
- `yieldCalc.test.ts` — regression, yield-per-DC
- `witsChannelMap.test.ts` — profile resolution
- `channelProfiles.test.ts` — built-in profiles have all required fields

### Component tests (@testing-library/react)
- SurveyComparisonTable renders with mock stations
- YieldScatterPlot renders SVG elements
- WitsMapperPanel saves profile changes

---

## Build Order (Recommended Implementation Sequence)

| Step | What | Why First |
|------|------|-----------|
| **1** | Scaffold project, manifest, package.json, webpack | Everything depends on this |
| **2** | `types.ts` + `constants.ts` + `channelProfiles.ts` | Data shapes before code |
| **3** | `surveyMath.ts` + tests | Pure math, zero deps, validates correctness |
| **4** | `stationPairing.ts` + tests | Core algorithm, can test with mock data |
| **5** | `corvaApi.ts` fetch functions | Connect to real data |
| **6** | `witsChannelMap.ts` resolver | Bridges profiles to API calls |
| **7** | `useRssSurveyData` hook | Core data hook, ties everything together |
| **8** | `SurveyComparisonTable` component | Primary view, validates data layer |
| **9** | `useWitsRealtime` hook | Real-time updates |
| **10** | `YieldScatterPlot` component | Second view |
| **11** | `WitsMapperPanel` + `AppSettings.tsx` | User configuration |
| **12** | `useHistoricalYields` + `HistoricalComparison` | Third view |
| **13** | Excel/PDF export | Reports |
| **14** | Tests, build, deploy prep | Ship it |

---

## Key Decisions & Tradeoffs

1. **Single-well scope** — simpler data layer, avoids the batch/concurrency complexity of BHA-Intelligence. Can add multi-well later.

2. **WITS mapper as first-class module** — not an afterthought. The whole point is swapping between iCruise and PowerDrive without code changes.

3. **Custom SVG scatter plot** — follows BHA-Intelligence chart patterns rather than adding a charting library. Keeps bundle small, full control over dark theme styling.

4. **Cerebro as supplemental data source** — not all wells have Cerebro data. The app must degrade gracefully: if no Cerebro, use WITS continuous inc/az only and show "N/A" for duty cycle columns.

5. **Real-time via socketClient** — subscribe to `corva/wits` for the active asset. New WITS records trigger incremental station re-pairing rather than full refetch.

---

## Dependencies (New vs Borrowed)

| Package | Version | Source |
|---------|---------|--------|
| `react` | 17.0.1 | Same as BHA-Intelligence |
| `typescript` | 5.1 | Same |
| `@corva/ui` | (platform) | Same |
| `xlsx-js-style` | latest | Same |
| `jspdf` + `jspdf-autotable` | latest | Same |
| `@corva/dc-platform-shared` | (platform) | Same |

No new dependencies needed for v1.
