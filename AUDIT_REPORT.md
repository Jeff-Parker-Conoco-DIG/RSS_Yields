# RSS Yields — Project Audit Report

**Audited:** 2026-03-22
**Files reviewed:** 51 source files, all config files
**Verdict:** Solid foundation. ~12 issues found — mostly data layer bugs that would bite you when you connect to real Corva data. The math, WITS mapper, and UI structure are clean.

---

## CRITICAL (will break against live data)

### 1. `fetchAllSurveyStations` returns wrong data shape
**File:** `src/api/corvaApi.ts` line 64
**Issue:** `data.actual_survey` is a single document per well containing a `data.stations[]` array. Your query fetches the top-level documents, but `useRssSurveyData` then maps each doc as if it's a station record. You'll get 1 "station" per well instead of hundreds.

**Fix:** Either:
- (a) Use `data.stations` from the first returned document, or
- (b) Switch to the aggregate endpoint with `$unwind: '$data.stations'` and `$replaceRoot` like BHA-Intelligence does

### 2. `fetchCurrentDrillstring` uses wrong API host
**File:** `src/api/corvaApi.ts` line 143
**Issue:** Uses `corvaAPI` (api.corva.ai) with `/api/v1/data/corva/data.drillstring/` — but drillstrings at the Platform API use `/v1/data/corva/data.drillstring` (no `/api/v1/data/` prefix). The BHA-Intelligence pattern uses `corvaAPI.get('/v1/data/corva/data.drillstring', { aggregate: ... })`.

**Fix:** Change to `/v1/data/corva/data.drillstring` and use aggregate query, or switch to `corvaDataAPI` with the `/api/v1/data/` prefix.

### 3. `fetchCurrentDrillstring` filter logic — `status: 'active'` doesn't exist
**File:** `src/api/corvaApi.ts` line 146
**Issue:** Corva drillstrings don't have a `status: 'active'` field. The active drillstring is the one with the highest timestamp (most recent) and `data.planning !== true`. BHA-Intelligence fetches all and picks the latest non-planning one.

**Fix:** Remove the `status: 'active'` filter. Sort by `timestamp: -1`, limit 1, and filter out `data.planning: true`.

### 4. `useRssSurveyData` — MWD station extraction will fail
**File:** `src/effects/useRssSurveyData.ts` lines 45-50
**Issue:** Follows from bug #1. Tries to extract `measured_depth`, `inclination`, `azimuth` from each returned document, but `actual_survey` stores these inside `data.stations[]`. The mapping `(s.data as Record)?.measured_depth` won't find the fields at the top level.

**Fix:** After fixing `fetchAllSurveyStations`, extract stations from the first document's `data.stations` array.

### 5. `fetchWitsNearBitData` — `fields` parameter passed as single-element array
**File:** `src/effects/useRssSurveyData.ts` line 62
**Issue:** `fields` is joined into one string then wrapped in a single-element array: `[fields]`. But `fetchWitsNearBitData` expects `fields: string[]` and joins them with `,`. So you end up with `"data.continuous_inclination,data.mwd_continuous_azimuth,measured_depth,timestamp"` as a single array element, which then gets joined back to the same string. This works by accident but is fragile.

**Fix:** Pass the fields as separate array elements: `[incChannel.field, azChannel.field, 'measured_depth', 'timestamp']` without the inner `.join(',')`.

### 6. `useDrillstringInfo` — RSS detection looks at wrong fields
**File:** `src/effects/useDrillstringInfo.ts` lines 87-107
**Issue:** Checks `component_type` and `type` fields, but Corva drillstring components use `family` (e.g., `'rss'`) not `component_type`. The BHA-Intelligence `types.ts` shows `family: ComponentFamily` where `'rss'` is one of the options.

**Fix:** Check `comp.family === 'rss'` as the primary identifier, then fall back to name-based matching.

---

## MODERATE (will cause incorrect results or poor UX)

### 7. `stationPairing` — RSS depth offset is backwards
**File:** `src/calculations/stationPairing.ts` lines 118-119
**Issue:** `rssDepthPrev = prev.measured_depth - bitToSurveyDistance`. This assumes the RSS sensor is AHEAD of the MWD (closer to bit), which means the RSS depth is LESS than MWD depth by `bitToSurveyDistance`. However, `bit_to_survey_distance` on the MWD component measures bit-to-MWD-survey-sensor, not bit-to-RSS. The RSS sensor sits between the bit and the MWD, so the correct offset is `rssDepth = mwdDepth - (mwdB2S - rssB2S)` or simply using the RSS tool's own `bit_to_survey` value.

**Fix:** Need to fetch BOTH the MWD and RSS `bit_to_survey` values from the drillstring and use the difference.

### 8. `useWitsRealtime` — `onDataReceive` callback shape doesn't match Corva's socketClient
**File:** `src/effects/useWitsRealtime.ts` line 48
**Issue:** Corva's `socketClient.subscribe` passes `event: { data: Record[] }` — the records are inside `event.data`, not passed directly. Your handler receives `(data: unknown)` and treats it as the records directly.

**Fix:** Change to `onDataReceive: (event: { data: unknown[] }) => { const records = event.data; ... }`.

### 9. `useHistoricalYields` — no RSS data fetched for offset wells
**File:** `src/effects/useHistoricalYields.ts` line 51
**Issue:** Comment says "Simplified: no RSS readings for offset wells in v1 — just MWD". This means `yieldRegression` will always return `null` because it filters for `avgDutyCycle > 0` and all DC values will be null. The Historical tab will show 0 regression data for every well.

**Fix:** Either fetch WITS/Cerebro data for offset wells too, or change the regression to work on MWD-only DLS (which at least gives you the MWD yield curve), or clearly mark this as a placeholder in the UI.

### 10. `useHistoricalYields` — `wellIds.join(',')` in dependency array
**File:** `src/effects/useHistoricalYields.ts` line 82
**Issue:** Using `wellIds.join(',')` as a dependency is fragile — if the array reference changes but content is the same, it still re-runs. More importantly, if you meant to use it as a serialized key, it should be in a `useMemo` that memoizes the array first.

**Fix:** `JSON.stringify(wellIds)` is more robust, or memoize the IDs array upstream.

---

## MINOR (style, consistency, edge cases)

### 11. `AppProps` interface is too minimal
**File:** `src/types.ts` lines 2-8
**Issue:** Missing several standard Corva props that the platform passes: `currentUser`, `coordinates`, `segment`, `onSettingsChange`, `app`. The `company` field doesn't exist on Corva props — `company_id` comes from `currentUser.company_id`. Also `appSettings` should be `app.settings` per the Corva pattern.

**Fix:** Align with BHA-Intelligence's `AppProps` or at minimum add `currentUser`, `app`, `onSettingChange` (the standard Corva prop name).

### 12. Port 8080 conflict (your immediate error)
**File:** `package.json` scripts
**Issue:** `webpack-dev-server` defaults to port 8080, same as BHA-Intelligence.

**Fix:** Add `--port 8081` to the start script, or in `config-overrides.js` set `devServer.port: 8081`.

---

## WHAT'S DONE WELL

- **Survey math** — DLS formula uses proper minimum curvature method with azimuth wrapping and float clamping. Test coverage is thorough with edge cases.
- **WITS mapper architecture** — Clean separation of profiles, resolver, and UI. The override system works correctly. Tests cover all three profiles.
- **Station pairing algorithm** — Good design with configurable tolerance, course length minimum, and steering data averaging. Comprehensive test suite.
- **Yield regression** — Correct OLS implementation with R² calculation. Proper filtering of null/zero DC values.
- **CSS modules** — Consistent dark theme, proper sticky headers, monospace for numeric data.
- **Real-time hook** — Correct use of `useRef` for the callback to avoid stale closures. Proper cleanup.
- **Export functions** — Dynamic imports to avoid bundling xlsx/jspdf when not needed. Proper number formatting.
- **Barrel exports** — Clean index.ts files throughout.
- **Test setup** — Jest config properly mocks CSS modules, SVG, and Corva clients.

---

## RECOMMENDED FIX ORDER

1. **#1 + #4** — Fix survey station fetching (blocks all real data)
2. **#2 + #3 + #6** — Fix drillstring fetching (blocks RSS tool identification)
3. **#12** — Fix port conflict (blocks `yarn start`)
4. **#7** — Fix RSS depth offset calculation (affects accuracy)
5. **#8** — Fix WebSocket callback shape (blocks real-time)
6. **#11** — Fix AppProps interface (blocks Corva platform integration)
7. **#5** — Fix fields parameter passing
8. **#9 + #10** — Fix historical yields hook
