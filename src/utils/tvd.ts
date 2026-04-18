import { deltaTvd } from '../calculations/surveyMath';

/** Minimal shape we need from a Corva MWD survey station. */
export interface SurveyStation {
  measured_depth: number;
  inclination: number;
  azimuth?: number;
  /** TVD if Corva's min-curvature computation produced it — different wells
   *  use different field names, so we look for several. */
  tvd?: number;
  true_vertical_depth?: number;
  /** North-south and east-west offsets (not used for TVD but useful
   *  downstream if consumer apps want position). */
  ns?: number;
  ew?: number;
}

/** Normalize a raw Corva station record into our `SurveyStation` shape. */
export function parseStation(raw: unknown): SurveyStation | null {
  const s = raw as Record<string, unknown>;
  const md = Number(s.measured_depth);
  const inc = Number(s.inclination);
  if (!Number.isFinite(md) || !Number.isFinite(inc) || md <= 0) return null;
  return {
    measured_depth: md,
    inclination: inc,
    azimuth: typeof s.azimuth === 'number' ? s.azimuth : undefined,
    tvd: typeof s.tvd === 'number' ? s.tvd : undefined,
    true_vertical_depth:
      typeof s.true_vertical_depth === 'number' ? s.true_vertical_depth : undefined,
    ns: typeof s.ns === 'number' ? s.ns : undefined,
    ew: typeof s.ew === 'number' ? s.ew : undefined,
  };
}

/** Extract TVD from a station, trying both common field names. */
function stationTvd(s: SurveyStation): number | null {
  if (Number.isFinite(s.tvd)) return s.tvd as number;
  if (Number.isFinite(s.true_vertical_depth)) return s.true_vertical_depth as number;
  return null;
}

/**
 * Interpolate TVD at a given measured depth using the nearest bracketing
 * survey stations. `stations` must be sorted by `measured_depth` ascending.
 *
 * Strategy:
 *   - If `md` is above the first station's md, return null (no coverage).
 *   - If `md` is at or below the deepest station's md, use the last two
 *     stations to extrapolate via min-curvature using the reading's own
 *     `currentInc` / `currentAz` — this handles the common case where the
 *     bit has advanced past the last MWD survey.
 *   - Otherwise, find the bracket [below, above] and interpolate TVD
 *     linearly in MD (close enough for typical 30-90 ft station spacing).
 *
 * `currentInc` / `currentAz` are optional; if provided, they're used for
 * the min-curvature extrapolation beyond the last station. Without them,
 * the last station's TVD is returned unchanged (TVD freeze below surveys).
 */
export function interpolateTvdAtMd(
  md: number,
  stations: SurveyStation[],
  currentInc?: number | null,
  currentAz?: number | null,
): number | null {
  if (!Number.isFinite(md) || stations.length === 0) return null;

  // Stations below target md (sorted ascending, so last qualifying one is
  // the closest below).
  let below: SurveyStation | null = null;
  let above: SurveyStation | null = null;
  for (const s of stations) {
    if (s.measured_depth <= md) {
      below = s;
    } else if (above == null) {
      above = s;
      break;
    }
  }

  if (below == null) return null; // target MD is above the shallowest station

  const belowTvd = stationTvd(below);
  if (belowTvd == null) return null;

  // Bracketed case: interpolate linearly between `below` and `above`.
  if (above != null) {
    const aboveTvd = stationTvd(above);
    if (aboveTvd != null) {
      const dMd = above.measured_depth - below.measured_depth;
      if (dMd > 0) {
        const t = (md - below.measured_depth) / dMd;
        return belowTvd + t * (aboveTvd - belowTvd);
      }
    }
  }

  // Extrapolation case: `md` is past the last station. If we have the
  // bit's current inc/az, use min-curvature from the last station to the
  // bit. Otherwise return the last station's TVD (conservative — will be
  // too shallow for lateral wells, but better than null).
  const deltaMd = md - below.measured_depth;
  if (deltaMd <= 0) return belowTvd;
  const inc2 = Number.isFinite(currentInc ?? NaN) ? (currentInc as number) : below.inclination;
  const az2 = Number.isFinite(currentAz ?? NaN)
    ? (currentAz as number)
    : (below.azimuth ?? 0);
  const az1 = below.azimuth ?? az2;
  return belowTvd + deltaTvd(below.inclination, inc2, az1, az2, deltaMd);
}
