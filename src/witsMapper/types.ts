export interface WitsChannelProfile {
  id: string;
  vendorName: string;
  /**
   * 'rss'   — a rotary steerable system is in the BHA (nearBitInc/Az are RSS sensors).
   * 'motor' — a bent motor + MWD configuration; no separate RSS near-bit sensor.
   */
  toolType: 'rss' | 'motor';
  channels: ChannelMapping;
  dataSource: 'wits' | 'cerebro' | 'wits+cerebro';
}

export interface ChannelMapping {
  nearBitInc: string;
  nearBitAz: string;       // Empty string = azimuth ignored (curve-only profiles)
  mwdInc: string;          // MWD continuous inclination (~50-90ft behind bit)
  mwdAz: string;           // MWD continuous azimuth
  dutyCycle: string;
  toolFaceSet: string;
  toolFaceActual: string;
  steeringForce: string;
  turbineRPM?: string;
  peakLateral?: string;
  hfto?: string;
  bitRPM?: string;
}

/** Keys that are required for basic RSS yield tracking */
export const REQUIRED_CHANNELS: (keyof ChannelMapping)[] = [
  'nearBitInc',
  'nearBitAz',
  'mwdInc',
  'mwdAz',
  'dutyCycle',
  'toolFaceSet',
  'toolFaceActual',
  'steeringForce',
];

/** All channel keys including optional ones */
export const ALL_CHANNEL_KEYS: (keyof ChannelMapping)[] = [
  ...REQUIRED_CHANNELS,
  'turbineRPM',
  'peakLateral',
  'hfto',
  'bitRPM',
];

/**
 * The resolved mapping from logical channel names to actual WITS field names.
 * This is the SINGLE SOURCE OF TRUTH that every part of the app reads from.
 * It starts as a copy of the active vendor profile's channels, then gets
 * overridden by user selections in the WITS Mapper panel.
 */
export interface ResolvedChannelMap {
  // Required channels
  nearBitInc: string;      // RSS continuous inclination (watched in Curve)
  nearBitAz: string;       // RSS continuous azimuth (watched in U-Turn)
  mwdInc: string;          // MWD continuous inclination (~50-90ft behind bit)
  mwdAz: string;           // MWD continuous azimuth
  dutyCycle: string;       // Steering duty cycle 0-100%
  toolFaceSet: string;     // Commanded toolface direction
  toolFaceActual: string;  // Achieved toolface direction
  steeringForce: string;   // RSS pad force or steering magnitude

  // Optional channels (empty string = not mapped)
  turbineRPM: string;
  peakLateral: string;
  hfto: string;
  bitRPM: string;
}
