# Prompt: Build `yieldtracker-backfill` — Corva Backend App

> Hand this document to a coding agent verbatim. It is self-contained: the
> agent does not need any prior context from this conversation.

---

## Your task

Build a Python **Corva task app** named `yieldtracker-backfill` that
reprocesses an already-drilled (archived) well and populates the
`copca/yieldtracker.readings` dataset with one reading per survey station.

The companion frontend UI app — **YieldTracker** — already populates this
dataset in real-time while a well is being drilled. Your app brings
archived wells up to parity by replaying the same yield-calculation logic
offline.

## Access requirements

You need read access to the YieldTracker UI app source tree. The
authoritative reference files are:

| File                                       | What it owns                                              |
|--------------------------------------------|-----------------------------------------------------------|
| `docs/READINGS_SCHEMA.md`                  | **The exact wire schema** of records you write. Frozen.   |
| `docs/BACKEND_CLEANUP_APP_GUIDE.md`        | Manifest + handler convention you should mirror.          |
| `src/calculations/surveyMath.ts`           | Min-curvature DLS / BR / TR / TVD math. **Port, don't reinvent.** |
| `src/effects/useReadings.ts`               | The live reading-capture hook. Your output must match what this produces given the same inputs. |
| `src/api/readingsApi.ts`                   | `readingToData()` is the wire format. Match it field-for-field. |
| `src/utils/tvd.ts`                         | TVD interpolation from survey stations.                   |
| `src/utils/formations.ts`                  | Formation lookup with TVD fallback.                       |
| `src/constants.ts`                         | Thresholds like `DLS_OUTLIER_THRESHOLD = 30`.             |

You'll also need to locate — via grep, not assumption — these pieces
inside the UI repo:

- **Slide-sheet dedup** (3-pass: session-aggregates → twins → progress
  snapshots). Keyword: `dedupe` or `deduplicateSlideSheet`.
- **Motor yield formulas** (`sheetMotorYield`, `normalizedDls`). Keyword:
  `motorYield` / `normalizedDls`.

**Do not change any code in the UI repo.** Read only.

## Rules of engagement

1. **The schema is frozen.** Every record you write conforms to
   `docs/READINGS_SCHEMA.md`. If you find you "need" a new field,
   stop and escalate — schema changes require UI-side coordination.
2. **Port the TypeScript math; don't rewrite it.** The live app is
   battle-tested. Pull the exact formulas out of the `.ts` files and
   translate line-for-line to Python. Then verify with unit tests.
3. **Idempotent by construction.** Re-running on the same well must not
   create duplicates. Use a deterministic `data.id`.
4. **One well at a time.** This is a task app — the user passes an
   `asset_id` and you process that one well. Scheduler mode is out of
   scope for v1.
5. **Units**: everything is imperial and °/100 ft. Do not convert to
   meters or °/30 m. The frontend displays Corva API values raw.

## App type & manifest

Task app. `manifest.json`:

```jsonc
{
  "application": {
    "type": "task",
    "key": "copca.yieldtracker-backfill",
    "name": "YieldTracker Backfill",
    "visibility": "private",
    "segments": ["drilling"]
  },
  "settings": {
    "entrypoint": {
      "file": "src/handler.py",
      "function": "lambda_handler"
    },
    "runtime": "python3.11"
  },
  "datasets": {
    "corva.data.actual_survey":       { "permissions": ["read"] },
    "corva.data.well-sections":       { "permissions": ["read"] },
    "corva.directional.slide-sheet":  { "permissions": ["read"] },
    "corva.data.formations":          { "permissions": ["read"] },
    "corva.data.drillstring":         { "permissions": ["read"] },
    "corva.asset":                    { "permissions": ["read"] },
    "corva.wits":                     { "permissions": ["read"] },
    "copca.yieldtracker.readings":    { "permissions": ["read", "write"] }
  }
}
```

(Verify each dataset key against Corva's current catalog; names above are
the ones the UI app uses.)

## Task inputs

Accept via the task payload:

| Key         | Type                | Required | Notes                                       |
|-------------|---------------------|----------|---------------------------------------------|
| `asset_id`  | number              | yes      | The well to process.                        |
| `profile`   | string              | no       | `"rss_halliburton"`, `"rss_baker"`, `"motor"`, ... If omitted, auto-detect from BHA/drillstring; fall back to `"motor"`. |
| `force`     | bool                | no       | Default `false`. If `true`, overwrite existing readings via PATCH instead of skipping. |
| `md_from`   | number              | no       | **Override** auto-detected curve start. Restrict to stations with `md >= md_from`. |
| `md_to`     | number              | no       | **Override** auto-detected curve end. Restrict to stations with `md <= md_to`.     |

## Curve-only scope (hard requirement)

**This app only processes the build curve of each well** — the interval
from Kick-Off Point (KOP) to landing. It **must not** process:

- Vertical section (surface → KOP)
- Lateral section (landing → TD)
- **U-turn sections** (out of scope for v1; the UI supports them but the
  backfill does not — they will be addressed by a separate follow-up app)

### Curve boundary detection

Apply these in order and use the first one that succeeds:

1. **`corva/data.well-sections`** *(primary)*
   Query for `asset_id`. Find the section with `section_type == "curve"`
   (or equivalent — check the real enum values in Corva; may be `"Curve"`
   or `"BUILD"` depending on vendor). Take its MD range.
   - If multiple curve sections exist (rebuilds, multilateral), take the
     one covering the longest MD range. Log a warning with the others.
   - If a `"uturn"` section exists **inside** the curve range, **skip
     those stations** — don't process them.

2. **Inclination heuristic** *(fallback, only if well-sections returns
   nothing for this asset)*
   - **KOP** (curve start): first station where `inc > 3°` *and* the
     next 3 consecutive stations also have `inc > 3°` (ignore noisy
     singletons in the vertical).
   - **Landing** (curve end): first station where `inc >= 85°` *and* the
     next 3 consecutive stations stay within `inc ∈ [82°, 95°]` for at
     least 200 ft of MD (confirms we're in the lateral, not just a
     momentary touch of 85°).
   - Log: `"Curve detected by heuristic: KOP @ MD X ft, Landing @ MD Y ft"`.
   - If the heuristic can't find both boundaries, **fail the task** with
     a clear error — don't silently process the whole well.

3. **Manual override**
   If the caller passes `md_from` and/or `md_to`, those take precedence
   over ① and ② for that end of the range. Log both the detected and
   the override values so it's auditable.

### U-turn exclusion inside the curve

Per-station filter *after* curve boundaries are set: if a station falls
inside a `uturn` sub-section from `well-sections`, skip it and log
`"Skipped station @ MD X — inside u-turn (out of v1 scope)"`. Do not
write a reading for it.

## Processing algorithm

### 1. Fetch all inputs for the well

Page through:
- **`corva/data.well-sections`** — all sections for the asset. Used to
  determine the curve range and any embedded u-turn exclusions (see
  "Curve-only scope" above). Fetch this **first** so you know the MD
  window before fetching anything else.
- **`corva/data.actual_survey`** — stations within the curve range only
  (pass `query={"asset_id": N, "data.measured_depth": {"$gte": kop_md, "$lte": landing_md}}`).
  Sort by `md` ascending.
- **`corva/directional.slide-sheet`** — every entry. Apply the 3-pass
  dedup from the UI repo before using.
- **`corva/data.formations`** — formation tops. Keep both `md` and `td`
  fields; formations with `md=null` can still be matched by TVD.
- **`corva/asset`** or equivalent — to get `well_name`.
- **`corva/data.drillstring`** — to get MWD bit-to-survey distance and
  detect the BHA tool type.
- **Existing `copca/yieldtracker.readings` for this `asset_id`** — for
  idempotency checks.

Respect Corva API pagination (1000 records per call). Exponential-backoff
on HTTP 429.

### 2. Walk consecutive station pairs

For each `(prev, curr)` in the sorted station list (starting at index 1):

1. **Skip invalid or out-of-scope pairs**:
   - `curr.md <= prev.md` → skip, log warning.
   - Any of `{inc, az, md}` NaN or null → skip, log warning.
   - `curr` falls inside a u-turn sub-section → skip, log
     `"Skipped @ MD X — u-turn (out of v1 scope)"`.
   - `curr.md < kop_md` or `curr.md > landing_md` → skip silently (should
     not happen if the survey query was pre-filtered, but defend against it).
2. **Min-curvature interval** (port from `surveyMath.ts`):
   - `courseLength = curr.md - prev.md`
   - `dls, br, tr` from min-curvature `(prev.inc, prev.az) → (curr.inc, curr.az)`
   - `mwdDls, mwdBr, mwdTr` — if the profile is a motor, these are the
     same as `dls/br/tr`. If the profile is an RSS and the archived well
     has separate near-bit inc/az data, use that for `inc/az` and the MWD
     station for `mwdInc/mwdAz`; otherwise leave RSS-specific fields null.
3. **TVD**: `tvd = interpolateTvdAtMd(curr.md, stations, curr.inc, curr.az)`
   — port from `src/utils/tvd.ts`.
4. **Formation**: `getFormationAtDepth(curr.md, formations, tvd)` — port
   from `src/utils/formations.ts`. MD lookup first, TVD fallback for
   formations with `md=null`.
5. **Slide-sheet cross-reference** (over `[prev.md, curr.md]`):
   - `slideFt` = sum of slide footage inside interval
   - `rotateFt` = sum of rotate footage inside interval
   - `slideSeen` / `slideAhead` using MWD bit-to-survey distance from
     drillstring
   - `slideStartDepth`, `slideEndDepth` — boundaries of the active slide
     if one straddles `curr.md`
   - `dutyCycle`, `toolFaceSet`, `toolFaceActual` — footage-weighted
     averages from slide-sheet entries in interval
   - `tfAccuracy` — footage-weighted toolface accuracy
   - `sheetMotorYield`, `sheetBrYield`, `sheetTrYield` — weighted from
     slide-sheet `motor_yield` columns
6. **Normalized DLS** (per UI logic — verify by reading
   `src/effects/useReadings.ts`):
   ```
   factor = courseLength / slideSeen   (or similar — confirm in UI code)
   normalizedDls = dls * factor
   if abs(factor) > 5: normalizedDls = None   # sanity cap
   ```
   Split into `normalizedBr`, `normalizedTr` using the same ratio.
7. **Outlier flag**: `dls_outlier = abs(mwdDls if mwdDls is not None else dls) > 30`
8. **Steering back-calc** (port from UI):
   - `resultantTF` from BR/TR
   - `buildCommand = (dutyCycle/100) * cos(toolFace)`,
     `turnCommand = (dutyCycle/100) * sin(toolFace)`
9. **Emit one record** conforming to `READINGS_SCHEMA.md`:
   - Top level: `asset_id`, `timestamp` (unix **seconds** — prefer
     `curr.timestamp` if present, else derive from survey), `version: 1`,
     `data: { ... }`
   - `data.id` = `f"{asset_id}-{int(round(curr.md * 100))}"` (deterministic)
   - `data.well_name`, `data.well_asset_id`
   - `data.deleted_at = null`
   - `data.source = "backfill"` (new value in the existing enum —
     **document this in `READINGS_SCHEMA.md` if you add it**; or use
     `"auto"` if you'd rather not extend the enum)
   - All interval, slide, yield, steering, metadata fields computed above

### 3. Write to `copca/yieldtracker.readings`

For each generated record:

- Look up existing record by `data.id` (or by `(asset_id, data.depth)`
  fallback).
- If not found → `POST /api/v1/data/copca/yieldtracker.readings/`.
- If found and `force=true` → `PATCH` with the new `data` object.
- If found and `force=false` → skip.

Batch POSTs where the Corva API supports it (typically up to 1000 per
call).

## Idempotency contract

- Deterministic `data.id`: `f"{asset_id}-{int(round(md*100))}"`.
- Re-running with the same `asset_id` and `force=false` is a no-op
  (returns "all skipped").
- Re-running with `force=true` updates every record in place; does not
  create duplicates; does not change `_id`.

## Error handling

| Situation                                | Behavior                                             |
|------------------------------------------|------------------------------------------------------|
| Station missing inc/az/md                | Skip pair, log warning, continue.                    |
| No slide-sheet coverage for interval     | Emit reading with slide fields null or 0. Don't fail.|
| No formation match                       | `formation = null`.                                  |
| Drillstring dataset empty                | Default MWD bit-to-survey = 50 ft; log warning.      |
| Corva 429                                | Exponential backoff (1s, 2s, 4s, 8s, 16s).           |
| Corva 5xx                                | Retry up to 3×; then fail that record, keep going.   |
| Unrecoverable (e.g., 401)                | Fail the whole task; return error summary.           |

Never let one bad station kill the whole well. Collect per-station errors
and return them in the summary.

## Output contract

Return a JSON summary from the handler:

```json
{
  "asset_id": 15354502,
  "well_name": "MABEE DDA E29 412JH",
  "profile": "motor",
  "curve": {
    "source": "well-sections",        // or "heuristic" or "override"
    "kop_md": 8420.5,
    "landing_md": 10115.2,
    "uturn_exclusions": []             // MD ranges skipped
  },
  "stations_total": 847,               // all stations in well
  "stations_in_curve": 198,            // inside [kop, landing]
  "stations_processed": 196,           // minus invalids and u-turns
  "stations_skipped_uturn": 0,
  "readings_written": 180,
  "readings_updated": 16,
  "readings_skipped_existing": 0,
  "readings_failed": 2,
  "errors": [
    { "md": 9840.2, "reason": "null azimuth" },
    { "md": 10102.8, "reason": "POST 500 after 3 retries" }
  ]
}
```

## Testing

1. **Unit tests** for ported math. Use the same numerical fixtures as the
   TS side if the UI repo has them under `src/calculations/*.test.ts`; if
   not, pick 3–5 known survey pairs and hand-calculate the expected DLS /
   TVD.
2. **End-to-end smoke test**: pick a well that already has UI-generated
   readings (a recently-drilled well). Run the backfill with a different
   `asset_id` namespace or dry-run mode. Diff the output against the
   UI-generated records — they should match within numerical tolerance
   except where the UI has gaps from websocket dropouts.
3. **Idempotency test**: run twice with `force=false`; second run's
   `readings_written` should be 0.
4. **Local dev**: `pip install corva-sdk` then
   `python -m corva.testing.task src/handler.py` with a synthetic task
   payload.

## Deliverables

```
yieldtracker-backfill/
├── manifest.json
├── requirements.txt
├── README.md                  # how to deploy + invoke
├── src/
│   ├── handler.py             # @task entrypoint
│   ├── calc/
│   │   ├── survey_math.py     # ported from surveyMath.ts
│   │   ├── motor_yield.py     # ported yield formulas
│   │   ├── slide_sheet.py     # dedup + interval aggregation
│   │   ├── tvd.py             # ported from utils/tvd.ts
│   │   └── formations.py      # ported from utils/formations.ts
│   ├── fetch/
│   │   ├── surveys.py
│   │   ├── slide_sheet.py
│   │   ├── formations.py
│   │   └── drillstring.py
│   └── write/
│       └── readings.py        # POST/PATCH to copca/yieldtracker.readings
└── tests/
    ├── fixtures/              # real well data snapshots
    ├── test_survey_math.py
    ├── test_slide_sheet.py
    ├── test_idempotency.py
    └── test_end_to_end.py
```

## Non-goals

- ❌ Do **not** process vertical, lateral, or **u-turn** sections. Curve
  only for v1.
- ❌ Do **not** hard-delete records. That's the `yieldtracker-cleanup`
  app's job (see `docs/BACKEND_CLEANUP_APP_GUIDE.md`).
- ❌ Do **not** modify the frontend UI app.
- ❌ Do **not** invent new schema fields without updating
  `docs/READINGS_SCHEMA.md` and getting sign-off.
- ❌ Do **not** implement scheduler mode yet. Task only.
- ❌ Do **not** convert units. Imperial and °/100 ft throughout.

## Acceptance criteria

A human reviewer will:

1. Run your app against a known archived well that has a curve section.
2. Open the YieldTracker UI on that same well.
3. Confirm every curve-section survey station shows up as a reading with
   sensible DLS, TVD, formation, slide footage, and motor yield — and
   that **no readings appear for vertical, lateral, or u-turn stations**.
4. Run on a well that has **no `well-sections` data** — heuristic
   fallback should detect the curve boundaries; verify the logged
   `kop_md` / `landing_md` are within ±50 ft of the true boundaries.
5. Run your app a second time with `force=false` and confirm zero new
   records are created.
6. Compare 10 random curve-section readings against the UI's
   live-captured readings on a *different* well — values for any station
   captured by both paths must agree to within 0.01° or 0.1 ft.

## Questions you should ask before coding

If any of the following is unclear in the UI repo, stop and ask the
owner before guessing:

- Exact formula for `normalizedDls` / `sheetMotorYield` (these have
  evolved; read the latest `useReadings.ts`, don't rely on this doc).
- Slide-sheet dedup edge cases — what counts as a "twin" vs a legitimate
  separate slide.
- How the UI resolves `profile` when the BHA is ambiguous.
- Whether `source = "backfill"` is acceptable or should be `"auto"`.
