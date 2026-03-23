# RSS Yields v2 — Implementation Plan

**App Key:** `copca.rss-yields.ui`  
**Segment:** drilling  
**Core Concept:** User-controlled, interval-based, live RSS steering performance tracker

---

## What This App Does (v2)

The DD sets a start depth and section, configures an interval mode, and the app
builds a tracking table row-by-row as the well drills. Each row is a "snapshot"
of the WITS channels at that depth — inclination, azimuth, duty cycle, toolface —
with BR/TR/DLS calculated from the previous row.

The DD owns the table: they can add notes, delete bad rows, and manually trigger
readings at any time. All data persists to a Corva dataset so it survives reloads
and is visible to all users on the well.

---

## Architecture Overview

```
src/
├── index.js                    # Corva entry: { component: App, settings: AppSettings }
├── App.tsx                     # Main app — Controls bar + Table + Scatter tabs
├── AppSettings.tsx             # Settings panel (WITS mapper, units, display prefs)
├── types.ts                    # All TypeScript interfaces
├── constants.ts                # Section options, default settings, colors
├── custom.d.ts                 # CSS module declarations
│
├── api/
│   ├── corvaApi.ts             # Corva API wrappers (WITS, surveys, drillstrings)
│   ├── readingsApi.ts          # CRUD for copca.rss-yields.readings dataset
│   └── witsChannelMap.ts       # WITS channel resolver
│
├── witsMapper/                 # (unchanged from v1)
│
├── calculations/
│   ├── surveyMath.ts           # BR, TR, DLS, circular mean, toolface decomposition
│   └── yieldCalc.ts            # Yield regression across readings
│
├── components/
│   ├── ControlsBar/            # Start depth, section, interval mode, triggers
│   ├── ReadingsTable/          # Main table with editable notes, delete, highlight
│   ├── YieldScatterPlot/       # DLS vs DC% scatter with regression
│   ├── RssToolInfo/            # RSS tool header card
│   └── common/                 # RefreshButton, ExportMenu
│
├── effects/
│   ├── useReadings.ts          # Core hook: CRUD, auto-trigger, snapshot logic
│   ├── useWitsSnapshot.ts      # Takes a single WITS reading at current depth
│   ├── useWitsRealtime.ts      # WebSocket for depth tracking
│   ├── useDrillstringInfo.ts   # RSS tool identification
│   └── useSettings.ts          # Persisted user preferences
│
├── reports/
│   ├── excelExport.ts
│   └── pdfExport.ts
│
└── utils/
    ├── logger.ts
    ├── unitConversion.ts
    └── formatting.ts
```

---

## Data Model

### YieldReading — One row in the table

```typescript
interface YieldReading {
  id: string;                     // UUID for this reading
  assetId: number;                // Well asset ID
  depth: number;                  // Bit depth at time of reading
  inc: number;                    // Inclination from WITS (degrees)
  az: number;                     // Azimuth from WITS (degrees)
  courseLength: number | null;     // Distance from prev reading (ft)
  br: number | null;              // Build rate °/100ft
  tr: number | null;              // Turn rate °/100ft
  dls: number | null;             // DLS °/100ft
  dutyCycle: number | null;       // 0-100%
  toolFaceSet: number | null;     // Degrees (gravity TF)
  toolFaceActual: number | null;  // Degrees
  toolFaceStdDev: number | null;  // Degrees
  steeringForce: number | null;
  buildCommand: number | null;    // (DC/100) × cos(TF)
  turnCommand: number | null;     // (DC/100) × sin(TF)
  notes: string;                  // DD's notes for this row
  section: string;                // 'curve' | 'lateral' | 'vertical' | 'tangent'
  timestamp: number;              // When reading was taken
  source: 'auto' | 'manual';     // How triggered
}
```

### Corva Dataset: `copca.rss-yields.readings`

One document per reading per well, persists across reloads, shared across users.

---

## Controls Bar

Start Depth input, Section dropdown, Interval Mode selector (Depth/Time/Manual),
Interval Value input, Start/Stop toggle, Take Reading button, Export menu.

---

## Snapshot Flow

1. Read current bit depth from WITS
2. Read inc/az from mapped WITS channels
3. Read steering params (DC, TF) from WITS/Cerebro
4. If NOT first reading: calc BR/TR/DLS from previous row
5. Create YieldReading record
6. POST to Corva dataset
7. Update local state (table updates immediately)

---

## Auto-Trigger Engine

- **Depth-based:** WITS WebSocket tracks bit depth → trigger when depth >= last + interval
- **Time-based:** setInterval → trigger if depth has advanced
- **Manual:** DD clicks button at connections

---

## Table Features

- Scrollable with sticky headers
- Editable notes (inline text input)
- Delete row (X button → confirm → remove from dataset)
- Latest row highlighted
- First row has no BR/TR/DLS
- Color coding by rate magnitude
- Section badge per row

---

## Key Differences from v1

| v1 | v2 |
|----|----|
| Fetches ALL MWD surveys | DD controls when readings happen |
| Pairs RSS near-bit with MWD | Single WITS source at each depth |
| Read-only table | Editable notes, deletable rows |
| No persistence | Saves to Corva dataset |
| Complex station pairing | Simple: prev row → current row |
| Automatic everything | DD-controlled with auto/manual modes |
