import { useMemo } from 'react';
import type { AppSettingsData } from '../types';
import type { WitsChannelProfile } from '../witsMapper/types';
import { DEFAULT_SETTINGS } from '../constants';
import { getProfile } from '../witsMapper';

export interface UseSettingsResult {
  settings: AppSettingsData;
  profile: WitsChannelProfile;
}

/**
 * Resolves app settings with defaults and builds the active WITS channel profile.
 */
export function useSettings(appSettings?: Partial<AppSettingsData>): UseSettingsResult {
  const settings: AppSettingsData = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...appSettings }),
    [appSettings],
  );

  const profile = useMemo(
    () => getProfile(settings.activeProfile, settings.customChannelOverrides),
    [settings.activeProfile, settings.customChannelOverrides],
  );

  return { settings, profile };
}
