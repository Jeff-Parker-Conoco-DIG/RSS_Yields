import { useMemo } from 'react';
import type { AppSettingsData } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

export interface UseSettingsResult {
  settings: AppSettingsData;
}

/**
 * Resolves app settings with defaults.
 * NOTE: RSS profile and channel overrides are managed locally (localStorage),
 * not through Corva app settings. This hook only handles display preferences.
 */
export function useSettings(appSettings?: Partial<AppSettingsData>): UseSettingsResult {
  const settings: AppSettingsData = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...appSettings }),
    [appSettings],
  );

  return { settings };
}
