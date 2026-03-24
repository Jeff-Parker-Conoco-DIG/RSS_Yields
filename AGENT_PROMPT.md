# YieldTracker — Unified WITS Channel Resolution (Single Source of Truth)

Read this ENTIRE prompt before writing any code. Use skills: systematic-debugging, writing-plans, verification-before-completion, frontend-design

## Problem Statement

The app currently has **three disconnected systems** that reference WITS field names:

1. **Channel profiles** (`src/witsMapper/channelProfiles.ts`) — hardcoded field names per vendor (e.g. `rss_continuous_inclination`)
2. **`takeReading()`** in `useReadings.ts` — uses `resolveChannel(profile, 'nearBitInc')` to look up profile mappings
3. **Channel watcher** in `useReadings.ts` — **hardcodes** `rss_continuous_inclination` and `rss_continuous_azimuth` directly, completely bypassing the profile system

The **WitsMapperPanel** UI exists but is NOT wired into the app — it's never rendered. The user cannot change channel mappings at runtime.

If Corva renames a WITS field or a different rig uses different naming, the app breaks and requires a code change + redeployment. This is unacceptable for a tool used across rigs.

## Goal

Create a **single resolved channel map** that every part of the app reads from. The DD (directional driller) can change any mapping at runtime via dropdown menus populated with real channels discovered from the current well's WITS data. No code changes needed when field names differ.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Resolved Channel Map                    │
│  (React state in App.tsx, passed as prop)            │
│                                                      │
│  inc  → 'rss_continuous_inclination'                 │
│  az   → 'rss_continuous_azimuth'                     │
│  dc   → 'rsspsum'                                    │
│  tfSet → 'gravity_tool_face'                         │
│  ...etc                                              │
├─────────────┬──────────────┬────────────────────────┤
│  Seeded by: │  Modified by:│  Consumed by:           │
│  Vendor     │  User picks  │  • takeReading()        │
│  profile    │  new channel │  • Channel watcher      │
│  defaults   │  in dropdown │  • Table display        │
│             │              │  • Export                │
└─────────────┴──────────────┴────────────────────────┘
```

## Data Types

### New: `ResolvedChannelMap`

Create a new type in `src/witsMapper/types.ts`:

```typescript
/**
 * The resolved mapping from logical channel names to actual WITS field names.
 * This is the SINGLE SOURCE OF TRUTH that every part of the app reads from.
 * It starts as a copy of the active vendor profile's channels, then gets
 * overridden by user selections in the WITS Mapper panel.
 */
export interface ResolvedChannelMap {
  // Required channels
  nearBitInc: string;      // RSS continuous inclination (watched in Curve)
  nearBitAz: string;       // RSS continuous azimuth (watched in U-Turn)
  dutyCycle: string;       // Steering duty cycle 0-100%
  toolFaceSet: string;     // Commanded toolface direction
  toolFaceActual: string;  // Achieved toolface direction
  toolFaceStdDev: string;  // Toolface consistency
  steeringForce: string;   // RSS pad force or steering magnitude

  // Optional channels (empty string = not mapped)
  turbineRPM: string;
  peakLateral: string;
  hfto: string;
  bitRPM: string;
}
```

### New helper function in `src/witsMapper/channelProfiles.ts`:

```typescript
/**
 * Build a ResolvedChannelMap from a profile + user overrides.
 * This is the ONLY function that creates the resolved map.
 */
export function buildResolvedMap(
  profileId: string,
  overrides: Record<string, string> = {},
): ResolvedChannelMap {
  const profile = PROFILES[profileId] ?? GENERIC_PROFILE;
  return {
    nearBitInc: overrides.nearBitInc ?? profile.channels.nearBitInc,
    nearBitAz: overrides.nearBitAz ?? profile.channels.nearBitAz,
    dutyCycle: overrides.dutyCycle ?? profile.channels.dutyCycle,
    toolFaceSet: overrides.toolFaceSet ?? profile.channels.toolFaceSet,
    toolFaceActual: overrides.toolFaceActual ?? profile.channels.toolFaceActual,
    toolFaceStdDev: overrides.toolFaceStdDev ?? profile.channels.toolFaceStdDev,
    steeringForce: overrides.steeringForce ?? profile.channels.steeringForce,
    turbineRPM: overrides.turbineRPM ?? profile.channels.turbineRPM ?? '',
    peakLateral: overrides.peakLateral ?? profile.channels.peakLateral ?? '',
    hfto: overrides.hfto ?? profile.channels.hfto ?? '',
    bitRPM: overrides.bitRPM ?? profile.channels.bitRPM ?? '',
  };
}
```

## Implementation Steps

### Step 1: Add `ResolvedChannelMap` type and `buildResolvedMap` function

File: `src/witsMapper/types.ts` — add the `ResolvedChannelMap` interface
File: `src/witsMapper/channelProfiles.ts` — add `buildResolvedMap()` function
File: `src/witsMapper/index.ts` — export both new items

### Step 2: Create the resolved map in `App.tsx` and pass it down

In `App.tsx`, the `useSettings` hook already returns `profile`. Change the flow:

```typescript
// App.tsx
const { settings, profile } = useSettings(app?.settings ?? appSettings);

// Build the resolved channel map (single source of truth)
const resolvedMap = useMemo(
  () => buildResolvedMap(settings.activeProfile, settings.customChannelOverrides),
  [settings.activeProfile, settings.customChannelOverrides],
);

// Pass resolvedMap to useReadings instead of the full profile
const { readings, ... } = useReadings(assetId, trackingConfig, resolvedMap);
```

### Step 3: Refactor `useReadings.ts` to use `ResolvedChannelMap`

Change the signature:
```typescript
export function useReadings(
  assetId: number | undefined,
  config: TrackingConfig,
  channelMap: ResolvedChannelMap,  // was: channelProfile: WitsChannelProfile
): UseReadingsResult {
```

#### 3a: Refactor `takeReading()` to use the map directly

Replace the `resolveChannel()` calls with direct map lookups. The current code does:
```typescript
const getVal = (channelKey: keyof typeof channelProfile.channels): number | null => {
  const resolved = resolveChannel(channelProfile, channelKey);
  if (!resolved) return null;
  const key = resolved.field.replace('data.', '');
  const v = dataObj[key];
  ...
};
const inc = getVal('nearBitInc') ?? 0;
```

Replace with a simpler approach:
```typescript
const getVal = (fieldName: string): number | null => {
  if (!fieldName) return null;
  const v = dataObj[fieldName];
  if (v == null) return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
};

const channelMapRef = channelMapRefCurrent; // useRef tracking latest map
const inc = getVal(channelMapRef.nearBitInc) ?? 0;
const azRaw = channelMapRef.nearBitAz ? getVal(channelMapRef.nearBitAz) : null;
const az = azRaw ?? 0;
const dc = getVal(channelMapRef.dutyCycle);
const tfSet = getVal(channelMapRef.toolFaceSet);
const tfAct = getVal(channelMapRef.toolFaceActual);
const tfStd = getVal(channelMapRef.toolFaceStdDev);
const sf = getVal(channelMapRef.steeringForce);
```

You'll need a ref for the channelMap since takeReading is used inside timers:
```typescript
const channelMapRef = useRef(channelMap);
channelMapRef.current = channelMap;
```

#### 3b: Refactor the channel watcher to use the map

The watcher currently hardcodes:
```typescript
const watchChannel = config.section === 'uturn'
  ? 'rss_continuous_azimuth'
  : 'rss_continuous_inclination';
```

Replace with:
```typescript
const map = channelMapRef.current;
const watchChannel = config.section === 'uturn'
  ? map.nearBitAz
  : map.nearBitInc;
```

Now if the user changes the inc or az channel in the mapper panel, the watcher automatically picks it up on the next poll cycle (because channelMapRef.current always points to the latest resolved map).

### Step 4: Wire the WitsMapperPanel into the CUSTOM gear icon (NOT the Corva gear)

**IMPORTANT:** The Corva AppHeader already renders a built-in gear icon that opens the Corva app settings panel. DO NOT put the WitsMapperPanel in the Corva gear. Leave the Corva gear for default Corva app settings (unit system, DLS normalization, etc.).

The app already has a CUSTOM gear icon (⚙️) in the RssToolInfo header bar (top-right area near the version badge). This is the YieldTracker gear. The WitsMapperPanel should open when the user clicks THIS custom gear.

The `WitsMapperPanel` component already exists in `src/witsMapper/WitsMapperPanel.tsx` and has:
- Vendor profile selector dropdown
- "Detect Channels" button that calls `discoverWitsChannels`
- Per-channel dropdown menus populated with discovered channels (showing current value)
- Override tracking

In `App.tsx`:
1. Add a `showMapper` boolean state
2. The custom gear button (already in the RssToolInfo header or nearby) toggles `showMapper`
3. When `showMapper` is true, render the `WitsMapperPanel` as a collapsible panel between the RssToolInfo header and the ControlsBar
4. Pass the profile/override handlers so changes flow through settings → resolvedMap → everything
5. DO NOT touch the Corva AppHeader gear — leave it as-is

```typescript
const [showMapper, setShowMapper] = useState(false);

// Handler for when user changes the active profile in the mapper
const handleProfileChange = useCallback((profileId: string) => {
  // Update settings.activeProfile via local state
}, []);

// Handler for when user overrides a channel mapping
const handleOverrideChange = useCallback((overrides: Record<string, string>) => {
  // Update settings.customChannelOverrides via local state
}, []);
```

For MVP, store the active profile ID and custom overrides in React state within App.tsx. The Corva gear handles Corva-level settings (via `onSettingChange`). The custom gear handles YieldTracker-specific channel mapping (via local state + localStorage for persistence).

### Step 5: Remove `witsChannelMap.ts` indirection

The file `src/api/witsChannelMap.ts` with `resolveChannel()` and `resolveAllChannels()` is no longer needed since `useReadings` reads directly from the `ResolvedChannelMap`. Either:
- Delete the file entirely, OR
- Keep it but don't import it in useReadings

If any other file imports from it, update those imports. The `WitsMapperPanel` doesn't use it (it directly reads profile.channels).

### Step 6: Clean up unused vendor profiles

The current profiles include `bentmotor_curve` and `rss_curve` which were curve-only profiles (nearBitAz = ''). These can stay in the codebase but aren't needed for the two-section (Curve / U-Turn) model. Don't delete them — they might be useful later. Just make sure the mapper panel still lists them as options.

## File Changes Summary

| File | Action |
|------|--------|
| `src/witsMapper/types.ts` | ADD `ResolvedChannelMap` interface |
| `src/witsMapper/channelProfiles.ts` | ADD `buildResolvedMap()` function |
| `src/witsMapper/index.ts` | EXPORT new items |
| `src/App.tsx` | ADD `resolvedMap` via `buildResolvedMap()`, ADD `showMapper` state, RENDER `WitsMapperPanel`, PASS `resolvedMap` to `useReadings` |
| `src/effects/useReadings.ts` | CHANGE signature to accept `ResolvedChannelMap`, REFACTOR `takeReading()` to use direct map lookups, REFACTOR channel watcher to use map |
| `src/api/witsChannelMap.ts` | REMOVE imports from useReadings (file can remain for reference) |

## What NOT to change

- `src/api/corvaApi.ts` — the WITS fetch/merge logic is correct
- `src/witsMapper/WitsMapperPanel.tsx` — the UI component is already built correctly
- `src/calculations/surveyMath.ts` — rate calculations are correct
- `src/components/ReadingsTable/` — display is correct
- `src/components/ControlsBar/` — controls are correct
- `src/api/readingsApi.ts` — persistence layer is correct

## Build Verification

After EACH step, run `yarn build` to verify the production build compiles with zero errors. Do NOT use `yarn start` — the dev server is less strict. The production webpack build catches TypeScript errors that dev mode misses.

```bash
yarn build
```

If `yarn build` fails, fix ALL errors before moving to the next step. Common issues:
- Missing imports after refactoring
- Type mismatches when changing function signatures (e.g. `WitsChannelProfile` → `ResolvedChannelMap`)
- Unused imports left behind from removed code
- Optional chaining needed on fields that might be undefined

## Testing (after build passes)

1. `yarn build` exits with 0 errors
2. Run `yarn start` to verify on a live well (Nabors X04, asset_id 74307056)
3. Channel watcher uses `resolvedMap.nearBitInc` / `resolvedMap.nearBitAz` instead of hardcoded field names
4. Click settings gear → WitsMapperPanel opens
5. Click "Detect Channels" → dropdowns populate with real WITS field names
6. Each dropdown shows current value next to field name (e.g. `rss_continuous_inclination (89.26)`)
7. Change a mapping → watcher uses the new field on next poll
8. Manual Take Reading still works
9. Start/Stop auto-trigger still works
10. Console logs show which channel the watcher is using (from resolved map, not hardcoded)

## Definition of Done

- [ ] `ResolvedChannelMap` type exists and is exported
- [ ] `buildResolvedMap()` function creates the map from profile + overrides
- [ ] `App.tsx` creates the resolved map and passes it to `useReadings`
- [ ] `useReadings` accepts `ResolvedChannelMap` instead of `WitsChannelProfile`
- [ ] `takeReading()` reads field names from the resolved map, not via `resolveChannel()`
- [ ] Channel watcher reads watch channel from the resolved map, not hardcoded strings
- [ ] `WitsMapperPanel` is rendered in the UI (behind a settings toggle)
- [ ] User can change channel mappings via dropdown menus
- [ ] Channel discovery (Detect Channels) populates dropdowns with real WITS data
- [ ] Changing a mapping in the panel updates the watcher on next poll cycle
- [ ] **`yarn build` completes with ZERO errors**
- [ ] No references to hardcoded WITS field names remain in `useReadings.ts`
