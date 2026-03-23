import type { WitsChannelProfile } from './types';

export const ICRUISE_PROFILE: WitsChannelProfile = {
  id: 'icruise',
  vendorName: 'Halliburton iCruise',
  channels: {
    nearBitInc: 'rss_continuous_inclination',  // 89.26 — RSS near-bit inc from raw WITS
    nearBitAz: 'rss_continuous_azimuth',       // 201.69 — RSS near-bit az from raw WITS
    dutyCycle: 'rsspsum',                      // 100 — RSS possum/proportion (duty cycle)
    toolFaceSet: 'gravity_tool_face',          // 73.13 — gravity toolface
    toolFaceActual: 'gravity_tool_face',       // same field — actual TF
    toolFaceStdDev: 'rss_ssind',               // RSS stick-slip indicator (closest proxy)
    steeringForce: 'mwd_axial_peak_shock',     // 13 — axial shock
    turbineRPM: 'rsslowtorqrpm',               // 1900 — RSS turbine RPM
    peakLateral: 'mwd_lateral_peak_shock',     // 39 — lateral shock
    bitRPM: 'rotary_rpm',                      // 19.98 — surface RPM
  },
  dataSource: 'wits',  // Cerebro not available (412), use raw WITS only
};

export const POWERDRIVE_PROFILE: WitsChannelProfile = {
  id: 'powerdrive',
  vendorName: 'SLB PowerDrive',
  channels: {
    nearBitInc: 'continuous_inclination',
    nearBitAz: 'mwd_continuous_azimuth',
    dutyCycle: 'steering_ratio',
    toolFaceSet: 'toolface_setpoint',
    toolFaceActual: 'toolface_actual',
    toolFaceStdDev: 'toolface_stddev',
    steeringForce: 'steering_force',
  },
  dataSource: 'wits',
};

export const GENERIC_PROFILE: WitsChannelProfile = {
  id: 'custom',
  vendorName: 'Custom / Generic',
  channels: {
    nearBitInc: 'continuous_inclination',
    nearBitAz: 'mwd_continuous_azimuth',
    dutyCycle: 'duty_cycle',
    toolFaceSet: 'toolface_set',
    toolFaceActual: 'toolface_actual',
    toolFaceStdDev: 'toolface_stddev',
    steeringForce: 'steering_force',
  },
  dataSource: 'wits',
};

// ─── Curve-only profiles (ignore azimuth) ─────────────────────────
// These profiles only track inclination changes for build rate.
// TR is not calculated; DLS = |BR|.

export const BENTMOTOR_CURVE_PROFILE: WitsChannelProfile = {
  id: 'bentmotor_curve',
  vendorName: 'Bent Motor Curve',
  channels: {
    nearBitInc: 'continuous_inclination',    // MWD inc
    nearBitAz: '',                           // Azimuth ignored in curve
    dutyCycle: 'duty_cycle',
    toolFaceSet: 'toolface_set',
    toolFaceActual: 'toolface_actual',
    toolFaceStdDev: 'toolface_stddev',
    steeringForce: 'steering_force',
  },
  dataSource: 'wits',
};

export const RSS_CURVE_PROFILE: WitsChannelProfile = {
  id: 'rss_curve',
  vendorName: 'RSS Curve',
  channels: {
    nearBitInc: 'rss_continuous_inclination', // RSS inc
    nearBitAz: '',                            // Azimuth ignored in curve
    dutyCycle: 'rsspsum',
    toolFaceSet: 'gravity_tool_face',
    toolFaceActual: 'gravity_tool_face',
    toolFaceStdDev: 'rss_ssind',
    steeringForce: 'mwd_axial_peak_shock',
    turbineRPM: 'rsslowtorqrpm',
    peakLateral: 'mwd_lateral_peak_shock',
    bitRPM: 'rotary_rpm',
  },
  dataSource: 'wits',
};

export const PROFILES: Record<string, WitsChannelProfile> = {
  icruise: ICRUISE_PROFILE,
  powerdrive: POWERDRIVE_PROFILE,
  custom: GENERIC_PROFILE,
  bentmotor_curve: BENTMOTOR_CURVE_PROFILE,
  rss_curve: RSS_CURVE_PROFILE,
};

/** Get a profile by ID, applying any user overrides */
export function getProfile(
  profileId: string,
  overrides: Record<string, string> = {},
): WitsChannelProfile {
  const base = PROFILES[profileId] ?? GENERIC_PROFILE;
  if (Object.keys(overrides).length === 0) return base;

  return {
    ...base,
    channels: { ...base.channels, ...overrides } as WitsChannelProfile['channels'],
  };
}
