import type { YieldRegression, YieldAnalysis } from '../types';

/** Generic input shape for yield analysis — works with both v1 PairedStation and v2 YieldReading-derived data */
export interface YieldDataPoint {
  avgDutyCycle: number | null;
  courseLength: number;
  mwdDLS: number;
  mwdBUR: number;
  mwdTUR: number;
  buildCommand: number | null;
  turnCommand: number | null;
}

// ─── Simple Linear Regression Helper ───────────────────────────────

interface RegressionInput {
  x: number;
  y: number;
}

/**
 * Ordinary least squares linear regression: y = slope·x + intercept.
 * Returns null if fewer than 3 data points (need at least 3 for meaningful R²).
 */
function linearRegression(points: RegressionInput[]): YieldRegression | null {
  if (points.length < 3) return null;

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssTot += (p.y - meanY) ** 2;
    ssRes += (p.y - predicted) ** 2;
  }

  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared, n };
}

// ─── Yield Analysis ────────────────────────────────────────────────
//
// WHAT "YIELD" MEANS:
//
// RSS yield is the steering efficiency of the tool — how much curvature
// (DLS, build rate, or turn rate) the tool actually produces per unit
// of steering command (duty cycle).
//
// The key insight: at 0% duty cycle, curvature is NOT zero. Gravity,
// formation anisotropy, and BHA mechanics still cause the well to build,
// drop, or walk. This is the "natural tendency" and shows up as the
// intercept of the regression.
//
// The SLOPE of the regression is the true tool yield:
//   - Overall yield: °/100ft of DLS per 1% duty cycle
//   - Build yield:   °/100ft of build per unit build-command
//   - Turn yield:    °/100ft of turn per unit turn-command
//
// GROUND TRUTH:
//
// We regress against MWD-derived rates (mwdBUR, mwdTUR, mwdDLS) because
// MWD static surveys are the confirmed wellbore trajectory. RSS near-bit
// rates are a leading indicator useful for real-time display, but they
// are NOT the ground truth for tool performance evaluation.

/**
 * Simple per-interval yield metric: mwdDLS / dutyCycle.
 *
 * WARNING: This is a rough metric. It does NOT account for natural
 * tendency (the curvature that occurs at 0% DC). The regression slope
 * is a far more accurate measure of tool yield.
 *
 * Returns null if dutyCycle is null or ≤ 0.
 */
export function simpleYield(mwdDLS: number, dutyCyclePct: number | null): number | null {
  if (dutyCyclePct == null || dutyCyclePct <= 0) return null;
  return mwdDLS / dutyCyclePct;
}

/**
 * Full yield analysis with three regressions:
 *
 * 1. Overall DLS yield: mwdDLS (Y) vs dutyCycle% (X)
 *    - Tells you total curvature per % DC, regardless of direction
 *    - Intercept = natural DLS tendency at 0% steering
 *    - Slope = DLS yield per 1% DC
 *
 * 2. Build yield: mwdBUR (Y) vs buildCommand (X)
 *    - buildCommand = (DC/100) × cos(TF)
 *    - Isolates the build/drop axis of steering
 *    - Intercept = natural build/drop tendency
 *    - Slope = build yield per unit build-command
 *
 * 3. Turn yield: mwdTUR (Y) vs turnCommand (X)
 *    - turnCommand = (DC/100) × sin(TF)
 *    - Isolates the left/right turn axis of steering
 *    - Intercept = natural walk tendency
 *    - Slope = turn yield per unit turn-command
 *
 * Only includes stations where duty cycle and toolface data are available.
 */
export function computeYieldAnalysis(stations: YieldDataPoint[]): YieldAnalysis {
  // ── Overall DLS vs Duty Cycle ─────────────────────────────────
  const overallPoints: RegressionInput[] = [];
  for (const s of stations) {
    if (s.avgDutyCycle != null && s.courseLength > 0) {
      overallPoints.push({ x: s.avgDutyCycle, y: s.mwdDLS });
    }
  }

  // ── Build yield: mwdBUR vs buildCommand ───────────────────────
  const buildPoints: RegressionInput[] = [];
  for (const s of stations) {
    if (s.buildCommand != null && s.courseLength > 0) {
      buildPoints.push({ x: s.buildCommand, y: s.mwdBUR });
    }
  }

  // ── Turn yield: mwdTUR vs turnCommand ─────────────────────────
  const turnPoints: RegressionInput[] = [];
  for (const s of stations) {
    if (s.turnCommand != null && s.courseLength > 0) {
      turnPoints.push({ x: s.turnCommand, y: s.mwdTUR });
    }
  }

  return {
    overallDLS: linearRegression(overallPoints),
    buildYield: linearRegression(buildPoints),
    turnYield: linearRegression(turnPoints),
  };
}

/**
 * Predict expected curvature given steering parameters and a yield analysis.
 *
 * Useful for real-time: "given the current DC and TF, what DLS should
 * we expect based on historical performance on this run?"
 */
export function predictCurvature(
  dutyCyclePct: number,
  toolFaceDeg: number,
  analysis: YieldAnalysis,
): {
  expectedDLS: number | null;
  expectedBR: number | null;
  expectedTR: number | null;
} {
  const DEG = Math.PI / 180;
  const dcFrac = dutyCyclePct / 100;
  const bc = dcFrac * Math.cos(toolFaceDeg * DEG);
  const tc = dcFrac * Math.sin(toolFaceDeg * DEG);

  const expectedDLS = analysis.overallDLS
    ? analysis.overallDLS.slope * dutyCyclePct + analysis.overallDLS.intercept
    : null;

  const expectedBR = analysis.buildYield
    ? analysis.buildYield.slope * bc + analysis.buildYield.intercept
    : null;

  const expectedTR = analysis.turnYield
    ? analysis.turnYield.slope * tc + analysis.turnYield.intercept
    : null;

  return { expectedDLS, expectedBR, expectedTR };
}

/**
 * Estimate motor contribution to build/turn rate for hybrid motor+RSS BHA.
 *
 * In a MARSS (motor-assisted RSS) setup, the motor contributes additional
 * curvature on top of what the RSS pads produce. This is a rough estimate
 * based on the motor's bend angle and known yield characteristics.
 *
 * Motor yield is typically expressed as °/100ft per degree of bend angle
 * at a given WOB and RPM. This varies with formation and operating params.
 *
 * NOTE: This is approximate. Motor contribution is more complex in practice
 * as it depends on WOB, RPM, formation hardness, and the interaction
 * between motor and RSS steering vectors.
 */
export function estimateMotorContribution(
  bendAngle: number | null,
  motorYieldPerDegBend: number | null,
): { motorMaxDLS: number } {
  if (bendAngle == null || motorYieldPerDegBend == null) {
    return { motorMaxDLS: 0 };
  }
  return { motorMaxDLS: bendAngle * motorYieldPerDegBend };
}
