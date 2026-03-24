import { useState, useEffect, useCallback, useRef } from 'react';
import type { YieldReading, TrackingConfig, WellSection } from '../types';
import type { ResolvedChannelMap } from '../witsMapper/types';
import { fetchReadings, saveReading, updateReadingNotes, deleteReading } from '../api/readingsApi';
import { fetchLatestWitsRecord, fetchRecentWitsRecords } from '../api/corvaApi';
import { buildRate, turnRate, dls, decomposeSteeringCommand, effectiveToolface, azimuthDelta } from '../calculations/surveyMath';
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

  /** Clear all readings from state, localStorage, and dataset */
  clearAll: () => Promise<void>;

  /** Reload all readings from the dataset */
  reload: () => void;
}

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
      log(`Change point found: ${watchField} changed at record ${i - 1} (depth=${(((records[i - 1].data as Record<string, unknown>)?.bit_depth) ?? '?')})`);
      return records[i - 1];
    }
  }

  // No change found in the window — use the latest record
  log(`No change point found in ${records.length} records for ${watchField} — using latest`);
  return records[0];
}

export function useReadings(
  assetId: number | undefined,
  config: TrackingConfig,
  channelMap: ResolvedChannelMap,
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

  const channelMapRef = useRef(channelMap);
  channelMapRef.current = channelMap;

  // Track the last watched channel value we saw from WITS
  const lastSeenWatchValueRef = useRef<number | null>(null);

  // ─── Load existing readings from dataset (fallback: localStorage) ──
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const data = await fetchReadings(assetId);
        if (!cancelled) {
          if (data.length > 0) {
            setReadings(data);
            log(`Loaded ${data.length} existing readings`);
          } else {
            // Fallback: restore from localStorage
            try {
              const cached = localStorage.getItem(`yieldtracker_readings_${assetId}`);
              if (cached) {
                const parsed = JSON.parse(cached) as YieldReading[];
                setReadings(parsed);
                log(`Restored ${parsed.length} readings from localStorage`);
              }
            } catch { /* ignore parse errors */ }
          }
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

  // ─── Persist readings to localStorage as fallback ─────────────
  useEffect(() => {
    if (!assetId || readings.length === 0) return;
    try {
      localStorage.setItem(`yieldtracker_readings_${assetId}`, JSON.stringify(readings));
    } catch { /* quota */ }
  }, [assetId, readings]);

  const reload = useCallback(() => setReloadCount((c) => c + 1), []);

  // ─── Take a snapshot (core function) ─────────────────────────
  const takeReading = useCallback(async (source: 'auto' | 'manual' = 'manual') => {
    if (!assetId) return;

    try {
      const cfg = configRef.current;
      const prev = readingsRef.current.length > 0
        ? readingsRef.current[readingsRef.current.length - 1]
        : null;

      // Determine which channel to watch based on section
      const map = channelMapRef.current;
      const watchField = cfg.section === 'uturn' ? map.nearBitAz : map.nearBitInc;

      // For manual readings: fetch recent records and find the change point
      // For auto readings: use the latest record (the watcher already triggered at the right moment)
      let dataObj: Record<string, unknown>;

      if (source === 'manual') {
        const records = await fetchRecentWitsRecords(assetId, 50);
        if (records.length === 0) {
          error('No WITS data available for snapshot');
          return;
        }
        const changePoint = findChangePointRecord(records, watchField);
        dataObj = (changePoint.data ?? {}) as Record<string, unknown>;
        log(`Manual reading: walked back to change point for '${watchField}'`);
      } else {
        // Auto reading — watcher already triggered at the right moment, use latest
        const witsRecord = await fetchLatestWitsRecord(assetId);
        if (!witsRecord) {
          error('No WITS data available for snapshot');
          return;
        }
        dataObj = (witsRecord.data ?? {}) as Record<string, unknown>;
      }

      // Extract depth — try multiple possible locations
      // Raw WITS has data.bit_depth (17612.55) and data.hole_depth
      // Summary-1ft has data.bit_depth_max
      const depth = Number(
        dataObj.bit_depth             // Raw WITS (most accurate, current bit depth)
        ?? dataObj.hole_depth         // Raw WITS or summary-1ft
        ?? dataObj.bit_depth_max      // summary-1ft aggregated
        ?? dataObj.bit_depth_mean     // summary-1ft aggregated
        ?? dataObj.sta_depth          // Pason raw
        ?? 0
      );

      if (depth <= 0) {
        error(`Invalid depth from WITS. data.bit_depth=${dataObj.bit_depth}`);
        return;
      }

      // Only skip if the exact same depth AND the reading was taken less than 30 seconds ago
      // (prevents rapid duplicate clicks, but allows re-reading at same depth intentionally)
      if (prev && Math.abs(depth - prev.depth) < 0.5 && (Date.now() - prev.timestamp) < 30000) {
        log(`Skipping — duplicate reading at ${depth} ft (taken ${((Date.now() - prev.timestamp) / 1000).toFixed(0)}s ago)`);
        return;
      }

      // 2. Extract values from data.* using the resolved channel map
      const getVal = (fieldName: string): number | null => {
        if (!fieldName) return null;
        const v = dataObj[fieldName];
        if (v == null) return null;
        const num = Number(v);
        return isNaN(num) ? null : num;
      };

      const inc = getVal(map.nearBitInc) ?? 0;
      const azRaw = map.nearBitAz ? getVal(map.nearBitAz) : null;  // null when not mapped
      const az = azRaw ?? 0;
      const mwdInc = getVal(map.mwdInc);
      const mwdAz = getVal(map.mwdAz);
      const dc = getVal(map.dutyCycle);
      const tfSet = getVal(map.toolFaceSet);
      const tfAct = getVal(map.toolFaceActual);
      const sf = getVal(map.steeringForce);

      // 3. Calculate RSS rates from previous reading
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

      // 3b. Calculate MWD rates from MWD inc/az
      let mwdBr: number | null = null;
      let mwdTr: number | null = null;
      let mwdDls: number | null = null;

      if (prev && cl != null && cl >= MIN_COURSE_LENGTH_FOR_RATES && mwdInc != null && prev.mwdInc != null) {
        mwdBr = buildRate(prev.mwdInc, mwdInc, cl);
        if (mwdAz != null && prev.mwdAz != null) {
          mwdTr = turnRate(prev.mwdAz, mwdAz, cl);
          mwdDls = dls(prev.mwdInc, mwdInc, prev.mwdAz, mwdAz, cl);
        }
        log(`MWD rates: prevInc=${prev.mwdInc} currInc=${mwdInc} prevAz=${prev.mwdAz} currAz=${mwdAz} CL=${cl} → BR=${mwdBr?.toFixed(4)} TR=${mwdTr?.toFixed(4)} DLS=${mwdDls?.toFixed(4)}`);
      }

      // 3c. Calculate resultant toolface from RSS inc/az change
      let resultTF: number | null = null;
      if (br_ != null && tr_ != null) {
        const { effectiveTF } = effectiveToolface(br_, tr_, inc);
        resultTF = effectiveTF;
      }

      // 3d. Delta between RSS and MWD sensors
      let deltaInc_: number | null = null;
      let deltaAz_: number | null = null;
      if (mwdInc != null) {
        deltaInc_ = inc - mwdInc;
      }
      if (azRaw != null && mwdAz != null) {
        deltaAz_ = azimuthDelta(mwdAz, az); // RSS Az − MWD Az, wrapped ±180°
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
        mwdInc,
        mwdAz,
        courseLength: cl,
        br: br_,
        tr: tr_,
        dls: dls_,
        mwdBr,
        mwdTr,
        mwdDls,
        deltaInc: deltaInc_,
        deltaAz: deltaAz_,
        dutyCycle: dc,
        toolFaceSet: tfSet,
        toolFaceActual: tfAct,
        toolFaceStdDev: null,  // Not available as a direct WITS channel; computed from slide-sheet in future
        steeringForce: sf,
        resultantTF: resultTF,
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
  }, [assetId, channelMap]);

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

  // ─── Clear all readings ───────────────────────────────────────
  const clearAll = useCallback(async () => {
    setReadings([]);
    if (assetId) {
      try {
        localStorage.removeItem(`yieldtracker_readings_${assetId}`);
      } catch { /* ignore */ }
    }
    log('Readings cleared');
  }, [assetId]);

  // ─── Section-aware channel watcher ─────────────────────────────
  // Watches the appropriate RSS channel based on well section:
  //   curve → watch rss_continuous_inclination
  //   uturn → watch rss_continuous_azimuth
  // Triggers a reading when the watched channel changes AND depth has
  // advanced at least intervalValue feet from the last reading.
  useEffect(() => {
    if (!assetId || !config.isRunning || config.intervalMode !== 'depth') return;

    // Determine which channel to watch based on section + resolved map
    const map = channelMapRef.current;
    const watchChannel = config.section === 'uturn'
      ? map.nearBitAz
      : map.nearBitInc;

    log(`Channel watcher started: watching '${watchChannel}' for ${config.section} section, interval=${config.intervalValue}ft`);

    // Reset the last seen value when section changes so first poll just seeds it
    lastSeenWatchValueRef.current = null;

    const timer = setInterval(async () => {
      try {
        const witsRecord = await fetchLatestWitsRecord(assetId);
        if (!witsRecord) return;
        const dataObj = (witsRecord.data ?? {}) as Record<string, unknown>;

        // Get current depth and the watched channel value
        const depth = Number(dataObj.bit_depth ?? dataObj.hole_depth ?? 0);
        const watchValue = Number(dataObj[watchChannel] ?? 0);

        if (depth <= 0) return;
        setCurrentBitDepth(depth);

        const cfg = configRef.current;
        if (depth < cfg.startDepth) return;
        if (cfg.stopDepth && depth > cfg.stopDepth) return;

        const lastReading = readingsRef.current[readingsRef.current.length - 1];
        const lastDepth = lastReading?.depth ?? cfg.startDepth;
        const lastSeenVal = lastSeenWatchValueRef.current;

        // Check if the watched channel value changed (tool reported new measurement)
        // Use 0.001° threshold to filter float noise
        const valueChanged = lastSeenVal !== null && Math.abs(watchValue - lastSeenVal) > 0.001;

        // Update last seen value
        lastSeenWatchValueRef.current = watchValue;

        // Take reading when: value changed AND drilled enough footage
        if (valueChanged && depth >= lastDepth + cfg.intervalValue) {
          const channelLabel = config.section === 'uturn' ? 'az' : 'inc';
          log(`Watcher trigger: ${channelLabel} changed ${lastSeenVal?.toFixed(4)}\u2192${watchValue.toFixed(4)} at depth=${depth.toFixed(1)} (CL=${(depth - lastDepth).toFixed(1)}ft)`);
          await takeReading('auto');
        }
      } catch {
        // Silently retry on next poll
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [assetId, config.isRunning, config.intervalMode, config.intervalValue, config.startDepth, config.stopDepth, config.section, channelMap, takeReading]);

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
    clearAll,
    reload,
  };
}
