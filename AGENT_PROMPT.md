# YieldTracker — Inc-Watcher Auto-Trigger Logic

Read this entire prompt. Use skills: systematic-debugging, verification-before-completion

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`
The app currently auto-triggers readings based on DEPTH: it polls WITS every 5 seconds and takes a reading when `bit_depth >= lastReading.depth + intervalValue`.

## The Change

Replace depth-based auto-trigger with an **RSS Inc watcher**. The new logic:

1. Poll WITS every 5 seconds (same as now)
2. Track the LAST SEEN `rss_continuous_inclination` value
3. When `rss_continuous_inclination` changes (differs from last seen by > 0.001°), AND the depth has advanced at least `intervalValue` feet from the last READING — take a reading
4. The reading captures inc, az, depth, etc. at the moment the inc updated — this is the "true" yield point

### Why This Matters

The RSS continuous inclination (`rss_continuous_inclination` in raw WITS) only updates when the iCruise tool completes a measurement cycle. Between updates, the value is stale (same number repeated). By watching for the inc to CHANGE, we snap the reading at the exact depth where the tool actually measured — giving a truer course length and therefore truer BR/TR/DLS.

With pure depth-based triggering, you might take a reading at 17650 ft but the inc value at that depth might actually be the same stale value from 17645 ft because the tool hasn't updated yet. The yield would be wrong because you'd be calculating rate-of-change using an inc that belongs to a different depth.

### Implementation

In `src/effects/useReadings.ts`, the depth-based auto-trigger effect currently looks something like:

```typescript
// Depth-based auto-trigger
useEffect(() => {
  if (!assetId || !config.isRunning || config.intervalMode !== 'depth') return;
  const interval = setInterval(async () => {
    const witsRecord = await fetchLatestWitsRecord(assetId);
    // ... extract depth
    // ... check if depth >= lastReading.depth + intervalValue
    // ... if so, takeReading('auto')
  }, 5000);
  return () => clearInterval(interval);
}, [deps]);
```

Replace with:

```typescript
// ─── Inc-watcher auto-trigger ──────────────────────────────────
// Watches rss_continuous_inclination for changes. When the RSS tool
// reports a new inc AND we've drilled at least intervalValue feet
// since the last reading, take a snapshot. This gives a "true" yield
// because the reading is anchored to the tool's measurement cycle.

const lastSeenIncRef = useRef<number | null>(null);

useEffect(() => {
  if (!assetId || !config.isRunning || config.intervalMode !== 'depth') return;

  const timer = setInterval(async () => {
    try {
      const witsRecord = await fetchLatestWitsRecord(assetId);
      if (!witsRecord) return;
      const dataObj = (witsRecord.data ?? {}) as Record<string, unknown>;
      
      // Get current depth and RSS inc
      const depth = Number(dataObj.bit_depth ?? dataObj.hole_depth ?? 0);
      const rssInc = Number(dataObj.rss_continuous_inclination ?? dataObj.continuous_inclination ?? 0);
      
      if (depth <= 0) return;
      setCurrentBitDepth(depth);

      const cfg = configRef.current;
      if (depth < cfg.startDepth) return;
      if (cfg.stopDepth && depth > cfg.stopDepth) return;

      const lastReading = readingsRef.current[readingsRef.current.length - 1];
      const lastDepth = lastReading?.depth ?? cfg.startDepth;
      const lastSeenInc = lastSeenIncRef.current;

      // Check if inc has changed (tool reported a new measurement)
      const incChanged = lastSeenInc !== null && Math.abs(rssInc - lastSeenInc) > 0.001;
      
      // Update the last seen inc
      lastSeenIncRef.current = rssInc;

      // Take reading when: inc changed AND drilled enough footage
      if (incChanged && depth >= lastDepth + cfg.intervalValue) {
        log(`Inc-watcher trigger: inc changed ${lastSeenInc?.toFixed(4)}→${rssInc.toFixed(4)} at depth=${depth.toFixed(1)} (interval=${cfg.intervalValue}ft)`);
        await takeReading('auto');
      }
    } catch (e) {
      // Silently retry on next interval
    }
  }, 5000);

  return () => clearInterval(timer);
}, [assetId, config.isRunning, config.intervalMode, config.intervalValue, config.startDepth, config.stopDepth, takeReading]);
```

### Key Details

1. `lastSeenIncRef` is a `useRef<number | null>` that tracks the most recent inc value we've seen from WITS
2. On every poll, we compare current inc to lastSeenInc — if it changed by more than 0.001° (noise floor), that means the tool reported a new measurement
3. We ALSO require `depth >= lastDepth + intervalValue` so we don't take readings too frequently when inc jitters at short intervals
4. The reading is taken RIGHT when the inc changes — so the depth captured is the depth at which the tool measured
5. After taking a reading, `lastSeenIncRef` continues tracking so the next inc change will trigger the next reading

### First Reading Handling

When `lastSeenIncRef.current` is null (first poll after Start), we just record the current inc without triggering. The first reading should still come from the manual "Take Reading" button or after the first inc change + interval threshold is met.

### Time-based mode

Keep the existing time-based auto-trigger unchanged — it's independent and doesn't need the inc watcher.

### Manual Take Reading

Manual readings should work exactly as before — user clicks, it grabs current WITS snapshot regardless of inc changes.

### Also: Change interval label

Since we're watching inc changes rather than pure depth, the interval still means "minimum feet between readings" but the trigger is the inc change. Consider updating the UI label from "ft (depth)" to "ft (min spacing)" or keep it as-is since the DD understands the concept.

## What NOT to change

- The `takeReading` function itself — it already grabs all channels correctly
- The channel profile mapping — already working
- The rate calculations (BR/TR/DLS) — already correct
- The ReadingsTable display — already correct

## Files to Modify

| File | Change |
|------|--------|
| `src/effects/useReadings.ts` | Replace depth-based auto-trigger with inc-watcher logic |

## Testing

1. `yarn start` compiles clean
2. Load on Nabors X04
3. Set interval to 10 ft, click Start
4. Watch console — should see `Inc-watcher trigger: inc changed X.XXXX→X.XXXX at depth=XXXXX.X` when readings are taken
5. Readings should appear in the table with real data at the depths where inc actually changed
6. Course lengths should be close to (but not exactly) the interval value — they'll be wherever the tool happened to update

## Definition of Done

- [ ] Inc-watcher auto-trigger replaces depth-based trigger
- [ ] `lastSeenIncRef` tracks RSS inc across polls
- [ ] Readings trigger when inc changes AND depth >= lastDepth + interval
- [ ] Console logs show inc change detection
- [ ] Manual Take Reading still works independently
- [ ] Time-based mode still works independently
- [ ] `yarn start` compiles clean
