export interface WitsChannelProfile {
  id: string;
  vendorName: string;
  channels: ChannelMapping;
  dataSource: 'wits' | 'cerebro' | 'wits+cerebro';
}

export interface ChannelMapping {
  nearBitInc: string;
  nearBitAz: string;       // Empty string = azimuth ignored (curve-only profiles)
  dutyCycle: string;
  toolFaceSet: string;
  toolFaceActual: string;
  toolFaceStdDev: string;
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
  'dutyCycle',
  'toolFaceSet',
  'toolFaceActual',
  'toolFaceStdDev',
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
