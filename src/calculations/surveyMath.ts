const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ─── Core Survey Calculations ──────────────────────────────────────

/** Course length between two measured depths */
export function courseLength(md1: number, md2: number): number {
  return Math.abs(md2 - md1);
}

/** Normalize azimuth delta to [-180, 180] */
export function azimuthDelta(az1: number, az2: number): number {
  let d = az2 - az1;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Build rate in °/100ft (change in inclination per 100ft) */
export function buildRate(inc1: number, inc2: number, courseLengthFt: number): number {
  if (courseLengthFt === 0) return 0;
  return ((inc2 - inc1) / courseLengthFt) * 100;
}

/** Turn rate in °/100ft (change in azimuth per 100ft, handles 0/360 wrapping) */
export function turnRate(az1: number, az2: number, courseLengthFt: number): number {
  if (courseLengthFt === 0) return 0;
  return (azimuthDelta(az1, az2) / courseLengthFt) * 100;
}

/**
 * Dogleg severity using the minimum curvature method (°/100ft).
 *
 * DLS = arccos[ cos(I2-I1) - sin(I1)·sin(I2)·(1 - cos(Az2-Az1)) ] × (100 / CL)
 *
 * This is the industry standard 3D curvature metric that combines both
 * inclination and azimuth changes into a single angular rate.
 *
 * Important: DLS ≠ sqrt(BR² + TR²) except when inclination ≈ 90°.
 * At low inclinations, azimuth changes contribute less to DLS.
 */
export function dls(
  inc1: number,
  inc2: number,
  az1: number,
  az2: number,
  courseLengthFt: number,
): number {
  if (courseLengthFt === 0) return 0;

  const i1 = inc1 * DEG;
  const i2 = inc2 * DEG;
  const dAz = azimuthDelta(az1, az2) * DEG;
  const dInc = (inc2 - inc1) * DEG;

  const cosTheta = Math.cos(dInc) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(dAz));

  // Clamp to [-1, 1] to avoid NaN from floating-point drift
  const clamped = Math.max(-1, Math.min(1, cosTheta));
  const theta = Math.acos(clamped);

  return (theta / DEG / courseLengthFt) * 100;
}

// ─── Toolface Decomposition ────────────────────────────────────────
//
// An RSS steers by applying curvature in a direction defined by the
// gravity toolface angle. The toolface determines how the total DLS
// splits between build (vertical plane) and turn (horizontal plane):
//
//   TF = 0°   → pure build (increase inclination)
//   TF = 90°  → pure right turn
//   TF = 180° → pure drop (decrease inclination)
//   TF = 270° → pure left turn
//
// For a given duty cycle (DC, 0-100%) and toolface (TF, degrees):
//   Build command = (DC/100) × cos(TF)
//   Turn command  = (DC/100) × sin(TF)
//
// These decomposed values are what we regress against actual MWD BR/TR
// to determine the tool's yield (steering efficiency) in each axis.

/**
 * Decompose a duty cycle + toolface into build and turn command components.
 *
 * @param dutyCyclePct - Duty cycle 0-100%
 * @param toolFaceDeg - Gravity toolface in degrees (0=high side/build)
 * @returns { buildCommand, turnCommand } where:
 *   buildCommand > 0 means commanding build, < 0 means commanding drop
 *   turnCommand > 0 means commanding right turn, < 0 means left turn
 */
export function decomposeSteeringCommand(
  dutyCyclePct: number,
  toolFaceDeg: number,
): { buildCommand: number; turnCommand: number } {
  const dcFraction = dutyCyclePct / 100;
  const tfRad = toolFaceDeg * DEG;
  return {
    buildCommand: dcFraction * Math.cos(tfRad),
    turnCommand: dcFraction * Math.sin(tfRad),
  };
}

/**
 * Given actual MWD BR/TR, back-calculate what toolface and DLS magnitude
 * the tool effectively steered at. Useful for comparing commanded vs actual
 * steering direction.
 *
 * @param br - Build rate °/100ft (from MWD)
 * @param tr - Turn rate °/100ft (from MWD)
 * @param inclination - Current inclination in degrees (needed for true DLS)
 * @returns { effectiveTF, effectiveDLS }
 */
export function effectiveToolface(
  br: number,
  tr: number,
  inclination: number,
): { effectiveTF: number; effectiveDLS: number } {
  // Convert turn rate back to angular contribution using sin(inc)
  // At 90° inc, TR directly equals the azimuth component of DLS
  // At low inc, same TR represents less actual curvature
  const sinInc = Math.sin(inclination * DEG);

  // The effective toolface from observed rates
  // Build component = DLS × cos(TF)
  // Turn component (in hole frame) = DLS × sin(TF)
  // But TR as calculated is azimuth change, which relates to DLS via sin(inc)
  const turnContribution = sinInc > 0.05 ? tr * sinInc : 0;

  let tf = Math.atan2(turnContribution, br) * RAD;
  if (tf < 0) tf += 360;

  const effectiveDLS = Math.sqrt(br * br + turnContribution * turnContribution);

  return { effectiveTF: tf, effectiveDLS: effectiveDLS };
}

// ─── Circular Mean for Toolface Averaging ──────────────────────────
//
// You can't simply average angles (e.g., 350° and 10° → 180° is wrong).
// Use the circular mean: average the unit vectors, then take atan2.

/**
 * Circular mean of angles in degrees. Returns 0-360.
 * Returns null if the input is empty.
 */
export function circularMeanDeg(angles: number[]): number | null {
  if (angles.length === 0) return null;

  let sumSin = 0;
  let sumCos = 0;
  for (const a of angles) {
    sumSin += Math.sin(a * DEG);
    sumCos += Math.cos(a * DEG);
  }

  let mean = Math.atan2(sumSin / angles.length, sumCos / angles.length) * RAD;
  if (mean < 0) mean += 360;
  return mean;
}

/**
 * Circular standard deviation of angles in degrees.
 * Based on the mean resultant length R:
 *   R = sqrt( (Σcos)² + (Σsin)² ) / n
 *   σ = sqrt( -2 × ln(R) )  [in radians, then convert]
 *
 * Returns degrees. If R ≈ 0 (angles uniformly distributed), returns 180.
 */
export function circularStdDevDeg(angles: number[]): number | null {
  if (angles.length < 2) return null;

  let sumSin = 0;
  let sumCos = 0;
  for (const a of angles) {
    sumSin += Math.sin(a * DEG);
    sumCos += Math.cos(a * DEG);
  }

  const n = angles.length;
  const R = Math.sqrt((sumSin / n) ** 2 + (sumCos / n) ** 2);

  if (R < 1e-10) return 180; // Uniform distribution, no concentration
  if (R >= 1) return 0;      // All angles identical

  return Math.sqrt(-2 * Math.log(R)) * RAD;
}
