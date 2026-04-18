import type { SlideInterval } from '../types';

const FALLBACK_MAX_GAP_FT = 5;

export interface SlideWindowResult {
  active: SlideInterval | null;
  mode: 'active' | 'fallback' | 'none';
  slideSeen: number;
  slideAhead: number;
  slideStartDepth: number | null;
  slideEndDepth: number | null;
  tfAccuracy: number | null;
}

export interface SlideWindowPrevious {
  slideSeen: number | null;
  slideAhead: number | null;
  slideStartDepth: number | null;
  slideEndDepth: number | null;
}

function overlapLength(
  fromDepth: number,
  toDepth: number,
  interval: SlideInterval,
): number {
  const overlapFrom = Math.max(fromDepth, interval.fromDepth);
  const overlapTo = Math.min(toDepth, interval.toDepth);
  return overlapTo > overlapFrom ? overlapTo - overlapFrom : 0;
}

export function computeSlideWindow(
  bitDepth: number,
  sensorDepth: number,
  intervals: SlideInterval[],
  tfWindowFromDepth: number = sensorDepth,
): SlideWindowResult {
  const slides = intervals.filter((iv) => iv.isSlide);
  const windowFrom = Math.min(tfWindowFromDepth, bitDepth);
  const windowTo = Math.max(tfWindowFromDepth, bitDepth);

  let tfWeightedFeet = 0;
  let tfWeightedSum = 0;
  for (const iv of slides) {
    if (iv.tfoAccuracy == null) continue;
    const ft = overlapLength(windowFrom, windowTo, iv);
    if (ft <= 0) continue;
    tfWeightedFeet += ft;
    tfWeightedSum += iv.tfoAccuracy * ft;
  }
  const tfAccuracy = tfWeightedFeet > 0 ? tfWeightedSum / tfWeightedFeet : null;

  let active: SlideInterval | null = null;
  for (const iv of slides) {
    if (iv.fromDepth < bitDepth && iv.toDepth > sensorDepth) {
      if (!active || iv.fromDepth > active.fromDepth) active = iv;
    }
  }

  if (active) {
    const slideSeen = Math.max(0, Math.min(sensorDepth, active.toDepth) - active.fromDepth);
    const slideAhead = Math.max(
      0,
      Math.min(bitDepth, active.toDepth) - Math.max(sensorDepth, active.fromDepth),
    );
    return {
      active,
      mode: 'active',
      slideSeen,
      slideAhead,
      slideStartDepth: active.fromDepth,
      slideEndDepth: active.toDepth,
      tfAccuracy: tfAccuracy ?? active.tfoAccuracy ?? null,
    };
  }

  let bestBefore: SlideInterval | null = null;
  for (const iv of slides) {
    if (iv.toDepth <= sensorDepth) {
      if (!bestBefore || iv.toDepth > bestBefore.toDepth) bestBefore = iv;
    }
  }

  if (bestBefore) {
    const gapFromSensor = Math.max(0, sensorDepth - bestBefore.toDepth);
    if (gapFromSensor > FALLBACK_MAX_GAP_FT) {
      return {
        active: null,
        mode: 'none',
        slideSeen: 0,
        slideAhead: 0,
        slideStartDepth: null,
        slideEndDepth: null,
        tfAccuracy,
      };
    }
    return {
      active: bestBefore,
      mode: 'fallback',
      slideSeen: Math.max(0, bestBefore.toDepth - bestBefore.fromDepth),
      slideAhead: 0,
      slideStartDepth: bestBefore.fromDepth,
      slideEndDepth: bestBefore.toDepth,
      tfAccuracy,
    };
  }

  return {
    active: null,
    mode: 'none',
    slideSeen: 0,
    slideAhead: 0,
    slideStartDepth: null,
    slideEndDepth: null,
    tfAccuracy,
  };
}

export function suppressRepeatedFallbackSlide(
  current: SlideWindowResult,
  previous: SlideWindowPrevious | null,
): SlideWindowResult {
  if (current.mode !== 'fallback' || !previous) return current;
  if (current.slideStartDepth == null || current.slideEndDepth == null) return current;

  const sameSlide =
    previous.slideStartDepth === current.slideStartDepth &&
    previous.slideEndDepth === current.slideEndDepth;
  if (!sameSlide) return current;

  const slideLength = current.slideEndDepth - current.slideStartDepth;
  const prevWasCompletedFallback =
    previous.slideAhead === 0 &&
    previous.slideSeen != null &&
    Math.abs(previous.slideSeen - slideLength) < 0.01;

  if (!prevWasCompletedFallback) return current;

  return {
    active: null,
    mode: 'none',
    slideSeen: 0,
    slideAhead: 0,
    slideStartDepth: null,
    slideEndDepth: null,
    tfAccuracy: null,
  };
}
