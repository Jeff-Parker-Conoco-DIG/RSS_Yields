import type { WitsChannelProfile, ChannelMapping } from '../witsMapper/types';

export interface ResolvedChannel {
  dataset: string;
  field: string;
}

/**
 * Resolves a logical channel name (e.g. 'nearBitInc') to the concrete
 * dataset + field path based on the active WITS channel profile.
 *
 * For takeReading snapshots, the dataset doesn't matter since we fetch
 * the full raw WITS record and extract by field name. But this resolver
 * is also used by the interval-based WITS fetcher and channel discovery.
 *
 * NOTE: iCruise channels (iCInc, iCAzim, iCDutyCycle, etc.) are present
 * in BOTH the raw WITS dataset and the Cerebro dataset. When the profile
 * dataSource includes 'cerebro', we route iC-prefixed channels to Cerebro
 * as a fallback, but for snapshots we read from raw WITS first.
 */
export function resolveChannel(
  profile: WitsChannelProfile,
  channel: keyof ChannelMapping,
): ResolvedChannel | null {
  const mnemonic = profile.channels[channel];
  if (!mnemonic) return null;

  // All channels resolve to their field name under data.*
  // The dataset is informational — takeReading reads from corva/wits directly
  return {
    dataset: 'corva/wits',
    field: `data.${mnemonic}`,
  };
}

/**
 * Resolve all required channels for a profile, returning a map of
 * logical channel → resolved dataset/field.
 */
export function resolveAllChannels(
  profile: WitsChannelProfile,
): Record<string, ResolvedChannel | null> {
  const keys: (keyof ChannelMapping)[] = [
    'nearBitInc',
    'nearBitAz',
    'mwdInc',
    'mwdAz',
    'dutyCycle',
    'toolFaceSet',
    'toolFaceActual',
    'steeringForce',
    'turbineRPM',
    'peakLateral',
    'hfto',
    'bitRPM',
  ];

  const result: Record<string, ResolvedChannel | null> = {};
  for (const key of keys) {
    result[key] = resolveChannel(profile, key);
  }
  return result;
}
