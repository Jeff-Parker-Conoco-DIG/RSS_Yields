import { simpleYield, computeYieldAnalysis, estimateMotorContribution } from '../calculations/yieldCalc';
import type { YieldDataPoint } from '../calculations/yieldCalc';

function makePoint(overrides: Partial<YieldDataPoint> = {}): YieldDataPoint {
  return {
    courseLength: 100,
    mwdBUR: 2,
    mwdTUR: 1,
    mwdDLS: 2.5,
    avgDutyCycle: 50,
    buildCommand: 0.5,
    turnCommand: 0.3,
    ...overrides,
  };
}

describe('simpleYield', () => {
  it('calculates DLS per duty cycle percentage', () => {
    expect(simpleYield(5.0, 50)).toBeCloseTo(0.1);
  });

  it('returns null when duty cycle is null', () => {
    expect(simpleYield(5.0, null)).toBeNull();
  });

  it('returns null when duty cycle is 0', () => {
    expect(simpleYield(5.0, 0)).toBeNull();
  });
});

describe('computeYieldAnalysis', () => {
  it('returns null regressions for fewer than 3 valid points', () => {
    const result = computeYieldAnalysis([makePoint()]);
    expect(result.overallDLS).toBeNull();
  });

  it('returns null regressions for empty array', () => {
    const result = computeYieldAnalysis([]);
    expect(result.overallDLS).toBeNull();
  });

  it('fits a linear relationship for overall DLS', () => {
    const points = [
      makePoint({ avgDutyCycle: 20, mwdDLS: 2.0 }),
      makePoint({ avgDutyCycle: 40, mwdDLS: 4.0 }),
      makePoint({ avgDutyCycle: 60, mwdDLS: 6.0 }),
      makePoint({ avgDutyCycle: 80, mwdDLS: 8.0 }),
    ];

    const result = computeYieldAnalysis(points);
    expect(result.overallDLS).not.toBeNull();
    expect(result.overallDLS!.slope).toBeCloseTo(0.1);
    expect(result.overallDLS!.intercept).toBeCloseTo(0, 5);
    expect(result.overallDLS!.rSquared).toBeCloseTo(1.0, 5);
  });

  it('handles noisy data with reasonable R²', () => {
    const points = [
      makePoint({ avgDutyCycle: 20, mwdDLS: 2.2 }),
      makePoint({ avgDutyCycle: 40, mwdDLS: 3.8 }),
      makePoint({ avgDutyCycle: 60, mwdDLS: 6.5 }),
      makePoint({ avgDutyCycle: 80, mwdDLS: 7.5 }),
    ];

    const result = computeYieldAnalysis(points);
    expect(result.overallDLS).not.toBeNull();
    expect(result.overallDLS!.slope).toBeGreaterThan(0);
    expect(result.overallDLS!.rSquared).toBeGreaterThan(0.9);
  });

  it('filters out points with null duty cycle', () => {
    const points = [
      makePoint({ avgDutyCycle: null, mwdDLS: 5 }),
      makePoint({ avgDutyCycle: 30, mwdDLS: 3 }),
      makePoint({ avgDutyCycle: 60, mwdDLS: 6 }),
      makePoint({ avgDutyCycle: 90, mwdDLS: 9 }),
    ];

    const result = computeYieldAnalysis(points);
    expect(result.overallDLS).not.toBeNull();
    expect(result.overallDLS!.n).toBe(3);
  });
});

describe('estimateMotorContribution', () => {
  it('calculates motor max DLS from bend angle and yield', () => {
    const result = estimateMotorContribution(1.5, 3.0);
    expect(result.motorMaxDLS).toBeCloseTo(4.5);
  });

  it('returns zero when bend angle is null', () => {
    const result = estimateMotorContribution(null, 3.0);
    expect(result.motorMaxDLS).toBe(0);
  });

  it('returns zero when yield is null', () => {
    const result = estimateMotorContribution(1.5, null);
    expect(result.motorMaxDLS).toBe(0);
  });
});
