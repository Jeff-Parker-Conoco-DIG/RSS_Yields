import { ICRUISE_PROFILE, POWERDRIVE_PROFILE, getProfile, PROFILES } from '../witsMapper';
import { resolveChannel } from '../api/witsChannelMap';
import { REQUIRED_CHANNELS } from '../witsMapper/types';

describe('channelProfiles', () => {
  it('all built-in profiles have all required channels', () => {
    for (const [id, profile] of Object.entries(PROFILES)) {
      for (const key of REQUIRED_CHANNELS) {
        expect(profile.channels[key]).toBeTruthy();
      }
    }
  });

  it('iCruise profile uses wits+cerebro data source', () => {
    expect(ICRUISE_PROFILE.dataSource).toBe('wits+cerebro');
  });

  it('PowerDrive profile uses wits data source', () => {
    expect(POWERDRIVE_PROFILE.dataSource).toBe('wits');
  });

  it('iCruise has optional Cerebro channels', () => {
    expect(ICRUISE_PROFILE.channels.turbineRPM).toBeDefined();
    expect(ICRUISE_PROFILE.channels.bitRPM).toBeDefined();
  });
});

describe('getProfile', () => {
  it('returns base profile when no overrides', () => {
    const profile = getProfile('icruise');
    expect(profile).toEqual(ICRUISE_PROFILE);
  });

  it('applies channel overrides', () => {
    const profile = getProfile('icruise', { nearBitInc: 'custom_inc_channel' });
    expect(profile.channels.nearBitInc).toBe('custom_inc_channel');
    // Other channels unchanged
    expect(profile.channels.nearBitAz).toBe(ICRUISE_PROFILE.channels.nearBitAz);
  });

  it('falls back to generic profile for unknown ID', () => {
    const profile = getProfile('nonexistent');
    expect(profile.id).toBe('custom');
  });
});

describe('resolveChannel', () => {
  it('resolves iCruise Cerebro channels to cerebro dataset', () => {
    const result = resolveChannel(ICRUISE_PROFILE, 'dutyCycle');
    expect(result).not.toBeNull();
    expect(result!.dataset).toBe('corva/drilling.halliburton.cerebro-raw');
    expect(result!.field).toBe('data.iCDutyCycle');
  });

  it('resolves iCruise nearBitInc to cerebro dataset (iC prefix)', () => {
    const result = resolveChannel(ICRUISE_PROFILE, 'nearBitInc');
    expect(result).not.toBeNull();
    // iCInc starts with 'iC' and profile includes cerebro → cerebro dataset
    expect(result!.dataset).toBe('corva/drilling.halliburton.cerebro-raw');
    expect(result!.field).toBe('data.iCInc');
  });

  it('resolves PowerDrive channels to wits dataset', () => {
    const result = resolveChannel(POWERDRIVE_PROFILE, 'dutyCycle');
    expect(result).not.toBeNull();
    expect(result!.dataset).toBe('corva/wits.summary-1ft');
    expect(result!.field).toBe('data.steering_ratio');
  });

  it('returns null for undefined optional channel', () => {
    const result = resolveChannel(POWERDRIVE_PROFILE, 'turbineRPM');
    expect(result).toBeNull();
  });
});
