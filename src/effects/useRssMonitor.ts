import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchLatestWitsRecord } from '../api/corvaApi';
import { log, warn } from '../utils/logger';

// ─── Monitor channel field names (from merged WITS data.* object) ──
const MONITOR_CHANNELS = {
  mwdAxialShock: 'mwd_axial_peak_shock',
  mwdLateralShock: 'mwd_lateral_peak_shock',
  rssWhirl: 'rsswhirl',
  turbineRPM: 'rsslowtorqrpm',
  dutyCycle: 'rsspsum',
  toolface: 'gravity_tool_face',
} as const;

// ─── Types ─────────────────────────────────────────────────────────
export interface RssMonitorValues {
  mwdAxialShock: number | null;
  mwdLateralShock: number | null;
  rssWhirl: number | null;
  turbineRPM: number | null;
  dutyCycle: number | null;
  toolface: number | null;
  timestamp: number | null;
}

export interface RssMonitorThresholds {
  mwdAxialShock: { yellow: number; red: number };
  mwdLateralShock: { yellow: number; red: number };
  rssWhirl: { yellow: number; red: number };
  turbineRPM: { low: number; critical: number };
}

const DEFAULT_THRESHOLDS: RssMonitorThresholds = {
  mwdAxialShock: { yellow: 10, red: 20 },
  mwdLateralShock: { yellow: 15, red: 30 },
  rssWhirl: { yellow: 2, red: 3 },
  turbineRPM: { low: 1500, critical: 1000 },
};

const STORAGE_KEY = 'yieldtracker_monitor_thresholds';
const POLL_INTERVAL = 5000;

const EMPTY_VALUES: RssMonitorValues = {
  mwdAxialShock: null,
  mwdLateralShock: null,
  rssWhirl: null,
  turbineRPM: null,
  dutyCycle: null,
  toolface: null,
  timestamp: null,
};

function loadThresholds(): RssMonitorThresholds {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as RssMonitorThresholds;
  } catch { /* ignore */ }
  return DEFAULT_THRESHOLDS;
}

function saveThresholds(t: RssMonitorThresholds): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch { /* quota */ }
}

function extractNumber(data: Record<string, unknown>, field: string): number | null {
  const v = data[field];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function useRssMonitor(
  assetId: number | undefined,
  enabled: boolean,
): {
  values: RssMonitorValues;
  thresholds: RssMonitorThresholds;
  setThresholds: (t: RssMonitorThresholds) => void;
} {
  const [values, setValues] = useState<RssMonitorValues>(EMPTY_VALUES);
  const [thresholds, setThresholdsState] = useState<RssMonitorThresholds>(loadThresholds);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setThresholds = useCallback((t: RssMonitorThresholds) => {
    setThresholdsState(t);
    saveThresholds(t);
  }, []);

  useEffect(() => {
    if (!enabled || !assetId) {
      setValues(EMPTY_VALUES);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const rec = await fetchLatestWitsRecord(assetId);
        if (cancelled) return;
        if (!rec?.data || typeof rec.data !== 'object') {
          setValues(EMPTY_VALUES);
          return;
        }

        const data = rec.data as Record<string, unknown>;
        setValues({
          mwdAxialShock: extractNumber(data, MONITOR_CHANNELS.mwdAxialShock),
          mwdLateralShock: extractNumber(data, MONITOR_CHANNELS.mwdLateralShock),
          rssWhirl: extractNumber(data, MONITOR_CHANNELS.rssWhirl),
          turbineRPM: extractNumber(data, MONITOR_CHANNELS.turbineRPM),
          dutyCycle: extractNumber(data, MONITOR_CHANNELS.dutyCycle),
          toolface: extractNumber(data, MONITOR_CHANNELS.toolface),
          timestamp: typeof rec.timestamp === 'number' ? rec.timestamp : Date.now(),
        });
      } catch (e) {
        warn('RSS monitor poll failed:', e);
      }
    };

    // Initial fetch
    poll();

    // Start interval
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    log(`RSS monitor started (asset ${assetId}, ${POLL_INTERVAL}ms interval)`);

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [assetId, enabled]);

  return { values, thresholds, setThresholds };
}
