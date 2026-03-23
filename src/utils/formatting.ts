/** Format a number to N decimal places */
export function toFixed(value: number | null | undefined, decimals: number = 2): string {
  if (value == null || isNaN(value)) return '—';
  return value.toFixed(decimals);
}

/** Format an angle in degrees with ° suffix */
export function formatAngle(degrees: number | null | undefined, decimals: number = 2): string {
  if (degrees == null || isNaN(degrees)) return '—';
  return `${degrees.toFixed(decimals)}°`;
}

/** Format a depth in feet or meters with unit suffix */
export function formatDepth(
  ft: number | null | undefined,
  unitSystem: 'imperial' | 'metric' = 'imperial',
): string {
  if (ft == null || isNaN(ft)) return '—';
  if (unitSystem === 'metric') {
    return `${(ft * 0.3048).toFixed(1)} m`;
  }
  return `${ft.toFixed(1)} ft`;
}

/** Format DLS with unit suffix */
export function formatDLS(
  value: number | null | undefined,
  normalization: 'per100ft' | 'per30m' = 'per100ft',
): string {
  if (value == null || isNaN(value)) return '—';
  const unit = normalization === 'per30m' ? '°/30m' : '°/100ft';
  return `${value.toFixed(2)} ${unit}`;
}

/** Format duty cycle as percentage */
export function formatDC(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}
