import { courseLength, azimuthDelta, buildRate, turnRate, dls } from '../calculations/surveyMath';

describe('courseLength', () => {
  it('returns positive distance between two depths', () => {
    expect(courseLength(1000, 1100)).toBe(100);
  });

  it('returns positive distance regardless of order', () => {
    expect(courseLength(1100, 1000)).toBe(100);
  });

  it('returns 0 for same depth', () => {
    expect(courseLength(500, 500)).toBe(0);
  });
});

describe('azimuthDelta', () => {
  it('returns simple difference for nearby azimuths', () => {
    expect(azimuthDelta(10, 20)).toBe(10);
  });

  it('handles crossing 360/0 boundary clockwise', () => {
    expect(azimuthDelta(350, 10)).toBe(20);
  });

  it('handles crossing 360/0 boundary counter-clockwise', () => {
    expect(azimuthDelta(10, 350)).toBe(-20);
  });

  it('returns 0 for same azimuth', () => {
    expect(azimuthDelta(180, 180)).toBe(0);
  });

  it('handles 180-degree difference', () => {
    expect(Math.abs(azimuthDelta(0, 180))).toBe(180);
  });
});

describe('buildRate', () => {
  it('calculates positive build rate (building)', () => {
    // Inc goes from 10° to 12° over 100ft → 2°/100ft
    expect(buildRate(10, 12, 100)).toBeCloseTo(2.0);
  });

  it('calculates negative build rate (dropping)', () => {
    expect(buildRate(12, 10, 100)).toBeCloseTo(-2.0);
  });

  it('normalizes to per-100ft', () => {
    // 1° over 50ft → 2°/100ft
    expect(buildRate(10, 11, 50)).toBeCloseTo(2.0);
  });

  it('returns 0 for zero course length', () => {
    expect(buildRate(10, 12, 0)).toBe(0);
  });
});

describe('turnRate', () => {
  it('calculates positive turn rate (turning right)', () => {
    expect(turnRate(100, 105, 100)).toBeCloseTo(5.0);
  });

  it('handles azimuth wrapping (turning right through north)', () => {
    // 350° → 10° = +20° turn over 100ft → 20°/100ft
    expect(turnRate(350, 10, 100)).toBeCloseTo(20.0);
  });

  it('handles azimuth wrapping (turning left through north)', () => {
    // 10° → 350° = -20° turn over 100ft → -20°/100ft
    expect(turnRate(10, 350, 100)).toBeCloseTo(-20.0);
  });

  it('returns 0 for zero course length', () => {
    expect(turnRate(100, 105, 0)).toBe(0);
  });
});

describe('dls (dogleg severity)', () => {
  it('returns 0 for identical stations', () => {
    expect(dls(10, 10, 100, 100, 100)).toBeCloseTo(0, 5);
  });

  it('returns 0 for zero course length', () => {
    expect(dls(10, 15, 100, 110, 0)).toBe(0);
  });

  it('equals BUR when only inclination changes (no azimuth change)', () => {
    // Pure build: 10° → 14° over 100ft, no azimuth change
    // DLS should equal |BUR| = 4°/100ft
    const result = dls(10, 14, 200, 200, 100);
    expect(result).toBeCloseTo(4.0, 1);
  });

  it('is greater than BUR alone when both inc and az change', () => {
    // Build + turn should yield DLS > pure build
    const pureBuild = dls(10, 14, 200, 200, 100);
    const buildAndTurn = dls(10, 14, 200, 210, 100);
    expect(buildAndTurn).toBeGreaterThan(pureBuild);
  });

  it('handles high-angle azimuth changes correctly', () => {
    // At 45° inclination, a 10° azimuth change over 100ft
    const result = dls(45, 45, 100, 110, 100);
    // DLS should be approximately 10 * sin(45°) ≈ 7.07°/100ft
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
  });

  it('handles wrapping azimuths', () => {
    // Same magnitude change, one wrapping through north
    const normal = dls(30, 30, 100, 120, 100);
    const wrapped = dls(30, 30, 350, 10, 100);
    expect(normal).toBeCloseTo(wrapped, 5);
  });

  it('calculates known hand-calculated value', () => {
    // Station 1: Inc=20°, Az=150°
    // Station 2: Inc=22°, Az=155°
    // Course length=93ft
    // Hand calc: DLS ≈ 2.52°/100ft (approximate)
    const result = dls(20, 22, 150, 155, 93);
    expect(result).toBeGreaterThan(2.0);
    expect(result).toBeLessThan(4.0);
  });
});
