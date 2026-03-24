// ─── Corva App Props ───────────────────────────────────────────────
export interface AppProps {
  well?: { asset_id: number; name?: string };
  currentUser?: { company_id: number; name?: string; email?: string };
  app?: { settings?: AppSettingsData };
  appHeaderProps?: Record<string, unknown>;
  coordinates?: { x: number; y: number };
  segment?: string;
  onSettingChange?: (key: string, value: unknown) => void;
  appSettings?: AppSettingsData;
}

// ─── App Settings ──────────────────────────────────────────────────
export interface AppSettingsData {
  unitSystem: 'imperial' | 'metric';
  dlsNormalization: 'per100ft' | 'per30m';
  yieldDivergenceThreshold: number;
  colorMode: 'divergence' | 'section' | 'time';
  showMotorContribution?: boolean;
}

// ─── Tracking Configuration ────────────────────────────────────────
export type IntervalMode = 'depth' | 'time' | 'manual';
export type WellSection = 'curve' | 'uturn';

export interface TrackingConfig {
  startDepth: number;
  stopDepth: number | null;      // null = run until stopped
  section: WellSection;
  intervalMode: IntervalMode;
  intervalValue: number;          // ft for depth mode, minutes for time mode
  isRunning: boolean;
  autoStopHours: number | null;  // null = no auto-stop
  startedAt: number | null;      // timestamp when Start was clicked (for timer calculation)
}

// ─── Yield Reading — One row in the tracking table ─────────────────
export interface YieldReading {
  // Identity
  id: string;                     // UUID
  assetId: number;

  // Depth & Survey snapshot
  depth: number;                  // Bit depth at time of reading (ft)
  inc: number;                    // Inclination (degrees)
  az: number;                     // Azimuth (degrees)

  // Rates — calculated from previous reading (RSS near-bit)
  courseLength: number | null;     // Distance from prev reading (ft)
  br: number | null;              // Build rate (°/100ft)
  tr: number | null;              // Turn rate (°/100ft)
  dls: number | null;             // DLS (°/100ft)

  // MWD survey snapshot (from MWD tool, ~50-90ft behind bit)
  mwdInc: number | null;
  mwdAz: number | null;

  // MWD rates — calculated from MWD inc/az between readings
  mwdBr: number | null;           // MWD build rate °/100ft
  mwdTr: number | null;           // MWD turn rate °/100ft
  mwdDls: number | null;          // MWD DLS °/100ft

  // Steering parameters — averaged over interval from prev depth to this depth
  dutyCycle: number | null;       // 0-100%
  toolFaceSet: number | null;     // Gravity TF (degrees)
  toolFaceActual: number | null;  // Gravity TF (degrees)
  steeringForce: number | null;

  // Resultant toolface — calculated from RSS inc/az change, NOT a WITS channel
  resultantTF: number | null;     // Effective steering direction (degrees)

  // Toolface-decomposed steering commands
  buildCommand: number | null;    // (DC/100) × cos(TF)
  turnCommand: number | null;     // (DC/100) × sin(TF)

  // User-editable
  notes: string;

  // Metadata
  section: WellSection;
  timestamp: number;              // Unix epoch ms when reading was taken
  source: 'auto' | 'manual';
}

// ─── Yield Regression ──────────────────────────────────────────────
export interface YieldRegression {
  slope: number;
  intercept: number;
  rSquared: number;
  n: number;
}

export interface YieldAnalysis {
  overallDLS: YieldRegression | null;
  buildYield: YieldRegression | null;
  turnYield: YieldRegression | null;
}

// ─── Drillstring / BHA ─────────────────────────────────────────────
export interface RssToolInfo {
  toolName: string;
  vendor: string;
  serialNumber: string | null;
  bitToSurveyDistance: number;
  mwdBitToSurveyDistance: number;
  hasMotor: boolean;
  motorBendAngle: number | null;
  motorYield: number | null;
}

// ─── WITS Records ──────────────────────────────────────────────────
export interface WitsRecord {
  measured_depth: number;
  timestamp: number;
  data: Record<string, number | string | null>;
}

// ─── UI Tab State ──────────────────────────────────────────────────
export type TabId = 'table' | 'scatter';
