# YieldTracker — MWD Channels, iCruise Defaults Fix, Resultant TF Calculation

Read this entire prompt. Use skills: systematic-debugging, verification-before-completion, frontend-design

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`
All previous prompts (AGENT_PROMPT.md, AGENT_PROMPT_PERSIST.md, AGENT_PROMPT_SMARTSNAP.md, AGENT_PROMPT_MAPPER_UX.md) are complete.

## Changes Required (4 items)

---

### 1. Add MWD Continuous Inc/Az to the Table + Calculate MWD Rates

The table currently shows only RSS near-bit inc/az and calculates rates from those. We need to ALSO capture and display the MWD continuous inc/az and calculate separate rates from those values.

#### Why

The RSS inc/az comes from the near-bit sensor (~8ft from bit). The MWD inc/az comes from the MWD tool (~50-90ft from bit). Comparing RSS rates vs MWD rates shows the DD how much the wellbore has changed between the two measurement points — this is critical for understanding tool performance and hole condition.

#### Add MWD channels to the channel mapping

In `src/witsMapper/types.ts`, add to `ChannelMapping` and `ResolvedChannelMap`:

```typescript
// In ChannelMapping:
mwdInc: string;          // MWD continuous inclination
mwdAz: string;           // MWD continuous azimuth

// In ResolvedChannelMap:
mwdInc: string;
mwdAz: string;
```

Add these to `REQUIRED_CHANNELS` (or a new section) and `ALL_CHANNEL_KEYS`.

#### Set default values in iCruise profile

In `channelProfiles.ts`, the iCruise profile should map:
```typescript
mwdInc: 'continuous_inclination',     // MWD inc (NOT rss_continuous_inclination)
mwdAz: 'mwd_continuous_azimuth',      // MWD az (NOT rss_continuous_azimuth)
```

Also add these to `buildResolvedMap()`.

#### Add MWD fields to `YieldReading` type

In `src/types.ts`:
```typescript
export interface YieldReading {
  // ... existing fields ...
  
  // MWD survey snapshot (from MWD tool, ~50-90ft behind bit)
  mwdInc: number | null;
  mwdAz: number | null;
  
  // MWD rates — calculated from MWD inc/az between readings
  mwdBr: number | null;           // MWD build rate °/100ft
  mwdTr: number | null;           // MWD turn rate °/100ft
  mwdDls: number | null;          // MWD DLS °/100ft
}
```

#### Capture MWD values in `takeReading()`

In `useReadings.ts`, add extraction of MWD channels alongside the RSS channels:
```typescript
const mwdInc = getVal(map.mwdInc);
const mwdAz = getVal(map.mwdAz);
```

Calculate MWD rates from previous reading's MWD values:
```typescript
let mwdBr: number | null = null;
let mwdTr: number | null = null;
let mwdDls: number | null = null;

if (prev && cl != null && cl >= MIN_COURSE_LENGTH_FOR_RATES && mwdInc != null && prev.mwdInc != null) {
  mwdBr = buildRate(prev.mwdInc, mwdInc, cl);
  if (mwdAz != null && prev.mwdAz != null) {
    mwdTr = turnRate(prev.mwdAz, mwdAz, cl);
    mwdDls = dls(prev.mwdInc, mwdInc, prev.mwdAz, mwdAz, cl);
  }
}
```

#### Add MWD columns to the ReadingsTable

In `ReadingsTable.tsx`, add columns after the RSS Az column:

Table header order should be:
```
SEC | DEPTH | RSS INC | RSS AZ | MWD INC | MWD AZ | C.L. | BR | TR | DLS | MWD BR | MWD TR | MWD DLS | DC% | TF SET | TF ACT | RES TF | + note
```

The RSS columns show RSS near-bit values and RSS-derived rates (BR/TR/DLS).
The MWD columns show MWD values and MWD-derived rates (MWD BR/MWD TR/MWD DLS).

Style the MWD columns slightly differently (muted header color, e.g. #888 instead of #aaa) so they're visually distinct from the RSS primary columns.

---

### 2. Fix iCruise Default Channel Mappings

The current iCruise profile has incorrect mappings. Update `ICRUISE_PROFILE` in `channelProfiles.ts`:

```typescript
export const ICRUISE_PROFILE: WitsChannelProfile = {
  id: 'icruise',
  vendorName: 'Halliburton iCruise',
  channels: {
    nearBitInc: 'rss_continuous_inclination',  // RSS near-bit inc
    nearBitAz: 'rss_continuous_azimuth',       // RSS near-bit az
    mwdInc: 'continuous_inclination',           // MWD continuous inc
    mwdAz: 'mwd_continuous_azimuth',            // MWD continuous az
    dutyCycle: 'rsspsum',                       // RSS duty cycle (0-100)
    toolFaceSet: 'gravity_tool_face',           // Gravity toolface set
    toolFaceActual: 'gravity_tool_face',        // Gravity toolface actual (same channel on iCruise)
    steeringForce: 'rsspsum',                   // SAME as dutyCycle — on iCruise, steering force IS duty cycle
    turbineRPM: 'rsslowtorqrpm',               // RSS turbine RPM
    peakLateral: 'mwd_lateral_peak_shock',     // Lateral shock
    bitRPM: 'rotary_rpm',                       // Surface RPM
  },
  dataSource: 'wits',
};
```

**Key changes:**
- Added `mwdInc` and `mwdAz` 
- `steeringForce` now maps to `rsspsum` (same as dutyCycle) because on iCruise they are the same thing
- **REMOVED `toolFaceStdDev`** from the channel mapping entirely (see item 4 below)

---

### 3. Remove `toolFaceStdDev` from Channel Mapping

`toolFaceStdDev` should NOT be a WITS channel lookup. It was mapped to `rss_ssind` which is the wrong data. Instead, the resultant toolface should be CALCULATED from the RSS inc/az change.

#### Remove from types

In `src/witsMapper/types.ts`:
- Remove `toolFaceStdDev: string;` from `ChannelMapping`
- Remove `toolFaceStdDev: string;` from `ResolvedChannelMap`
- Remove `'toolFaceStdDev'` from `REQUIRED_CHANNELS`
- Remove `'toolFaceStdDev'` from `ALL_CHANNEL_KEYS`

#### Remove from all profiles

In `channelProfiles.ts`:
- Remove `toolFaceStdDev` from every profile's `channels` object
- Remove from `buildResolvedMap()`

#### Remove from WitsMapperPanel

The searchable dropdown row for "Toolface Std Dev" should no longer appear. Remove it from `CHANNEL_LABELS` and `CHANNEL_HINTS`.

#### Remove from `takeReading()`

Don't extract `tfStd` from WITS data. Remove: `const tfStd = getVal(map.toolFaceStdDev);`

---

### 4. Calculate Resultant Toolface from RSS Inc/Az Change

Instead of reading TF Std Dev from a WITS channel, CALCULATE the resultant (effective) toolface from the RSS inclination and azimuth changes over the course length. The function `effectiveToolface()` already exists in `src/calculations/surveyMath.ts`.

#### How it works

Given the RSS BR and TR between two readings, the resultant toolface tells you what direction the tool was ACTUALLY steering:
- `effectiveTF` = the direction of the actual curvature vector
- Compare this to `toolFaceSet` to see if the tool went where the DD told it to go

#### Replace `toolFaceStdDev` with `resultantTF` in `YieldReading`

In `src/types.ts`:
```typescript
export interface YieldReading {
  // ... existing fields ...
  
  // REMOVE: toolFaceStdDev: number | null;
  
  // ADD: Resultant toolface — calculated from RSS inc/az change, NOT a WITS channel
  resultantTF: number | null;       // Effective steering direction (degrees, 0=build, 90=right turn)
}
```

#### Calculate in `takeReading()`

After calculating BR and TR, compute the resultant TF:
```typescript
import { effectiveToolface } from '../calculations/surveyMath';

// After br_ and tr_ are calculated:
let resultTF: number | null = null;
if (br_ != null && tr_ != null) {
  const { effectiveTF } = effectiveToolface(br_, tr_, inc);
  resultTF = effectiveTF;
}
```

Store it in the reading:
```typescript
const reading: YieldReading = {
  // ...
  resultantTF: resultTF,  // was: toolFaceStdDev: tfStd
  // ...
};
```

#### Display in table

The column header changes from `TF STD` to `RES TF` (Resultant Toolface).

Format as degrees with 1 decimal: `fmt(r.resultantTF, 1)`

Color coding (optional but helpful):
- Compare `resultantTF` to `toolFaceSet`: if they differ by more than 30°, show in warning color (orange). If more than 60°, show in red. This tells the DD at a glance whether the tool is going where they told it to.

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/witsMapper/types.ts` | ADD `mwdInc`, `mwdAz` to `ChannelMapping` and `ResolvedChannelMap`. REMOVE `toolFaceStdDev` from both. Update `REQUIRED_CHANNELS` and `ALL_CHANNEL_KEYS`. |
| `src/witsMapper/channelProfiles.ts` | UPDATE all profiles: add `mwdInc`/`mwdAz`, remove `toolFaceStdDev`, fix iCruise `steeringForce` to `rsspsum`. UPDATE `buildResolvedMap()`. |
| `src/witsMapper/WitsMapperPanel.tsx` | Remove TF Std Dev row from channel labels/hints. Add MWD Inc / MWD Az rows. |
| `src/types.ts` | ADD `mwdInc`, `mwdAz`, `mwdBr`, `mwdTr`, `mwdDls` to `YieldReading`. REPLACE `toolFaceStdDev` with `resultantTF`. |
| `src/effects/useReadings.ts` | Extract MWD channels in `takeReading()`, calculate MWD rates, calculate `resultantTF` via `effectiveToolface()`. Remove `toolFaceStdDev` extraction. |
| `src/components/ReadingsTable/ReadingsTable.tsx` | ADD MWD INC, MWD AZ, MWD BR, MWD TR, MWD DLS columns. RENAME TF STD → RES TF. Update column order. |
| `src/witsMapper/index.ts` | Update exports if needed |
| `src/reports/excelExport.ts` | ADD MWD columns and resultantTF to Excel export |
| `src/reports/pdfExport.ts` | ADD MWD columns and resultantTF to PDF export |

## What NOT to change

- `src/api/corvaApi.ts` — WITS fetch logic is correct
- `src/calculations/surveyMath.ts` — `effectiveToolface` already exists, don't modify it
- `src/api/readingsApi.ts` — persistence layer is correct
- The channel watcher logic — it still watches RSS inc/az, not MWD
- The auto-trigger / persistence / smart-snap logic — all working

## Build Verification

Run `yarn build` after all changes. Fix all errors before considering done. Type errors are likely in:
- Any code that references `toolFaceStdDev` (search globally and update to `resultantTF`)
- `YieldReading` constructors that need the new MWD fields
- Export functions that need new columns
- Components that destructure YieldReading

## Definition of Done

- [ ] `mwdInc` and `mwdAz` channels added to types, profiles, and resolved map
- [ ] iCruise profile defaults: `mwdInc: 'continuous_inclination'`, `mwdAz: 'mwd_continuous_azimuth'`, `steeringForce: 'rsspsum'`
- [ ] `toolFaceStdDev` completely removed from channel mapping system
- [ ] `resultantTF` calculated via `effectiveToolface(br, tr, inc)` in `takeReading()`
- [ ] `YieldReading` has `mwdInc`, `mwdAz`, `mwdBr`, `mwdTr`, `mwdDls`, `resultantTF`
- [ ] ReadingsTable shows: SEC, DEPTH, RSS INC, RSS AZ, MWD INC, MWD AZ, C.L., BR, TR, DLS, MWD BR, MWD TR, MWD DLS, DC%, TF SET, TF ACT, RES TF, notes
- [ ] MWD rates calculated from MWD inc/az (not RSS inc/az)
- [ ] Excel and PDF exports include all new columns
- [ ] WitsMapperPanel shows MWD Inc and MWD Az channel rows, no TF Std Dev row
- [ ] **`yarn build` completes with ZERO errors**
