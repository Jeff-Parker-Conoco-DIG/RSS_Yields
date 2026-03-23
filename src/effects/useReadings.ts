import { useState, useEffect, useCallback, useRef } from 'react';
import type { YieldReading, TrackingConfig, WellSection } from '../types';
import type { WitsChannelProfile } from '../witsMapper/types';
import { fetchReadings, saveReading, updateReadingNotes, deleteReading } from '../api/readingsApi';
import { fetchLatestWitsRecord } from '../api/corvaApi';
import { resolveChannel } from '../api/witsChannelMap';
import { buildRate, turnRate, dls, decomposeSteeringCommand } from '../calculations/surveyMath';
import { MIN_COURSE_LENGTH_FOR_RATES } from '../constants';
import { log, error } from '../utils/logger';

// ─── Generate a simple UUID ────────────────────────────────────────
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface UseReadingsResult {
  readings: YieldReading[];
  loading: boolean;
  error: string | null;
  currentBitDepth: number | null;

  /** Take a snapshot at the current bit depth NOW */
  takeReading: (source?: 'auto' | 'manual') => Promise<void>;

  /** Update notes on a specific reading */
  setNotes: (readingId: string, notes: string) => Promise<void>;

  /** Delete a specific reading */
  removeReading: (readingId: string) => Promise<void>;

  /** Reload all readings from the dataset */
  reload: () => void;
}

export function useReadings(
  assetId: number | undefined,
  config: TrackingConfig,
  channelProfile: WitsChannelProfile,
): UseReadingsResult {
  const [readings, setReadings] = useState<YieldReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [currentBitDepth, setCurrentBitDepth] = useState<number | null>(null);

  // Ref to latest readings for use inside callbacks/timers
  const readingsRef = useRef<YieldReading[]>([]);
  readingsRef.current = readings;

  const configRef = useRef(config);
  configRef.current = config;

  // Track the last RSS continuous inclination we saw from WITS
  const lastSeenIncRef = useRef<number | null>(null);

  // ─── Load existing readings from dataset ─────────────────────
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const data = await fetchReadings(assetId);
        if (!cancelled) {
          setReadings(data);
          log(`Loaded ${data.length} existing readings`);
        }
      } catch (e) {
        error('Failed to load readings:', e);
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [assetId, reloadCount]);

  const reload = useCallback(() => setReloadCount((c) => c + 1), []);

  // ─── Take a snapshot (core function) ─────────────────────────
  const takeReading = useCallback(async (source: 'auto' | 'manual' = 'manual') => {
    if (!assetId) return;

    try {
      const cfg = configRef.current;
      const prev = readingsRef.current.length > 0
        ? readingsRef.current[readingsRef.current.length - 1]
        : null;

      // 1. Fetch the single most recent WITS record (no field filtering)
      const witsRecord = await fetchLatestWitsRecord(assetId);

      if (!witsRecord) {
        error('No WITS data available for snapshot');
        return;
      }

      // The raw WITS record structure: { asset_id, timestamp, measured_depth, data: { field: val, ... } }
      const dataObj = (witsRecord.data ?? {}) as Record<string, unknown>;

      // Extract depth — try multiple possible locations
      // Raw WITS has data.bit_depth (17612.55) and data.hole_depth
      // Summary-1ft has data.bit_depth_max
      const depth = Number(
        dataObj.bit_depth             // Raw WITS (most accurate, current bit depth)
        ?? dataObj.hole_depth         // Raw WITS or summary-1ft
        ?? witsRecord.measured_depth  // Top-level (some datasets)
        ?? dataObj.bit_depth_max      // summary-1ft aggregated
        ?? dataObj.bit_depth_mean     // summary-1ft aggregated
        ?? dataObj.sta_depth          // Pason raw
        ?? 0
      );

      if (depth <= 0) {
        error(`Invalid depth from WITS. measured_depth=${witsRecord.measured_depth}, data.bit_depth=${dataObj.bit_depth}`);
        return;
      }

      // Only skip if the exact same depth AND the reading was taken less than 30 seconds ago
      // (prevents rapid duplicate clicks, but allows re-reading at same depth intentionally)
      if (prev && Math.abs(depth - prev.depth) < 0.5 && (Date.now() - prev.timestamp) < 30000) {
        log(`Skipping — duplicate reading at ${depth} ft (taken ${((Date.now() - prev.timestamp) / 1000).toFixed(0)}s ago)`);
        return;
      }

      // 2. Extract values from data.* using channel profile mappings
      //    resolveChannel returns { dataset, field: 'data.iCInc' }
      //    We strip 'data.' to get the key into the data object
      const getVal = (channelKey: keyof typeof channelProfile.channels): number | null => {
        const resolved = resolveChannel(channelProfile, channelKey);
        if (!resolved) return null;
        const key = resolved.field.replace('data.', '');
        const v = dataObj[key];
        if (v == null) return null;
        const num = Number(v);
        return isNaN(num) ? null : num;
      };

      const inc = getVal('nearBitInc') ?? 0;
      const azRaw = getVal('nearBitAz');          // null when profile ignores azimuth
      const az = azRaw ?? 0;
      const dc = getVal('dutyCycle');
      const tfSet = getVal('toolFaceSet');
      const tfAct = getVal('toolFaceActual');
      const tfStd = getVal('toolFaceStdDev');
      const sf = getVal('steeringForce');

      // 3. Calculate rates from previous reading
      //    Only compute BR/TR/DLS when course length >= MIN_COURSE_LENGTH_FOR_RATES.
      //    Curve-only profiles (nearBitAz = '') skip TR; DLS = |BR|.
      let cl: number | null = null;
      let br_: number | null = null;
      let tr_: number | null = null;
      let dls_: number | null = null;

      if (prev) {
        cl = depth - prev.depth;
        if (cl >= MIN_COURSE_LENGTH_FOR_RATES) {
          br_ = buildRate(prev.inc, inc, cl);
          if (azRaw != null) {
            // Full 3D rates — azimuth channel is mapped
            tr_ = turnRate(prev.az, az, cl);
            dls_ = dls(prev.inc, inc, prev.az, az, cl);
          } else {
            // Curve-only profile — no azimuth, DLS = |BR|
            tr_ = null;
            dls_ = Math.abs(br_);
          }
        }
      }

      // 4. Toolface decomposition
      let buildCmd: number | null = null;
      let turnCmd: number | null = null;
      const tfForDecomp = tfAct ?? tfSet;
      if (dc != null && tfForDecomp != null) {
        const decomp = decomposeSteeringCommand(dc, tfForDecomp);
        buildCmd = decomp.buildCommand;
        turnCmd = decomp.turnCommand;
      }

      // 5. Create reading
      const reading: YieldReading = {
        id: uuid(),
        assetId,
        depth,
        inc,
        az,
        courseLength: cl,
        br: br_,
        tr: tr_,
        dls: dls_,
        dutyCycle: dc,
        toolFaceSet: tfSet,
        toolFaceActual: tfAct,
        toolFaceStdDev: tfStd,
        steeringForce: sf,
        buildCommand: buildCmd,
        turnCommand: turnCmd,
        notes: '',
        section: cfg.section,
        timestamp: Date.now(),
        source,
      };

      // 6. Persist to dataset (don't block on failure — save locally regardless)
      saveReading(reading).catch((e) => error('Failed to persist reading:', e));

      // 7. Update local state
      setReadings((prev) => [...prev, reading]);
      setCurrentBitDepth(depth);
      log(`Reading taken at ${depth} ft — inc=${inc} az=${az} (${source})`);
    } catch (e) {
      error('takeReading failed:', e);
    }
  }, [assetId, channelProfile]);

  // ─── Set notes on a reading ──────────────────────────────────
  const setNotes = useCallback(async (readingId: string, notes: string) => {
    // Update local state immediately
    setReadings((prev) =>
      prev.map((r) => (r.id === readingId ? { ...r, notes } : r)),
    );
    // Persist
    if (assetId) {
      await updateReadingNotes(assetId, readingId, notes);
    }
  }, [assetId]);

  // ─── Delete a reading ────────────────────────────────────────
  const removeReading = useCallback(async (readingId: string) => {
    // Remove from local state immediately
    setReadings((prev) => prev.filter((r) => r.id !== readingId));
    // Persist deletion
    if (assetId) {
      await deleteReading(assetId, readingId);
    }
  }, [assetId]);

  // ─── Inc-watcher auto-trigger ──────────────────────────────────
  // Watches rss_continuous_inclination for changes. When the RSS tool
  // reports a new inc AND we've drilled at least intervalValue feet
  // since the last reading, take a snapshot. This gives a "true" yield
  // because the reading is anchored to the tool's measurement cycle.
  useEffect(() => {
    if (!assetId || !config.isRunning || config.intervalMode !== 'depth') return;

    // Reset last seen inc when starting so first poll seeds the value
    lastSeenIncRef.current = null;

    const timer = setInterval(async () => {
      try {
        const witsRecord = await fetchLatestWitsRecord(assetId);
        if (!witsRecord) return;
        const dataObj = (witsRecord.data ?? {}) as Record<string, unknown>;

        // Get current depth and RSS inc
        const depth = Number(
          dataObj.bit_depth
          ?? dataObj.hole_depth
          ?? witsRecord.measured_depth
          ?? dataObj.bit_depth_max
          ?? dataObj.bit_depth_mean
          ?? dataObj.sta_depth
          ?? 0,
        );
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
          log(`Inc-watcher trigger: inc changed ${lastSeenInc?.toFixed(4)}\u2192${rssInc.toFixed(4)} at depth=${depth.toFixed(1)} (interval=${cfg.intervalValue}ft)`);
          await takeReading('auto');
        }
      } catch {
        // Silently retry on next interval
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [assetId, config.isRunning, config.intervalMode, config.intervalValue, config.startDepth, config.stopDepth, takeReading]);

  // ─── Auto-trigger: Time-based ────────────────────────────────
  useEffect(() => {
    if (!assetId || !config.isRunning || config.intervalMode !== 'time') return;

    const intervalMs = config.intervalValue * 60 * 1000;

    const timer = setInterval(async () => {
      await takeReading('auto');
    }, intervalMs);

    return () => clearInterval(timer);
  }, [assetId, config.isRunning, config.intervalMode, config.intervalValue, takeReading]);

  return {
    readings,
    loading,
    error: err,
    currentBitDepth,
    takeReading,
    setNotes,
    removeReading,
    reload,
  };
}
