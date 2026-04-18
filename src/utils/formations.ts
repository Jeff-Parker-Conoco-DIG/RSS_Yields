import type { FormationTop } from '../types';

/**
 * Returns the formation containing the given depths. In Corva's
 * data.formations dataset:
 *   • `md` is the measured-depth of the formation TOP
 *   • `td` is the TVD of the same top (same point, different metric)
 * Formations therefore extend from their own top DOWN to the next
 * formation's top (sorted ascending). The last formation extends to
 * infinity in its depth metric.
 *
 * Lookup strategy:
 *   1. If the MD lookup produces a hit (formations with valid `md` whose
 *      top ≤ reading MD), return the deepest such formation.
 *   2. Otherwise, if TVD is provided and formations with valid `td` exist,
 *      do the same lookup against TVD. This handles deep stratigraphy
 *      where the dataset only records TVD tops (common below the
 *      kickoff/curve section).
 */
export function getFormationAtDepth(
  depth: number | null | undefined,
  formations: FormationTop[] | null | undefined,
  tvd?: number | null,
): FormationTop | null {
  if (!formations || formations.length === 0) return null;

  // Primary: MD lookup
  if (depth != null && Number.isFinite(depth)) {
    const withMd = formations
      .filter((f) => Number.isFinite(f.md) && f.md > 0)
      .sort((a, b) => a.md - b.md);

    let pickedMd: FormationTop | null = null;
    for (const f of withMd) {
      if (f.md > depth) break;
      pickedMd = f;
    }
    if (pickedMd) return pickedMd;
  }

  // Fallback: TVD lookup for formations without MD tops
  if (tvd != null && Number.isFinite(tvd)) {
    const withTd = formations
      .filter((f) => Number.isFinite(f.td) && f.td > 0)
      .sort((a, b) => a.td - b.td);

    let pickedTd: FormationTop | null = null;
    for (const f of withTd) {
      if (f.td > tvd) break;
      pickedTd = f;
    }
    return pickedTd;
  }

  return null;
}

/** Convenience: just the formation name (or null). */
export function getFormationNameAtDepth(
  depth: number | null | undefined,
  formations: FormationTop[] | null | undefined,
  tvd?: number | null,
): string | null {
  const f = getFormationAtDepth(depth, formations, tvd);
  return f?.name ?? null;
}