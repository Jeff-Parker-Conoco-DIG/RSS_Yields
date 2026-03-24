# YieldTracker — Smart Manual Reading (Snapshot Last Change Point)

Read this entire prompt. Use skills: systematic-debugging, verification-before-completion

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`

## Problem

When the DD clicks "Take Reading", the app currently fetches `limit=1` from raw WITS — the most recent record. But WITS records stream every ~1 second, and the RSS tool (iCruise) only updates its inc/az channels every measurement cycle (every few seconds of drilling, roughly every 1-3 ft depending on ROP). Between measurement cycles, the same inc/az values repeat in WITS but the depth keeps advancing.

This means the "current" WITS record might show:
- depth = 18620.5 ft (current bit position)  
- rss_continuous_inclination = 90.12 (but this value was actually MEASURED at 18618.2 ft, 2.3 ft ago)

If you take a reading at 18620.5 with inc=90.12, you've paired a depth that's 2.3 ft ahead of where the tool actually measured. The yield calculation uses this depth for course length, so BR/TR/DLS are slightly wrong.

## Solution

When "Take Reading" is clicked, instead of grabbing the latest WITS record:

1. Fetch the last **N raw WITS records** (e.g. limit=50, sorted by timestamp descending)
2. Identify the **watched channel** based on section (curve → `nearBitInc`, uturn → `nearBitAz`) from the resolved channel map
3. Walk backwards through the records to find the **most recent record where the watched channel value CHANGED** compared to its successor (the record after it chronologically)
4. Snapshot THAT record — it has the depth where the tool actually measured

### Walk-back algorithm

Given records sorted newest-first: `[rec_0, rec_1, rec_2, ..., rec_49]`

```
rec_0.inc = 90.12   depth = 18620.5   ← current (stale inc)
rec_1.inc = 90.12   depth = 18620.1   ← same stale inc
rec_2.inc = 90.12   depth = 18619.7   ← same stale inc
rec_3.inc = 90.12   depth = 18619.2   ← same stale inc
rec_4.inc = 90.05   depth = 18618.2   ← DIFFERENT! This is where inc changed
rec_5.inc = 90.05   depth = 18617.8   ← previous stale value
```

The **change point** is rec_3 (the LAST record that has the current value 90.12, right after it changed from 90.05). Actually, we want rec_3 because that's the first time the NEW value appeared — that's the depth where the tool reported.

Wait, let me think about this more carefully:

- rec_4 has inc=90.05 (old value)
- rec_3 has inc=90.12 (new value — first appearance)
- rec_3.depth = 18619.2 is where the tool actually updated its measurement

So the algorithm is: **walk backwards until the watched channel value differs from rec_0's value. The record just BEFORE the change (still having rec_0's value) is the change point.**

```typescript
// records[0] is the newest record
const currentValue = Number(records[0].data[watchChannel]);
let changePointRecord = records[0]; // default to latest if no change found

for (let i = 1; i < records.length; i++) {
  const prevValue = Number(records[i].data[watchChannel]);
  if (Math.abs(prevValue - currentValue) > 0.001) {
    // records[i] has a DIFFERENT value — so records[i-1] is where the new value first appeared
    changePointRecord = records[i - 1];
    break;
  }
}
// Now changePointRecord has the depth where the watched channel first reported its current value
```

### What to snapshot

Use ALL channel values from `changePointRecord`, not just the watched channel. The depth, inc, az, DC, TF, etc. all come from that same record — they're the values at the moment the tool measured.

## Implementation

### Step 1: Add `fetchRecentWitsRecords` to `corvaApi.ts`

This is similar to `fetchLatestWitsRecord` but fetches N records from raw WITS only (not the merged multi-source approach — we need individual records to walk back through):

```typescript
/**
 * Fetch the N most recent raw WITS records for a well.
 * Used by "Take Reading" to find the last change point for the watched channel.
 * Returns records sorted by timestamp DESCENDING (newest first).
 */
export async function fetchRecentWitsRecords(
  assetId: number,
  limit: number = 50,
): Promise<Record<string, unknown>[]> {
  if (!corvaDataAPI) return [];
  try {
    const data = await corvaDataAPI.get(
      '/api/v1/data/corva/wits/',
      {
        query: JSON.stringify({ asset_id: assetId }),
        sort: JSON.stringify({ timestamp: -1 }),
        limit,
      },
    );
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch (e) {
    error('fetchRecentWitsRecords failed:', e);
    return [];
  }
}
```

### Step 2: Add `findChangePointRecord` utility in `useReadings.ts`

```typescript
/**
 * Walk backwards through raw WITS records to find the record where the
 * watched channel value FIRST appeared (the "change point").
 * 
 * records: sorted newest-first (timestamp descending)
 * watchField: the WITS field name to watch (e.g. 'rss_continuous_inclination')
 * 
 * Returns the record at the change point, or the latest record if no change found.
 */
function findChangePointRecord(
  records: Record<string, unknown>[],
  watchField: string,
): Record<string, unknown> {
  if (records.length === 0) return {};
  if (records.length === 1) return records[0];

  const newestData = (records[0].data ?? {}) as Record<string, unknown>;
  const currentValue = Number(newestData[watchField] ?? 0);

  for (let i = 1; i < records.length; i++) {
    const recData = (records[i].data ?? {}) as Record<string, unknown>;
    const prevValue = Number(recData[watchField] ?? 0);
    if (Math.abs(prevValue - currentValue) > 0.001) {
      // records[i] has a different value — records[i-1] is the change point
      log(`Change point found: ${watchField} changed at record ${i-1} (depth=${((records[i-1].data as any)?.bit_depth ?? '?')})`);
      return records[i - 1];
    }
  }

  // No change found in the window — use the latest record
  log(`No change point found in ${records.length} records for ${watchField} — using latest`);
  return records[0];
}
```

### Step 3: Modify `takeReading()` in `useReadings.ts`

Replace the current single-record fetch with the walk-back approach:

**Current:**
```typescript
const witsRecord = await fetchLatestWitsRecord(assetId);
const dataObj = (witsRecord.data ?? {}) as Record<string, unknown>;
```

**New:**
```typescript
// Determine which channel to watch based on section
const map = channelMapRef.current;
const cfg = configRef.current;
const watchField = cfg.section === 'uturn' ? map.nearBitAz : map.nearBitInc;

// For manual readings: fetch recent records and find the change point
// For auto readings: use the latest record (the watcher already triggered at the right moment)
let dataObj: Record<string, unknown>;
let witsRecord: Record<string, unknown> | null;

if (source === 'manual') {
  const records = await fetchRecentWitsRecords(assetId, 50);
  if (records.length === 0) {
    error('No WITS data available for snapshot');
    return;
  }
  const changePoint = findChangePointRecord(records, watchField);
  witsRecord = changePoint;
  dataObj = (changePoint.data ?? {}) as Record<string, unknown>;
  log(`Manual reading: walked back to change point for '${watchField}'`);
} else {
  // Auto reading — watcher already triggered at the right moment, use latest
  witsRecord = await fetchLatestWitsRecord(assetId);
  if (!witsRecord) {
    error('No WITS data available for snapshot');
    return;
  }
  dataObj = (witsRecord.data ?? {}) as Record<string, unknown>;
}
```

**IMPORTANT:** For `source === 'auto'`, keep using `fetchLatestWitsRecord` (the single merged record). The auto-trigger already fires at the moment the watcher detects a change, so the latest record IS the change point. Only manual readings need the walk-back because the DD might click the button at any time — possibly several feet after the last tool update.

### Step 4: Update the import in `useReadings.ts`

Add `fetchRecentWitsRecords` to the import from corvaApi:
```typescript
import { fetchLatestWitsRecord, fetchRecentWitsRecords } from '../api/corvaApi';
```

## What NOT to change

- The auto-trigger (channel watcher) — it already triggers at the right moment
- The rate calculations — they're correct once the depth is right  
- The channel map / profile system — already resolved
- The table display or export — already correct
- `fetchLatestWitsRecord` — still used by the auto-trigger and the poll loop

## Edge Cases

1. **No change found in 50 records** — use the latest record (same as current behavior). This happens when drilling has been on one measurement for a while (slow ROP or stuck pipe).

2. **Well not drilling** — all 50 records have the same depth and same values. `findChangePointRecord` returns the latest record. That's fine — the DD probably wants a snapshot of the current state.

3. **First reading** — no previous reading to compare rates against. Works the same as now — CL/BR/TR/DLS are null.

4. **Very fast ROP** — the change might be beyond 50 records back. That's unlikely (50 records at ~1/sec = 50 seconds of drilling, and the tool updates every few seconds), but if it happens, we fall back to the latest record.

## Console Logging

The DD should see in the console:
```
[YieldTracker] Manual reading: walked back to change point for 'rss_continuous_inclination'
[YieldTracker] Change point found: rss_continuous_inclination changed at record 4 (depth=18619.2)
[YieldTracker] Reading taken at 18619.2 ft — inc=90.12 az=208.45 (manual)
```

vs auto readings:
```
[YieldTracker] Watcher trigger: inc changed 90.0500→90.1200 at depth=18619.2 (CL=10.1ft)
[YieldTracker] Reading taken at 18619.2 ft — inc=90.12 az=208.45 (auto)
```

## Files to Modify

| File | Change |
|------|--------|
| `src/api/corvaApi.ts` | ADD `fetchRecentWitsRecords()` function |
| `src/effects/useReadings.ts` | ADD `findChangePointRecord()` utility, MODIFY `takeReading()` to use walk-back for manual readings |

## Build Verification

Run `yarn build` after all changes. Fix all errors before considering done.

## Definition of Done

- [ ] `fetchRecentWitsRecords` fetches last 50 raw WITS records sorted newest-first
- [ ] `findChangePointRecord` walks backwards to find where watched channel value changed
- [ ] Manual "Take Reading" uses the change point record (correct depth)
- [ ] Auto readings still use `fetchLatestWitsRecord` (unchanged behavior)
- [ ] Console logs show which record was selected and why
- [ ] The watched channel is determined by section + resolved channel map (not hardcoded)
- [ ] Edge case: no change found → falls back to latest record
- [ ] **`yarn build` completes with ZERO errors**
