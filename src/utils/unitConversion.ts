/** Convert feet to meters */
export function ftToM(ft: number): number {
  return ft * 0.3048;
}

/** Convert meters to feet */
export function mToFt(m: number): number {
  return m / 0.3048;
}

/**
 * Convert DLS from °/100ft to °/30m.
 * °/30m = °/100ft × (30 / (100 × 0.3048)) = °/100ft × 0.9842519685
 */
export function dlsPer100ftToPer30m(dlsPer100ft: number): number {
  return dlsPer100ft * (30 / (100 * 0.3048));
}

/** Convert DLS from °/30m to °/100ft */
export function dlsPer30mToPer100ft(dlsPer30m: number): number {
  return dlsPer30m / (30 / (100 * 0.3048));
}

/**
 * Format a depth value based on unit system.
 * Imperial: feet, Metric: meters.
 */
export function convertDepth(ft: number, unitSystem: 'imperial' | 'metric'): number {
  return unitSystem === 'metric' ? ftToM(ft) : ft;
}

/**
 * Format a DLS value based on normalization preference.
 */
export function convertDLS(
  dlsPer100ft: number,
  normalization: 'per100ft' | 'per30m',
): number {
  return normalization === 'per30m' ? dlsPer100ftToPer30m(dlsPer100ft) : dlsPer100ft;
}
