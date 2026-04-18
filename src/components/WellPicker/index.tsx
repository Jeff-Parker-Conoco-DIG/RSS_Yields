import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppHeader } = require('@corva/ui/componentsV2');

interface WellPickerProps {
  /** Platform-provided header props (title, annotations, etc.) */
  appHeaderProps?: Record<string, unknown>;
}

/**
 * Corva's stock AppHeader. With manifest `use_app_header_v3: true`, it
 * renders the V3 title bar whose title menu exposes the built-in rig+well
 * AssetSelector (the same one the Slide Sheet and BHA-Intelligence apps use).
 *
 * It reads the current asset from the AppCommonsProvider that
 * dc-platform-shared wraps every app in, and writes selected rig/well IDs
 * back via `onSettingsChange` — causing the platform to refetch the well
 * and re-render this app with a new `well.asset_id` prop. All per-well
 * hooks (useReadings, useFormations, useDrillstringInfo) key on that
 * asset_id and reload automatically.
 *
 * `require` instead of ESM import because in local dev @corva/ui is
 * externalized to a global; a missing piece on older shell versions
 * shouldn't crash the whole bundle.
 */
export const WellPicker: React.FC<WellPickerProps> = ({ appHeaderProps }) => {
  if (!AppHeader) return null;
  return <AppHeader {...(appHeaderProps ?? {})} />;
};
