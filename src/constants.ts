import type { AppSettingsData, TabId, TrackingConfig, WellSection } from './types';

// ─── Default Settings ──────────────────────────────────────────────
export const DEFAULT_SETTINGS: AppSettingsData = {
  activeProfile: 'icruise',
  customChannelOverrides: {},
  unitSystem: 'imperial',
  dlsNormalization: 'per100ft',
  yieldDivergenceThreshold: 0.5,
  colorMode: 'divergence',
};

// ─── Default Tracking Config ───────────────────────────────────────
export const DEFAULT_TRACKING: TrackingConfig = {
  startDepth: 0,
  stopDepth: null,
  section: 'curve',
  intervalMode: 'depth',
  intervalValue: 90,
  isRunning: false,
};

// ─── Well Sections ─────────────────────────────────────────────────
export const WELL_SECTIONS: { value: WellSection; label: string }[] = [
  { value: 'curve', label: 'Curve' },
  { value: 'uturn', label: 'U-Turn' },
];

// ─── Tabs ──────────────────────────────────────────────────────────
export const TABS: { id: TabId; label: string }[] = [
  { id: 'table', label: 'Readings' },
  { id: 'scatter', label: 'Yield Plot' },
];

// ─── DLS Normalization ─────────────────────────────────────────────
export const DLS_NORM_FACTOR: Record<string, number> = {
  per100ft: 100,
  per30m: 30,
};

// ─── Color Thresholds ──────────────────────────────────────────────
export const YIELD_COLORS = {
  good: '#4caf50',
  warning: '#ff9800',
  bad: '#f44336',
  neutral: '#9e9e9e',
} as const;

// ─── Section Colors ────────────────────────────────────────────────
export const SECTION_COLORS: Record<WellSection, string> = {
  curve: '#f59e0b',
  uturn: '#8b5cf6',
};

// ─── API Defaults ──────────────────────────────────────────────────
export const BATCH_SIZE = 100;

// ─── Survey Math ───────────────────────────────────────────────────
export const MIN_COURSE_LENGTH_FT = 5;

/** Minimum course length (ft) before BR/TR/DLS are calculated.
 *  Below this the interval is too small for meaningful rate math.
 *  Set low (0.5ft) since the DD controls the actual interval. */
export const MIN_COURSE_LENGTH_FOR_RATES = 0.5;

// ─── RSS Vendor IDs ────────────────────────────────────────────────
export const RSS_VENDORS = ['icruise', 'powerdrive', 'custom', 'bentmotor_curve', 'rss_curve'] as const;
export type RssVendorId = (typeof RSS_VENDORS)[number];

// ─── Dataset name for readings persistence ─────────────────────────
export const READINGS_DATASET = 'copca.yieldtracker.readings';
