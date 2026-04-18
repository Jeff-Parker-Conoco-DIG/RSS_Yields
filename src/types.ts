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

export interface FormationTop {
  md: number;
  td: number;
  name: string;
}

export interface SlideInterval {
  fromDepth: number;
  toDepth: number;
  isSlide: boolean;
  motorYield: number | null;
  buildRateSlide: number | null;
  effectiveToolface: number | null;
  tfoAccuracy: number | null;
}

export interface TrackingConfig {
  startDepth: number;
  stopDepth: number | null;      // null = run until stopped
  section: WellSection;
  intervalMode: IntervalMode;
  intervalValue: number;          // ft for depth mode, minutes for time mode
  isRunning: boolean;
  autoStopHours: number | null;  // null = no auto-stop
  startedAt: number | null;      // timestamp when Start was clicked (for timer calculation)
  dlNeeded: number | null;       // Required DLS to reach target (°/100ft). Drives BR/TR/DLS color coding.
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

  // Sensor comparison (RSS leads MWD by ~B2S gap)
  deltaInc: number | null;        // RSS Inc − MWD Inc (degrees)
  deltaAz: number | null;         // RSS Az − MWD Az, wrapped ±180° (degrees)

  // Slide / rotate breakdown — derived from directional.slide-sheet
  // The sensor depth is bit depth minus the MWD bit-to-survey offset.
  sensorDepth: number | null;     // Where the MWD survey actually represents (bit − mwdOffset)
  slideFt: number | null;         // Slide footage in the interval (at bit depth range)
  rotateFt: number | null;        // Rotate footage in the interval
  /** Slide footage the MWD sensor has already passed (toDepth ≤ sensorDepth).
   *  Defined against the active slide selected for this reading. */
  slideSeen: number | null;
  /** Slide footage ahead of the sensor within the active slide interval. */
  slideAhead: number | null;
  /** Start depth of the active slide interval (for reference display). */
  slideStartDepth: number | null;
  /** End depth of the active slide interval (for reference display). */
  slideEndDepth: number | null;
  /** Footage-weighted TFO accuracy across slides overlapping the sensor-to-bit window (%). */
  tfAccuracy: number | null;
  /** Corva slide-sheet footage-weighted motor yield over this reading interval (deg/100ft at 100% slide). */
  sheetMotorYield: number | null;
  /** Corva slide-sheet footage-weighted build-yield component over this reading interval. */
  sheetBrYield: number | null;
  /** Corva slide-sheet footage-weighted turn-yield component over this reading interval. */
  sheetTrYield: number | null;
  /** Formation name at bit depth. */
  formation: string | null;

  // Normalized motor yield — DLS/BR/TR at 100% slide (°/100ft)
  normalizedDls: number | null;
  normalizedBr: number | null;
  normalizedTr: number | null;

  // Steering parameters — averaged over interval from prev depth to this depth
  dutyCycle: number | null;       // 0-100%
  toolFaceSet: number | null;     // Commanded gravity TF (degrees)
  toolFaceActual: number | null;  // Achieved gravity TF (degrees)
  toolFaceStdDev: number | null;  // TF consistency (degrees)
  steeringForce: number | null;

  // Resultant toolface — back-calculated from actual RSS BR/TR
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
