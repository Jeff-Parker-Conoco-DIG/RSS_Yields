import type { FormationTop } from '../types';

/**
 * Returns the formation whose depth range [md, td] contains the given depth.
 * Assumes formations are sorted ascending by md. Returns null if no match.
 *
 * Edge cases:
 *   • depth at an exact top boundary → belongs to the deeper formation
 *     (top-inclusive, bottom-exclusive: md <= depth < td).
 *   • If formations have gaps, falls back to the most-recent formation whose
 *     md <= depth (so a reading below TD of the last known top still labels
 *     as the deepest known formation rather than `null`).
 */
export function getFormationAtDepth(
  depth: number | null | undefined,
  formations: FormationTop[] | null | undefined,
): FormationTop | null {
  if (depth == null || !Number.isFinite(depth)) return null;
  if (!formations || formations.length === 0) return null;

  let lastBefore: FormationTop | null = null;
  for (const f of formations) {
    if (f.md > depth) break;
    lastBefore = f;
    if (depth < f.td) return f; // clean hit inside [md, td)
  }
  return lastBefore;
}

/** Convenience: just the formation name (or null). */
export function getFormationNameAtDepth(
  depth: number | null | undefined,
  formations: FormationTop[] | null | undefined,
): string | null {
  const f = getFormationAtDepth(depth, formations);
  return f?.name ?? null;
}