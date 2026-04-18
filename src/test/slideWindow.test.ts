import type { SlideInterval } from '../types';
import { computeSlideWindow, suppressRepeatedFallbackSlide } from '../utils/slideWindow';

function slide(
  fromDepth: number,
  toDepth: number,
  tfoAccuracy: number | null = null,
): SlideInterval {
  return {
    fromDepth,
    toDepth,
    isSlide: true,
    motorYield: null,
    buildRateSlide: null,
    effectiveToolface: null,
    tfoAccuracy,
  };
}

describe('computeSlideWindow', () => {
  it('uses the straddling active slide and computes seen/ahead on that slide only', () => {
    const intervals = [slide(100, 160), slide(170, 220)];
    const result = computeSlideWindow(210, 180, intervals);

    expect(result.slideStartDepth).toBe(170);
    expect(result.slideEndDepth).toBe(220);
    expect(result.slideSeen).toBe(10);
    expect(result.slideAhead).toBe(30);
  });

  it('falls back to the most recent completed slide when sensor is close behind that slide', () => {
    const intervals = [slide(100, 160), slide(170, 180, 58.33), slide(230, 250)];
    const result = computeSlideWindow(220, 182, intervals);

    expect(result.slideStartDepth).toBe(170);
    expect(result.slideEndDepth).toBe(180);
    expect(result.slideSeen).toBe(10);
    expect(result.slideAhead).toBe(0);
    expect(result.tfAccuracy).toBeNull();
  });

  it('returns zero seen/ahead and null bounds when no active or completed slide exists', () => {
    const intervals = [slide(300, 350)];
    const result = computeSlideWindow(220, 200, intervals);

    expect(result.active).toBeNull();
    expect(result.slideSeen).toBe(0);
    expect(result.slideAhead).toBe(0);
    expect(result.slideStartDepth).toBeNull();
    expect(result.slideEndDepth).toBeNull();
  });

  it('computes footage-weighted TF accuracy on overlap window and ignores null accuracies', () => {
    const intervals = [slide(100, 150, 80), slide(150, 220, 90), slide(220, 260, null)];
    const result = computeSlideWindow(230, 130, intervals);

    // Window [130,230]:
    // 100-150 contributes 20ft @80, 150-220 contributes 70ft @90, 220-260 ignored (null)
    // weighted = (20*80 + 70*90) / 90 = 87.777...
    expect(result.tfAccuracy).not.toBeNull();
    expect(result.tfAccuracy!).toBeCloseTo(87.7777, 3);
  });

  it('returns null TF accuracy when overlap footage with non-null values is zero', () => {
    const intervals = [slide(100, 150, null), slide(200, 240, 92)];
    const result = computeSlideWindow(190, 170, intervals);

    expect(result.tfAccuracy).toBeNull();
  });

  it('clears repeated completed fallback slide on the next reading', () => {
    const intervals = [slide(170, 180, 58.33)];
    const current = computeSlideWindow(220, 182, intervals);
    const suppressed = suppressRepeatedFallbackSlide(current, {
      slideSeen: 10,
      slideAhead: 0,
      slideStartDepth: 170,
      slideEndDepth: 180,
    });

    expect(current.mode).toBe('fallback');
    expect(suppressed.mode).toBe('none');
    expect(suppressed.slideSeen).toBe(0);
    expect(suppressed.slideAhead).toBe(0);
    expect(suppressed.slideStartDepth).toBeNull();
    expect(suppressed.slideEndDepth).toBeNull();
    expect(suppressed.tfAccuracy).toBeNull();
  });
});
