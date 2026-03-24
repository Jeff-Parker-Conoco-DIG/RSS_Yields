# YieldTracker — Persist Tracking State + Auto-Stop Timer

Read this entire prompt. Use skills: systematic-debugging, verification-before-completion

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`

Currently when the user refreshes the Corva page, all tracking state resets — isRunning goes back to false, start depth goes to 0, interval resets. The user has to reconfigure and click Start again. On a 14-day hitch monitoring a well 24/7, this is annoying.

## Feature 1: Persist Tracking Config Through Refresh

### What to persist

Save the entire `TrackingConfig` to localStorage whenever it changes. On mount, restore it.

The key should include the asset_id so different wells don't share config:
```typescript
const STORAGE_KEY = `yieldtracker_config_${assetId}`;
```

### Implementation

In `App.tsx`, change the tracking config state initialization:

```typescript
// Instead of:
const [trackingConfig, setTrackingConfig] = useState<TrackingConfig>(DEFAULT_TRACKING);

// Do:
const [trackingConfig, setTrackingConfig] = useState<TrackingConfig>(() => {
  if (!assetId) return DEFAULT_TRACKING;
  try {
    const saved = localStorage.getItem(`yieldtracker_config_${assetId}`);
    if (saved) {
      const parsed = JSON.parse(saved) as TrackingConfig;
      // Restore isRunning so auto-trigger resumes after refresh
      return parsed;
    }
  } catch { /* ignore parse errors */ }
  return DEFAULT_TRACKING;
});

// Save to localStorage whenever config changes
useEffect(() => {
  if (!assetId) return;
  try {
    localStorage.setItem(`yieldtracker_config_${assetId}`, JSON.stringify(trackingConfig));
  } catch { /* ignore quota errors */ }
}, [assetId, trackingConfig]);
```

### What this means for the user

- Set start depth to 18599, section to U-Turn, interval to 5 ft, click Start
- Refresh the page (or Corva reloads the app)
- Config restores: start depth 18599, U-Turn, 5 ft, isRunning = true
- The channel watcher immediately resumes polling
- Readings from before the refresh are still in local state (loaded from dataset if persisted, or lost if dataset isn't registered yet — that's a separate issue)

### Also persist readings in localStorage

Since the `copca.yieldtracker.readings` dataset isn't registered yet, readings are only in React state and lost on refresh. As a fallback, also persist readings to localStorage:

```typescript
const READINGS_KEY = `yieldtracker_readings_${assetId}`;

// In useReadings.ts, after setReadings:
useEffect(() => {
  if (!assetId || readings.length === 0) return;
  try {
    localStorage.setItem(`yieldtracker_readings_${assetId}`, JSON.stringify(readings));
  } catch { /* quota */ }
}, [assetId, readings]);

// On mount, load from localStorage as fallback if dataset fetch returns 0:
// In the load effect, after fetching from dataset:
if (data.length === 0) {
  try {
    const cached = localStorage.getItem(`yieldtracker_readings_${assetId}`);
    if (cached) {
      const parsed = JSON.parse(cached) as YieldReading[];
      setReadings(parsed);
      log(`Restored ${parsed.length} readings from localStorage`);
    }
  } catch { /* ignore */ }
}
```

## Feature 2: Auto-Stop Timer

### UX Concept

Add a "Stop After" field next to the Stop button. The user can set:
- A duration in **hours** (e.g. "Stop after 4 hours")
- OR leave it blank for manual stop only

When the timer expires, `isRunning` is set to false automatically.

### Implementation

#### Add to TrackingConfig type (`src/types.ts`):

```typescript
export interface TrackingConfig {
  startDepth: number;
  stopDepth: number | null;
  section: WellSection;
  intervalMode: IntervalMode;
  intervalValue: number;
  isRunning: boolean;
  // NEW: auto-stop timer
  autoStopHours: number | null;  // null = no auto-stop
  startedAt: number | null;      // timestamp when Start was clicked (for timer calculation)
}
```

#### Update DEFAULT_TRACKING (`src/constants.ts`):

```typescript
export const DEFAULT_TRACKING: TrackingConfig = {
  startDepth: 0,
  stopDepth: null,
  section: 'curve',
  intervalMode: 'depth',
  intervalValue: 90,
  isRunning: false,
  autoStopHours: null,
  startedAt: null,
};
```

#### Track when Start was clicked

In `App.tsx` (or wherever the config change handler is), when `isRunning` changes to true, record the timestamp:

```typescript
const handleConfigChange = useCallback((newConfig: TrackingConfig) => {
  // If transitioning from stopped → running, record start time
  if (newConfig.isRunning && !trackingConfig.isRunning) {
    newConfig = { ...newConfig, startedAt: Date.now() };
  }
  // If transitioning from running → stopped, clear start time
  if (!newConfig.isRunning && trackingConfig.isRunning) {
    newConfig = { ...newConfig, startedAt: null };
  }
  setTrackingConfig(newConfig);
}, [trackingConfig.isRunning]);
```

Then pass `handleConfigChange` to ControlsBar instead of `setTrackingConfig` directly.

#### Add auto-stop timer effect in `useReadings.ts` (or `App.tsx`):

```typescript
// Auto-stop timer
useEffect(() => {
  if (!config.isRunning || !config.autoStopHours || !config.startedAt) return;

  const stopAt = config.startedAt + (config.autoStopHours * 60 * 60 * 1000);
  const remaining = stopAt - Date.now();

  if (remaining <= 0) {
    // Already expired (e.g. after refresh with elapsed timer)
    log(`Auto-stop timer expired — stopping`);
    onConfigChange({ ...config, isRunning: false, startedAt: null });
    return;
  }

  const timer = setTimeout(() => {
    log(`Auto-stop timer: ${config.autoStopHours}h elapsed — stopping`);
    onConfigChange({ ...config, isRunning: false, startedAt: null });
  }, remaining);

  return () => clearTimeout(timer);
}, [config.isRunning, config.autoStopHours, config.startedAt]);
```

Note: `onConfigChange` needs to be passed into `useReadings` or this effect lives in `App.tsx`. Since the config state is in App.tsx, the auto-stop effect should also be in App.tsx.

#### ControlsBar UI changes

Add a "Stop After" input next to the Start/Stop button:

```tsx
<div className={styles.field}>
  <label className={styles.label}>Stop After</label>
  <div className={styles.inputGroup}>
    <input
      type="number"
      className={styles.numInput}
      style={{ width: 50 }}
      value={config.autoStopHours ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        set('autoStopHours', v ? Number(v) : null);
      }}
      placeholder="—"
      min={0.5}
      step={0.5}
      disabled={config.isRunning}
    />
    <span className={styles.unit}>hrs</span>
  </div>
</div>
```

Also show a countdown when running with an auto-stop timer:
```tsx
{config.isRunning && config.autoStopHours && config.startedAt && (
  <span className={styles.timerTag}>
    ⏱ {formatTimeRemaining(config.startedAt, config.autoStopHours)}
  </span>
)}
```

Helper function:
```typescript
function formatTimeRemaining(startedAt: number, hours: number): string {
  const stopAt = startedAt + hours * 3600000;
  const remaining = Math.max(0, stopAt - Date.now());
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  return `${h}h ${m}m left`;
}
```

The countdown won't live-update unless we add a 1-minute interval to force re-render. Add this in ControlsBar:
```typescript
const [, setTick] = useState(0);
useEffect(() => {
  if (!config.isRunning || !config.autoStopHours) return;
  const timer = setInterval(() => setTick(t => t + 1), 60000); // Update every minute
  return () => clearInterval(timer);
}, [config.isRunning, config.autoStopHours]);
```

## Feature 3: Clear Table Button

### What it does

A "Clear" button that wipes all readings from the table, localStorage, AND the dataset (if available). This gives the DD a fresh start — e.g. when switching sections, starting a new run, or clearing bad data from a misconfigured profile.

### Implementation

#### Add `clearAll` to `useReadings` return interface:

```typescript
export interface UseReadingsResult {
  // ... existing fields ...
  clearAll: () => Promise<void>;
}
```

#### Implement in `useReadings.ts`:

```typescript
const clearAll = useCallback(async () => {
  // 1. Clear local state
  setReadings([]);
  
  // 2. Clear localStorage
  if (assetId) {
    try {
      localStorage.removeItem(`yieldtracker_readings_${assetId}`);
    } catch { /* ignore */ }
  }
  
  // 3. Clear from dataset (if available — best effort)
  // For now just log — bulk delete from Corva dataset is complex
  log('Readings cleared');
}, [assetId]);
```

#### Add button to ControlsBar:

Place a "Clear" button near the export buttons. It should have a confirmation step — either a `window.confirm()` dialog or a double-click pattern to prevent accidental clears.

```tsx
<button
  className={styles.clearBtn}
  onClick={() => {
    if (window.confirm(`Clear all ${readingCount} readings? This cannot be undone.`)) {
      onClearAll();
    }
  }}
  disabled={readingCount === 0}
  title="Clear all readings"
>
  🗑 Clear
</button>
```

#### Wire through App.tsx:

Pass `clearAll` from `useReadings` result down to `ControlsBar`:

```typescript
// In App.tsx:
const { readings, clearAll, ... } = useReadings(...);

// In ControlsBar props:
<ControlsBar
  ...
  onClearAll={clearAll}
  readingCount={readings.length}
/>
```

#### Style the button:

Red-ish tint to indicate destructive action. Disabled (grayed out) when table is empty.

```css
.clearBtn {
  background: transparent;
  border: 1px solid #555;
  color: #f44336;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.clearBtn:hover {
  background: rgba(244, 67, 54, 0.1);
  border-color: #f44336;
}
.clearBtn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | ADD `autoStopHours` and `startedAt` to `TrackingConfig` |
| `src/constants.ts` | UPDATE `DEFAULT_TRACKING` with new fields |
| `src/App.tsx` | ADD localStorage persist/restore for config, ADD `handleConfigChange` wrapper, ADD auto-stop timer effect, PASS `clearAll` to ControlsBar |
| `src/effects/useReadings.ts` | ADD localStorage persist/restore for readings, ADD `clearAll` function that clears state + localStorage |
| `src/components/ControlsBar/ControlsBar.tsx` | ADD "Stop After" input, ADD countdown display, ADD "Clear" button with confirm dialog |
| `src/components/ControlsBar/ControlsBar.module.css` | ADD `.clearBtn` styles |

## Build Verification

Run `yarn build` after completing all changes. Fix all errors before considering done.

## Definition of Done

- [ ] TrackingConfig persists to localStorage (keyed by asset_id)
- [ ] On refresh, config restores including isRunning = true (auto-trigger resumes)
- [ ] Readings persist to localStorage as fallback when dataset isn't available
- [ ] On refresh, readings restore from localStorage if dataset returns 0
- [ ] autoStopHours field added to TrackingConfig
- [ ] "Stop After" input rendered in ControlsBar (hours, 0.5 step)
- [ ] Auto-stop timer fires after the specified hours and sets isRunning = false
- [ ] Countdown displays time remaining when timer is active
- [ ] Start/Stop button still works for manual control
- [ ] After refresh with elapsed timer, auto-stop fires immediately
- [ ] `clearAll` function clears readings from state AND localStorage
- [ ] "Clear" button in ControlsBar with confirmation dialog
- [ ] Clear button disabled when table is empty
- [ ] **`yarn build` completes with ZERO errors**
