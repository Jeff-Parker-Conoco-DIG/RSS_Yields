import type { WitsChannelProfile, ResolvedChannelMap } from './types';

export const ICRUISE_PROFILE: WitsChannelProfile = {
  id: 'icruise',
  vendorName: 'Halliburton iCruise',
  toolType: 'rss',
  channels: {
    // RSS near-bit sensors (~8ft from bit)
    nearBitInc: 'rss_continuous_inclination',  // WITS 862 → iCInc
    nearBitAz: 'rss_continuous_azimuth',       // WITS 868 → iCAzim
    // MWD sensors (~38-90ft from bit)
    mwdInc: 'continuous_inclination',           // MWD continuous inc
    mwdAz: 'mwd_continuous_azimuth',            // MWD continuous az
    // Steering
    dutyCycle: 'rsspsum',                       // WITS 880 → iCDutyCycle (RSS Possum, 0-100%)
    toolFaceSet: 'gravity_tool_face',           // Gravity toolface — on iCruise this is the commanded TF
    toolFaceActual: 'gravity_tool_face',        // Same channel — iCruise reports set/actual on same field
    steeringForce: 'rsspsum',                   // Same as dutyCycle on iCruise
    // Diagnostics (confirmed from channel discovery on Nabors X04)
    turbineRPM: 'rsslowtorqrpm',                // (1700.00) RSS turbine RPM
    peakLateral: 'rsswhirl',                    // (1.00) RSS whirl/lateral vibe
    hfto: '',                                   // Not available in WITS on this well
    bitRPM: '',                                 // Not available in WITS on this well
  },
  dataSource: 'wits',
};

/**
 * Full iCruise WITS channel reference (RigCloud renames):
 *
 * WITS  | RigCloud Name                          | RigCloud Rename  | Profile Key
 * ------|----------------------------------------|------------------|------------
 * 862   | RSS Inclination                        | iCInc            | nearBitInc
 * 868   | RSS Azimuth                            | iCAzim           | nearBitAz
 * 865   | RSS Inclination Target                 | iCIncSet         | (not mapped)
 * 867   | RSS Azimuth Target                     | iCAzimSet        | (not mapped)
 * 880   | RSS Possum                             | iCDutyCycle      | dutyCycle
 * 871   | RSS Toolface Type                      | iCTFSet          | toolFaceSet
 * 878   | RSS Lower Torque RPM                   | iCTurbRPM        | turbineRPM
 * 904   | Icruise HFTO                           | Icruise HFTO     | hfto
 * 7099  | MWD Low Shock and Vibe Alarm Threshold | iCHFTO           | (alt hfto)
 * 905   | RSS RTSTAT2                            | iCIncSrc         | (not mapped)
 * 907   | RSS RTSTAT3                            | iCMode           | (not mapped)
 * 913   | RSS RTSTAT4                            | iCTFStdDev       | (not mapped - calculated)
 * 916   | RSS Shock Radial                       | iCAvgLatX        | (not mapped)
 * 919   | RSS Vibe Radial                        | iCPeakLateral    | peakLateral
 * 921   | RSS GRRAW                              | iCToolConfig     | (not mapped)
 * 923   | MWD Telemetry Mode                     | iCAzimSource     | (not mapped)
 * 946   | MWD Axial SHK Peak                     | iCruise Peak Axial Vib (Z) | (not mapped)
 * 947   | MWD Lateral SHK Peak                   | iCruise Peak Lat Vib (x)   | (not mapped)
 * 851   | RSS Shock Axial                        | iCPeakAxial      | (not mapped)
 * 849   | RSS Shock Lateral                      | iCAvgLatY        | (not mapped)
 * 869   | RSS RTSTAT                             | iCTFSrc          | (not mapped)
 * 967   | MWD RPM Tool Min                       | iCCRPM           | bitRPM
 * 7070  | RSS Stick Slip Indicator               | iCSSlip          | (not mapped)
 * 9058  | MWD APWD                               | iCruise Diff Pressure | (not mapped)
 * 915   | MWD Med Shock and Vibe Alarm Threshold | iCAvgAxial       | (not mapped)
 */

export const POWERDRIVE_PROFILE: WitsChannelProfile = {
  id: 'powerdrive',
  vendorName: 'SLB PowerDrive',
  toolType: 'rss',
  channels: {
    nearBitInc: 'continuous_inclination',
    nearBitAz: 'mwd_continuous_azimuth',
    mwdInc: 'continuous_inclination',
    mwdAz: 'mwd_continuous_azimuth',
    dutyCycle: 'steering_ratio',
    toolFaceSet: 'toolface_setpoint',
    toolFaceActual: 'toolface_actual',
    steeringForce: 'steering_force',
  },
  dataSource: 'wits',
};

export const GENERIC_PROFILE: WitsChannelProfile = {
  id: 'custom',
  vendorName: 'Custom / Generic',
  toolType: 'rss',
  channels: {
    nearBitInc: 'continuous_inclination',
    nearBitAz: 'mwd_continuous_azimuth',
    mwdInc: 'continuous_inclination',
    mwdAz: 'mwd_continuous_azimuth',
    dutyCycle: 'duty_cycle',
    toolFaceSet: 'toolface_set',
    toolFaceActual: 'toolface_actual',
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
  toolType: 'motor',
  channels: {
    nearBitInc: 'continuous_inclination',    // MWD inc
    nearBitAz: '',                           // Azimuth ignored in curve
    mwdInc: 'continuous_inclination',
    mwdAz: 'mwd_continuous_azimuth',
    dutyCycle: 'duty_cycle',
    toolFaceSet: 'toolface_set',
    toolFaceActual: 'toolface_actual',
    steeringForce: 'steering_force',
  },
  dataSource: 'wits',
};

export const RSS_CURVE_PROFILE: WitsChannelProfile = {
  id: 'rss_curve',
  vendorName: 'RSS Curve',
  toolType: 'rss',
  channels: {
    nearBitInc: 'rss_continuous_inclination', // RSS inc
    nearBitAz: '',                            // Azimuth ignored in curve
    mwdInc: 'continuous_inclination',
    mwdAz: '',
    dutyCycle: 'rsspsum',
    toolFaceSet: 'gravity_tool_face',
    toolFaceActual: 'gravity_tool_face',
    steeringForce: 'rsspsum',
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

/**
 * Build a ResolvedChannelMap from a profile + user overrides.
 * This is the ONLY function that creates the resolved map.
 */
export function buildResolvedMap(
  profileId: string,
  overrides: Record<string, string> = {},
): ResolvedChannelMap {
  const profile = PROFILES[profileId] ?? GENERIC_PROFILE;
  return {
    nearBitInc: overrides.nearBitInc ?? profile.channels.nearBitInc,
    nearBitAz: overrides.nearBitAz ?? profile.channels.nearBitAz,
    mwdInc: overrides.mwdInc ?? profile.channels.mwdInc,
    mwdAz: overrides.mwdAz ?? profile.channels.mwdAz,
    dutyCycle: overrides.dutyCycle ?? profile.channels.dutyCycle,
    toolFaceSet: overrides.toolFaceSet ?? profile.channels.toolFaceSet,
    toolFaceActual: overrides.toolFaceActual ?? profile.channels.toolFaceActual,
    steeringForce: overrides.steeringForce ?? profile.channels.steeringForce,
    turbineRPM: overrides.turbineRPM ?? profile.channels.turbineRPM ?? '',
    peakLateral: overrides.peakLateral ?? profile.channels.peakLateral ?? '',
    hfto: overrides.hfto ?? profile.channels.hfto ?? '',
    bitRPM: overrides.bitRPM ?? profile.channels.bitRPM ?? '',
  };
}

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
