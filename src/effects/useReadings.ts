import { useState, useEffect, useCallback, useRef } from 'react';
import type { YieldReading, TrackingConfig, FormationTop, SlideInterval } from '../types';
import type { ResolvedChannelMap } from '../witsMapper/types';
import { fetchReadings, saveReading, updateReadingNotes, deleteReading, softDeleteReading } from '../api/readingsApi';
import { fetchLatestWitsRecord, fetchRecentWitsRecords, fetchSlideSheet, fetchAllSurveyStations } from '../api/corvaApi';
import { buildRate, turnRate, dls, decomposeSteeringCommand, effectiveToolface, azimuthDelta } from '../calculations/surveyMath';
import { MIN_COURSE_LENGTH_FOR_RATES, DLS_OUTLIER_THRESHOLD } from '../constants';
import { log, error } from '../utils/logger';
import { computeSlideWindow } from '../utils/slideWindow';
import { getFormationNameAtDepth } from '../utils/formations';
import { interpolateTvdAtMd, parseStation, type SurveyStation } from '../utils/tvd';

// --- Generate a simple UUID ----------------------------------------
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface UseReadingsResult {
  readings: YieldReading[];
  loading: boolean;
  error: string | null;
  currentBitDepth: number | null;

  /** Take a snapshot at the current bit depth NOW */
  takeReading: (source?: 'auto' | 'manual') => Promise<void>;

  /** Update notes on a specific reading */
  setNotes: (readingId: string, notes: string) => Promise<void>;

  /** Delete a specific reading */
  removeReading: (readingId: string) => Promise<void>;

  /** Clear all readings from state, localStorage, and dataset */
  clearAll: () => Promise<void>;

  /** Reload all readings from the dataset */
  reload: () => void;
}

/**
 * Walk backwards through raw WITS records to find the record where the
 * watched channel value FIRST appeared (the "change point").
 *
 * records: sorted newest-first (timestamp descending)
 * watchField: the WITS field name to watch (e.g. 'rss_continuous_inclination')
 *
 * Returns the record at the change point, or the latest record if no change found.
 */
function findChangePointRecord(
  records: Record<string, unknown>[],
  watchField: string,
): Record<string, unknown> {
  if (records.length === 0) return {};
  if (records.length === 1) return records[0];

  const newestData = (records[0].data ?? {}) as Record<string, unknown>;
  const currentValue = Number(newestData[watchField] ?? 0);

  for (let i = 1; i < records.length; i++) {
    const recData = (records[i].data ?? {}) as Record<string, unknown>;
    const prevValue = Number(recData[watchField] ?? 0);
    if (Math.abs(prevValue - currentValue) > 0.001) {
      // records[i] has a different value — records[i-1] is the change point
      log(`Change point found: ${watchField} changed at record ${i - 1} (depth=${(((records[i - 1].data as Record<string, unknown>)?.bit_depth) ?? '?')})`);
      return records[i - 1];
    }
  }

  // No change found in the window — use the latest record
  log(`No change point found in ${records.length} records for ${watchField} — using latest`);
  return records[0];
}

// --- Slide sheet types & helpers -----------------------------------

/**
 * Given a cache of slide-sheet intervals and a bit-depth window [fromDepth, toDepth],
 * return:
 *   • slideFt / rotateFt / slideRatio  — footage breakdown
 *   • weightedMotorYield               — footage-weighted Corva motor yield (°/100ft at 100% slide)
 *   • weightedBrYield                  — build component of motor yield (motor_yield × cos(TFO))
 *   • weightedTrYield                  — turn component of motor yield  (motor_yield × sin(TFO))
 *
 * Weights are the overlap footage of each slide with the query window.
 * If a slide is missing motorYield or effectiveToolface, those slides contribute
 * to slideFt/rotateFt only; the weighted yield fields remain null.
 *
 * rotateFt = totalFt - slideFt  (implied from gaps between slide intervals).
 */
function getWeightedSlideYield(
  fromDepth: number,
  toDepth: number,
  intervals: SlideInterval[],
): {
  slideFt: number;
  rotateFt: number;
  slideRatio: number;
  weightedMotorYield: number | null;
  weightedBrYield: number | null;
  weightedTrYield: number | null;
} {
  const totalFt = toDepth - fromDepth;
  if (totalFt <= 0 || intervals.length === 0) {
    console.warn(`[YieldTracker] getWeightedSlideYield: aborting — totalFt=${totalFt.toFixed(2)}, intervals=${intervals.length}`);
    return { slideFt: 0, rotateFt: 0, slideRatio: 0,
             weightedMotorYield: null, weightedBrYield: null, weightedTrYield: null };
  }

  console.group(`%c[YieldTracker] ?? Slide Sheet Query [${fromDepth.toFixed(1)} ? ${toDepth.toFixed(1)} ft] (${totalFt.toFixed(2)} ft total)`, 'color:#fd79a8;font-weight:bold');
  console.log(`Searching ${intervals.length} cached intervals for overlaps…`);

  let slideFt = 0;
  let yieldWeight = 0;         // total slide footage that has a motor_yield value
  let sumYield = 0;            // S(motorYield_i × overlapFt_i)
  let sumBrYield = 0;          // S(motorYield_i × cos(TFO_i) × overlapFt_i)
  let sumTrYield = 0;          // S(motorYield_i × sin(TFO_i) × overlapFt_i)
  const DEG = Math.PI / 180;
  let matchCount = 0;

  for (const interval of intervals) {
    if (!interval.isSlide) continue; // rotate gaps are implicit — not stored

    const overlapFrom = Math.max(fromDepth, interval.fromDepth);
    const overlapTo   = Math.min(toDepth,   interval.toDepth);
    if (overlapTo <= overlapFrom) continue;

    const overlapFt = overlapTo - overlapFrom;
    slideFt += overlapFt;
    matchCount++;

    // Weight motor yield by overlap footage
    if (interval.motorYield != null) {
      yieldWeight += overlapFt;
      sumYield    += interval.motorYield * overlapFt;

      // Decompose into build / turn using effective toolface.
      // TFO=0° ? pure build, TFO=90° ? pure right turn (gravity reference).
      if (interval.effectiveToolface != null) {
        const tfoRad = interval.effectiveToolface * DEG;
        const brContrib = interval.motorYield * Math.cos(tfoRad) * overlapFt;
        const trContrib = interval.motorYield * Math.sin(tfoRad) * overlapFt;
        sumBrYield += brContrib;
        sumTrYield += trContrib;
        console.log(`  ? slide [${interval.fromDepth.toFixed(1)}–${interval.toDepth.toFixed(1)} ft] overlap=${overlapFt.toFixed(2)} ft | motorYield=${interval.motorYield.toFixed(2)} TFO=${interval.effectiveToolface.toFixed(1)}° ? brContrib=${brContrib.toFixed(3)} trContrib=${trContrib.toFixed(3)}`);
      } else {
        console.log(`  ? slide [${interval.fromDepth.toFixed(1)}–${interval.toDepth.toFixed(1)} ft] overlap=${overlapFt.toFixed(2)} ft | motorYield=${interval.motorYield.toFixed(2)} TFO=null (no decomposition)`);
      }
    } else {
      console.warn(`  ?? slide [${interval.fromDepth.toFixed(1)}–${interval.toDepth.toFixed(1)} ft] overlap=${overlapFt.toFixed(2)} ft | motorYield=null — this interval contributes to slide footage but NOT to weighted yield`);
    }
  }

  const rotateFt   = Math.max(0, totalFt - slideFt);
  const slideRatio = slideFt / totalFt;

  const weightedMotorYield = yieldWeight > 0 ? sumYield    / yieldWeight : null;
  const weightedBrYield    = yieldWeight > 0 ? sumBrYield  / yieldWeight : null;
  const weightedTrYield    = yieldWeight > 0 ? sumTrYield  / yieldWeight : null;

  console.log(`Summary: ${matchCount} intervals matched`, {
    totalFt:          totalFt.toFixed(2),
    slideFt:          slideFt.toFixed(2),
    rotateFt:         rotateFt.toFixed(2),
    slideRatio_pct:   `${(slideRatio * 100).toFixed(1)}%`,
    yieldWeight_ft:   yieldWeight.toFixed(2),
    sumYield:         sumYield.toFixed(4),
    sumBrYield:       sumBrYield.toFixed(4),
    sumTrYield:       sumTrYield.toFixed(4),
    weightedMotorYield: weightedMotorYield?.toFixed(4) ?? 'null (no motor_yield in any matched slide)',
    weightedBrYield:    weightedBrYield?.toFixed(4)    ?? 'null',
    weightedTrYield:    weightedTrYield?.toFixed(4)    ?? 'null',
  });
  if (matchCount === 0) {
    console.warn('  No slide intervals overlap this depth range — no slide sheet coverage for this reading interval');
  }
  console.groupEnd();

  return { slideFt, rotateFt, slideRatio,
           weightedMotorYield, weightedBrYield, weightedTrYield };
}

function sortReadingsByTime(readings: YieldReading[]): YieldReading[] {
  return [...readings].sort((a, b) => {
    const tsA = Number.isFinite(a.timestamp) ? a.timestamp : 0;
    const tsB = Number.isFinite(b.timestamp) ? b.timestamp : 0;
    if (tsA !== tsB) return tsA - tsB;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

// Standard motor yield formula (at 100% slide):
//   MY (°/100ft) = rate × (courseLength / slideInInterval)
//
// Derivation:
//   • rate (DLS) is °/100ft over the survey interval of length CL
//   • total curvature over interval = rate × CL / 100  (degrees)
//   • if only `slide` ft of that interval was sliding, the motor's per-ft
//     yield = total_curvature / slide
//   • expressed per 100 ft of slide: × 100
//   • => MY = (rate × CL / 100) / slide × 100 = rate × CL / slide
//
// slideInInterval must be footage of slide in the SAME survey interval as
// rate was measured (from getWeightedSlideYield queried over that range).
// Using window.slideSeen (cumulative active-slide footage past the sensor)
// mixes intervals and yields inflated numbers for short surveys.
function computeNormalizedYield(
  courseLength: number | null,
  slideInInterval: number | null,
  dlsRate: number | null,
  brRate: number | null,
  trRate: number | null,
): {
  normalizedDls: number | null;
  normalizedBr: number | null;
  normalizedTr: number | null;
} {
  if (
    courseLength == null || courseLength <= 0 ||
    slideInInterval == null || slideInInterval <= 0
  ) {
    return { normalizedDls: null, normalizedBr: null, normalizedTr: null };
  }
  const factor = courseLength / slideInInterval;
  if (!isFinite(factor) || factor <= 0) {
    return { normalizedDls: null, normalizedBr: null, normalizedTr: null };
  }
  // Sanity guard: very small slide footage relative to CL blows up the
  // extrapolation. >5× amplification is unreliable — suppress rather than
  // show a fantasy number. (Equivalent to requiring slide ≥ 20% of CL.)
  if (factor > 5) {
    return { normalizedDls: null, normalizedBr: null, normalizedTr: null };
  }
  // DLS outlier guard: if the measured DLS itself is physically implausible
  // (almost always a transient survey spike), don't propagate it through the
  // normalized-yield formula — would produce numbers like 168 °/100ft that
  // have no meaning and would pollute the yield regression.
  if (dlsRate != null && Math.abs(dlsRate) > DLS_OUTLIER_THRESHOLD) {
    return { normalizedDls: null, normalizedBr: null, normalizedTr: null };
  }
  return {
    normalizedDls: dlsRate != null ? dlsRate * factor : null,
    normalizedBr: brRate != null ? brRate * factor : null,
    normalizedTr: trRate != null ? trRate * factor : null,
  };
}

function deriveYieldFromActiveSlide(
  active: SlideInterval | null,
): {
  motorYield: number | null;
  brYield: number | null;
  trYield: number | null;
} {
  if (!active || active.motorYield == null) {
    return { motorYield: null, brYield: null, trYield: null };
  }
  if (active.effectiveToolface == null) {
    return { motorYield: active.motorYield, brYield: null, trYield: null };
  }
  const rad = active.effectiveToolface * (Math.PI / 180);
  return {
    motorYield: active.motorYield,
    brYield: active.motorYield * Math.cos(rad),
    trYield: active.motorYield * Math.sin(rad),
  };
}

// --- useReadings hook -----------------------------------------------

export function useReadings(
  assetId: number | undefined,
  config: TrackingConfig,
  channelMap: ResolvedChannelMap,
  /** MWD bit-to-survey distance in feet (from BHA). 0 = not available. */
  mwdOffset: number = 0,
  formations: FormationTop[] = [],
  /** Well name for denormalization onto each record. Null when unknown. */
  wellName: string | null = null,
): UseReadingsResult {
  const [readings, setReadings] = useState<YieldReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [currentBitDepth, setCurrentBitDepth] = useState<number | null>(null);

  // Ref to latest readings for use inside callbacks/timers
  const readingsRef = useRef<YieldReading[]>([]);
  readingsRef.current = readings;

  const configRef = useRef(config);
  configRef.current = config;

  const channelMapRef = useRef(channelMap);
  channelMapRef.current = channelMap;

  const formationsRef = useRef<FormationTop[]>(formations);
  formationsRef.current = formations;

  const wellNameRef = useRef<string | null>(wellName);
  wellNameRef.current = wellName;

  /** Cache of MWD survey stations (sorted by MD ascending). Used to
   *  interpolate TVD at a given bit depth when taking a reading. */
  const surveyStationsRef = useRef<SurveyStation[]>([]);

  // Track the last watched channel value we saw from WITS
  const lastSeenWatchValueRef = useRef<number | null>(null);

  // Sticky flag: true once the watched channel reports a new value since the
  // last reading. Stays true across poll cycles until a reading is taken,
  // so the depth-interval check doesn't have to coincide with the exact poll
  // in which the value changed.
  const hasNewSurveyRef = useRef(false);

  // --- Slide sheet cache ------------------------------------------
  // Parsed slide/rotate intervals indexed by bit depth.
  // Refreshed every 5 minutes so new intervals are picked up as drilling progresses.
  const slideSheetRef = useRef<SlideInterval[]>([]);
  const mwdOffsetRef = useRef<number>(mwdOffset);
  mwdOffsetRef.current = mwdOffset;
  // Track latest known bit depth so slide-sheet refreshes can be triggered
  // as drilling progresses.
  const latestBitDepthRef = useRef<number | null>(null);

  // --- Load existing readings from dataset (fallback: localStorage) --
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    // Clear prior well's readings so the table doesn't briefly show stale
    // rows while the new well's data is fetched (and stays empty-correct
    // when the new well has zero readings).
    setReadings([]);
    setLoading(true);

    (async () => {
      try {
        const data = await fetchReadings(assetId);
        if (!cancelled) {
          if (data.length > 0) {
            setReadings(sortReadingsByTime(data));
            log(`Loaded ${data.length} existing readings`);
          } else {
            // Fallback: restore from localStorage
            try {
              const cached = localStorage.getItem(`yieldtracker_readings_${assetId}`);
              if (cached) {
                const parsed = JSON.parse(cached) as YieldReading[];
                setReadings(sortReadingsByTime(parsed));
                log(`Restored ${parsed.length} readings from localStorage`);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      } catch (e) {
        error('Failed to load readings:', e);
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [assetId, reloadCount]);

  // --- Persist readings to localStorage as fallback -------------
  useEffect(() => {
    if (!assetId || readings.length === 0) return;
    try {
      localStorage.setItem(`yieldtracker_readings_${assetId}`, JSON.stringify(readings));
    } catch { /* quota */ }
  }, [assetId, readings]);

  // Refresh formation labels on loaded readings whenever formation tops update.
  useEffect(() => {
    setReadings((prev) => {
      const ordered = sortReadingsByTime(prev);
      const orderChanged = ordered.some((r, idx) => r.id !== prev[idx]?.id);
      let changed = false;
      const updated = ordered.map((r) => {
        const formation = getFormationNameAtDepth(r.depth, formationsRef.current);
        if (formation !== r.formation) {
          changed = true;
          return { ...r, formation };
        }
        return r;
      });
      return changed || orderChanged ? updated : prev;
    });
  }, [formations]);

  const reload = useCallback(() => setReloadCount((c) => c + 1), []);

  // --- Slide sheet loader ---------------------------------------
  // Fetches and caches the directional.slide-sheet so takeReading can
  // determine slide vs rotate footage for each interval without extra API calls.
  //
  // API fetch strategy: always fetch ALL records for the well.  The Corva
  // `measured_depth` filter on this dataset applies to the record level, NOT
  // to the nested `data.slides[]` entries, so any depth-based filter returns
  // zero results even when slides exist at the requested depth.
  //
  // The full fetch is ~500 records / 6-7k slide intervals — small enough to
  // cache in memory and refreshed on a 5-minute timer + every 50 ft of new hole.
  const loadSlideSheet = useCallback(async () => {
    if (!assetId) return;
    try {
      log(`SlideSheet: fetching all records for asset ${assetId}`);
      const records = await fetchSlideSheet(assetId);
      log(`SlideSheet: received ${records.length} raw records from API`);

      if (records.length > 0) {
        // Log the first record's raw shape so we can debug field names
        const firstRaw = (records[0] as Record<string, unknown>);
        const firstData = (firstRaw.data ?? firstRaw) as Record<string, unknown>;
        log(`SlideSheet: first record sample — keys: [${Object.keys(firstData).join(', ')}]`);
        // Log a compact summary of the first record (truncate to avoid console flood)
        const firstJson = JSON.stringify(firstData);
        log(`SlideSheet: first record data (first 400 chars): ${firstJson.slice(0, 400)}…`);
      }

      const intervals: SlideInterval[] = [];
      let skipped = 0;
      let totalSlidesExtracted = 0;
      let progressSnapshotsSkipped = 0;
      let formationKeys: Set<string> | null = null;
      const parseField = (v: unknown): number | null => {
        if (v == null) return null;
        const raw = typeof v === 'string' ? v.replace(/[%,$\s]/g, '') : v;
        const n = Number(raw);
        return !isNaN(n) && isFinite(n) ? n : null;
      };

      for (const rec of records) {
        const raw = rec as Record<string, unknown>;
        // Corva records wrap data in a `.data` sub-object; handle both shapes
        const d = (raw.data ?? raw) as Record<string, unknown>;

        // -- Corva directional.slide-sheet format --------------------------
        // Each top-level record has a `slides` array containing ONLY the slide
        // events for that survey interval. Rotate footage is the depth NOT
        // covered by any slide entry.
        // Structure per slide entry:
        //   { start_measured_depth, end_measured_depth, length, motor_yield,
        //     build_rate, dls, effective_toolface, ... }
        if (Array.isArray(d.slides)) {
          // One-time: dump the keys of the first slide so we can see what
          // fields are available (formation_name, etc.) to use downstream.
          if (!formationKeys && d.slides.length > 0) {
            const first = d.slides[0] as Record<string, unknown>;
            formationKeys = new Set(Object.keys(first));
            log(`SlideSheet: slide record fields = [${Array.from(formationKeys).join(', ')}]`);
          }

          for (const slide of d.slides as Array<Record<string, unknown>>) {
            const fromDepth = Number(slide.start_measured_depth ?? 0);
            const toDepth   = Number(slide.end_measured_depth   ?? 0);

            if (fromDepth > 0 && toDepth > fromDepth) {
              // Parse motor performance fields — null if absent or non-numeric
              const parseField = (v: unknown): number | null => {
                if (v == null) return null;
                const raw = typeof v === 'string' ? v.replace(/[%,$\s]/g, '') : v;
                const n = Number(raw);
                return !isNaN(n) && isFinite(n) ? n : null;
              };

              intervals.push({
                fromDepth,
                toDepth,
                isSlide: true,
                motorYield:        parseField(slide.motor_yield),
                buildRateSlide:    parseField(slide.build_rate),
                effectiveToolface: parseField(slide.effective_toolface ?? slide.tfo),
                tfoAccuracy:       parseField(slide.tfo_accuracy),
                startTimestamp:    parseField(slide.start_timestamp),
                slideSeenLen:      parseField(slide.slide_seen),
                slideAheadLen:     parseField(slide.slide_ahead),
              });
              totalSlidesExtracted++;
            } else {
              skipped++;
            }
          }
          continue; // this record has been fully processed
        }

        // -- Fallback: flat record with explicit depth + mode fields --------
        const fromDepth = Number(
          d.start_depth ?? d.depth_from ?? d.start ?? d.measured_depth_start ?? 0,
        );
        const toDepth = Number(
          d.end_depth ?? d.depth_to ?? d.end ?? d.measured_depth_end ?? 0,
        );
        const modeRaw = String(
          d.mode ?? d.drilling_mode ?? d.activity ?? d.slide_rotate ?? '',
        ).toLowerCase().trim();
        const isSlide = modeRaw === 'slide' || modeRaw === 's' || modeRaw === '1';

        if (fromDepth > 0 && toDepth > fromDepth) {
          // Flat records may still carry motor performance fields.
          intervals.push({
            fromDepth,
            toDepth,
            isSlide,
            motorYield: parseField(d.motor_yield ?? d.motorYield),
            buildRateSlide: parseField(d.build_rate ?? d.buildRate),
            effectiveToolface: parseField(d.effective_toolface ?? d.tfo ?? d.toolface),
            tfoAccuracy: parseField(d.tfo_accuracy ?? d.tf_accuracy ?? d.toolface_accuracy),
            startTimestamp: parseField(d.start_timestamp),
            slideSeenLen: parseField(d.slide_seen),
            slideAheadLen: parseField(d.slide_ahead),
          });
        } else {
          skipped++;
          log(`SlideSheet: skipped flat record — from=${fromDepth} to=${toDepth} mode="${modeRaw}"`);
        }
      }

      if (totalSlidesExtracted > 0) {
        log(
          `SlideSheet: extracted ${totalSlidesExtracted} slide events from nested 'slides[]' arrays`,
        );
      }
      void progressSnapshotsSkipped; // retained for symmetry; always 0 now

      // Deduplicate by start_timestamp: Corva emits one record per WITS update
      // both during AND after a slide. The same physical slide can appear
      // 200+ times with identical start_timestamp but slightly varying
      // start/end depths and slide_ahead/slide_seen. We keep one record per
      // start_timestamp — the one with the largest slide_seen (most complete
      // view of the slide) and motor_yield populated where possible.
      //
      // Records without start_timestamp (unusual) fall back to rounded
      // fromDepth so they still dedup against themselves.
      const dedupKey = (iv: SlideInterval): string =>
        iv.startTimestamp != null
          ? `ts:${iv.startTimestamp}`
          : `d:${Math.round(iv.fromDepth)}`;

      const isMoreComplete = (a: SlideInterval, b: SlideInterval): boolean => {
        // Prefer record with larger slide_seen (more of the slide observed)
        const aSeen = a.slideSeenLen ?? 0;
        const bSeen = b.slideSeenLen ?? 0;
        if (aSeen !== bSeen) return aSeen > bSeen;
        // Tiebreak: prefer one with motor_yield populated
        if ((a.motorYield != null) !== (b.motorYield != null)) {
          return a.motorYield != null;
        }
        // Final tiebreak: larger toDepth (longer span)
        return a.toDepth > b.toDepth;
      };

      const deduped = new Map<string, SlideInterval>();
      let duplicatesRemoved = 0;
      for (const iv of intervals) {
        const key = dedupKey(iv);
        const existing = deduped.get(key);
        if (!existing) {
          deduped.set(key, iv);
          continue;
        }
        duplicatesRemoved++;
        // Merge: keep whichever is "more complete"; backfill missing fields.
        const [winner, loser] = isMoreComplete(iv, existing)
          ? [iv, existing]
          : [existing, iv];
        deduped.set(key, {
          ...winner,
          motorYield: winner.motorYield ?? loser.motorYield,
          buildRateSlide: winner.buildRateSlide ?? loser.buildRateSlide,
          effectiveToolface: winner.effectiveToolface ?? loser.effectiveToolface,
          tfoAccuracy: winner.tfoAccuracy ?? loser.tfoAccuracy,
        });
      }
      const dedupedIntervals = Array.from(deduped.values());
      if (duplicatesRemoved > 0) {
        log(
          `SlideSheet: deduped ${intervals.length} → ${dedupedIntervals.length} ` +
          `unique slides by start_timestamp (${duplicatesRemoved} redundant records merged)`,
        );
      }
      intervals.length = 0;
      intervals.push(...dedupedIntervals);

      intervals.sort((a, b) => a.fromDepth - b.fromDepth);

      // Step 2: remove aggregate/session records. The Corva slide-sheet emits
      // both a "session" record spanning multiple survey slices AND the
      // individual per-survey slices. The session record's depth range
      // equals the concatenation of its slice records' ranges. Keeping the
      // aggregate causes triple-counting (slice + slice + aggregate).
      // An aggregate is a record [a, c] for which there exist two OTHER
      // records [a, b] and [b, c] (± 0.5 ft tolerance for precision drift).
      const EPS = 0.5;
      const beforeAgg = intervals.length;
      const aggregateSet = new Set<SlideInterval>();
      for (const iv of intervals) {
        for (const left of intervals) {
          if (left === iv) continue;
          if (Math.abs(left.fromDepth - iv.fromDepth) > EPS) continue;
          if (left.toDepth > iv.toDepth - EPS) continue;
          const split = left.toDepth;
          const rightFound = intervals.some((right) =>
            right !== iv && right !== left &&
            Math.abs(right.fromDepth - split) < EPS &&
            Math.abs(right.toDepth - iv.toDepth) < EPS
          );
          if (rightFound) {
            aggregateSet.add(iv);
            break;
          }
        }
      }
      if (aggregateSet.size > 0) {
        const remaining = intervals.filter((iv) => !aggregateSet.has(iv));
        intervals.length = 0;
        intervals.push(...remaining);
        log(`SlideSheet: removed ${aggregateSet.size} aggregate records (${beforeAgg} → ${intervals.length})`);
      }

      // Step 3: resolve twin records. Corva emits duplicate records for the
      // same physical slide with ~0.1 ft offset on fromDepth and different
      // motor_yields. Observed pattern: the EARLIER start_timestamp carries
      // the correct per-slide motor_yield; the later twin inherits a stale
      // value from a neighboring slide's context. Drop the later twin.
      const twinLosers = new Set<SlideInterval>();
      for (let i = 0; i < intervals.length; i++) {
        const a = intervals[i];
        if (twinLosers.has(a)) continue;
        for (let j = i + 1; j < intervals.length; j++) {
          const b = intervals[j];
          if (twinLosers.has(b)) continue;
          if (
            Math.abs(a.fromDepth - b.fromDepth) < EPS &&
            Math.abs(a.toDepth - b.toDepth) < EPS
          ) {
            const aTs = a.startTimestamp ?? Number.POSITIVE_INFINITY;
            const bTs = b.startTimestamp ?? Number.POSITIVE_INFINITY;
            twinLosers.add(aTs <= bTs ? b : a);
          }
        }
      }
      if (twinLosers.size > 0) {
        const beforeTwins = intervals.length;
        const remaining = intervals.filter((iv) => !twinLosers.has(iv));
        intervals.length = 0;
        intervals.push(...remaining);
        log(`SlideSheet: dropped ${twinLosers.size} twin records (kept earlier-timestamp copy) (${beforeTwins} → ${intervals.length})`);
      }

      // Resort (though not strictly necessary — filter preserves order)
      intervals.sort((a, b) => a.fromDepth - b.fromDepth);

      // One-time dump of the deepest ~25 slides so we can compare them against
      // the Corva Slide Sheet UI and diagnose which records look right/wrong.
      const deepest = intervals.slice(-25);
      console.group(
        `%c[YieldTracker] 🛷 Deduped slide cache (deepest ${deepest.length} of ${intervals.length})`,
        'color:#81ecec;font-weight:bold',
      );
      for (const iv of deepest) {
        const my = iv.motorYield != null ? iv.motorYield.toFixed(2) : 'null';
        const tf = iv.effectiveToolface != null ? iv.effectiveToolface.toFixed(0) + '°' : 'null';
        const ts = iv.startTimestamp ?? '-';
        console.log(`  [${iv.fromDepth.toFixed(1)}–${iv.toDepth.toFixed(1)} ft] len=${(iv.toDepth - iv.fromDepth).toFixed(1)} ft | motor_yield=${my} | TFO=${tf} | ts=${ts}`);
      }
      console.groupEnd();

      // -- Cache update ------------------------------------------------
      // We always fetch all records (no depth filter), so a successful
      // response replaces the cache entirely.  If the API returned 0
      // intervals (shouldn't happen, but defensive), keep what we have.
      if (intervals.length > 0) {
        slideSheetRef.current = intervals;
      } else if (slideSheetRef.current.length > 0) {
        log(
          `SlideSheet: API returned 0 intervals — ` +
          `keeping existing ${slideSheetRef.current.length}-interval cache.`,
        );
      }

      const cached = slideSheetRef.current;
      const slideIntervals  = cached.filter((i) =>  i.isSlide);
      const rotateCount     = cached.filter((i) => !i.isSlide).length;
      const withYield       = slideIntervals.filter((i) => i.motorYield != null).length;
      const withTFO         = slideIntervals.filter((i) => i.effectiveToolface != null).length;
      log(
        `SlideSheet: cached ${cached.length} intervals ` +
        `(${slideIntervals.length} slide, ${rotateCount} rotate, ${skipped} skipped). ` +
        `Motor yield populated: ${withYield}/${slideIntervals.length} slides, ` +
        `TFO populated: ${withTFO}/${slideIntervals.length} slides.` +
        (cached.length > 0
          ? ` Depth range: ${cached[0].fromDepth.toFixed(0)}–${cached[cached.length - 1].toDepth.toFixed(0)} ft`
          : ' No valid intervals — slide yield normalization will be skipped.'),
      );
      // -- Backfill slide-dependent fields for all existing readings -----
      // Readings captured before the slide sheet was loaded (or before new
      // slide data arrived) have stale/null slide fields.  Recalculate them
      // now so the table is always consistent with the latest slide data.
      const sheets = slideSheetRef.current;
      const all = readingsRef.current;
      const ordered = sortReadingsByTime(all);
      const orderChanged = ordered.some((r, idx) => r.id !== all[idx]?.id);
      let changed = false;

      const updated = ordered.map((r, idx) => {
        // Per-interval slide breakdown (previous reading -> this reading), chained by timestamp order.
        const prevR = idx > 0 ? ordered[idx - 1] : null;
        const fallbackRefDepth =
          prevR == null && r.courseLength != null && r.courseLength > 0
            ? (r.depth - r.courseLength)
            : null;
        const refDepth = prevR?.depth ?? fallbackRefDepth;
        let slideFt: number | null = null;
        let rotateFt: number | null = null;
        let sheetMotorYield: number | null = null;
        let sheetBrYield: number | null = null;
        let sheetTrYield: number | null = null;
        let normalizedDls: number | null = null;
        let normalizedBr: number | null = null;
        let normalizedTr: number | null = null;

        if (refDepth != null && r.depth > refDepth && sheets.length > 0) {
          const wy = getWeightedSlideYield(refDepth, r.depth, sheets);
          slideFt = wy.slideFt;
          rotateFt = wy.rotateFt;
          sheetMotorYield = wy.weightedMotorYield;
          sheetBrYield = wy.weightedBrYield;
          sheetTrYield = wy.weightedTrYield;
        }

        const mwdOff = mwdOffsetRef.current;
        const sensor = mwdOff > 0 ? r.depth - mwdOff : r.depth;
        const tfWindowFrom = mwdOff > 0 ? sensor : (prevR?.depth ?? r.depth);
        const window = computeSlideWindow(r.depth, sensor, sheets, tfWindowFrom);

        const appDls = r.mwdDls ?? r.dls;
        const appBr = r.mwdBr ?? r.br;
        const appTr = r.mwdTr ?? r.tr;
        // Query slide footage over the SENSOR's interval — that's where the
        // MWD measured its DLS. If mwdOffset is valid, use [prev_sensor,
        // current_sensor]; otherwise fall back to [ref_bit, current_bit].
        const prevSensorMd = prevR != null
          ? (mwdOff > 0 ? prevR.depth - mwdOff : prevR.depth)
          : null;
        const sensorSlideFt = (prevSensorMd != null && sensor > prevSensorMd && sheets.length > 0)
          ? getWeightedSlideYield(prevSensorMd, sensor, sheets).slideFt
          : slideFt;
        const norm = computeNormalizedYield(r.courseLength, sensorSlideFt, appDls, appBr, appTr);
        normalizedDls = norm.normalizedDls;
        normalizedBr = norm.normalizedBr;
        normalizedTr = norm.normalizedTr;
        // Backfill TVD and re-resolve formation if surveys/formations arrived
        // after the reading was captured. TVD interpolation needs the reading's
        // own inc/az for extrapolation past the last station.
        const tvdBackfill = interpolateTvdAtMd(r.depth, surveyStationsRef.current, r.inc, r.az);
        const formation = getFormationNameAtDepth(r.depth, formationsRef.current, tvdBackfill);
        if (sheetMotorYield == null || sheetBrYield == null || sheetTrYield == null) {
          const fromActive = deriveYieldFromActiveSlide(window.active);
          if (sheetMotorYield == null) sheetMotorYield = fromActive.motorYield;
          if (sheetBrYield == null) sheetBrYield = fromActive.brYield;
          if (sheetTrYield == null) sheetTrYield = fromActive.trYield;
        }

        // Only create a new object if something actually changed
        if (
          slideFt !== r.slideFt ||
          rotateFt !== r.rotateFt ||
          window.slideSeen !== r.slideSeen ||
          window.slideAhead !== r.slideAhead ||
          window.slideStartDepth !== r.slideStartDepth ||
          window.slideEndDepth !== r.slideEndDepth ||
          window.tfAccuracy !== r.tfAccuracy ||
          sheetMotorYield !== r.sheetMotorYield ||
          sheetBrYield !== r.sheetBrYield ||
          sheetTrYield !== r.sheetTrYield ||
          normalizedDls !== r.normalizedDls ||
          normalizedBr !== r.normalizedBr ||
          normalizedTr !== r.normalizedTr ||
          formation !== r.formation ||
          tvdBackfill !== r.tvd
        ) {
          changed = true;
          return {
            ...r,
            slideFt,
            rotateFt,
            slideSeen: window.slideSeen,
            slideAhead: window.slideAhead,
            slideStartDepth: window.slideStartDepth,
            slideEndDepth: window.slideEndDepth,
            tfAccuracy: window.tfAccuracy,
            sheetMotorYield,
            sheetBrYield,
            sheetTrYield,
            normalizedDls,
            normalizedBr,
            normalizedTr,
            formation,
            tvd: tvdBackfill,
          };
        }
        return r;
      });

      if (changed || orderChanged) {
        log('SlideSheet backfill: recalculated slide-dependent fields for existing readings');
        setReadings(updated);
      }
    } catch (e) {
      error('SlideSheet: fetch failed —', e);
    }
  }, [assetId]);

  // Load on mount and refresh every 5 minutes
  useEffect(() => {
    if (!assetId) return;
    loadSlideSheet();
    const timer = setInterval(loadSlideSheet, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [assetId, loadSlideSheet]);

  // --- Survey stations cache (for TVD interpolation) ---------------
  // Cached on mount and refreshed on the same cadence as the slide sheet
  // so new surveys are picked up as drilling progresses.
  const loadSurveyStations = useCallback(async () => {
    if (!assetId) return;
    try {
      const raw = await fetchAllSurveyStations(assetId);
      const parsed = raw
        .map((r) => parseStation(r))
        .filter((s): s is SurveyStation => s !== null)
        .sort((a, b) => a.measured_depth - b.measured_depth);
      surveyStationsRef.current = parsed;
      const deepest = parsed[parsed.length - 1];
      log(
        `SurveyStations: cached ${parsed.length} stations` +
        (deepest
          ? ` (deepest @ MD ${deepest.measured_depth.toFixed(0)} ft, ` +
            `TVD ${Number.isFinite(deepest.tvd ?? deepest.true_vertical_depth ?? NaN) ? (deepest.tvd ?? deepest.true_vertical_depth)!.toFixed(0) : 'n/a'} ft)`
          : ''),
      );
    } catch (e) {
      error('SurveyStations: load failed:', e);
    }
  }, [assetId]);

  useEffect(() => {
    if (!assetId) return;
    loadSurveyStations();
    const timer = setInterval(loadSurveyStations, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [assetId, loadSurveyStations]);

  // --- Take a snapshot (core function) -------------------------
  const takeReading = useCallback(async (source: 'auto' | 'manual' = 'manual') => {
    if (!assetId) return;

    try {
      const cfg = configRef.current;
      const prev = readingsRef.current.length > 0
        ? readingsRef.current[readingsRef.current.length - 1]
        : null;

      // Determine which channel to watch based on section
      const map = channelMapRef.current;
      const watchField = cfg.section === 'uturn' ? map.nearBitAz : map.nearBitInc;

      // For manual readings: fetch recent records and find the change point
      // For auto readings: use the latest record (the watcher already triggered at the right moment)
      let dataObj: Record<string, unknown>;

      if (source === 'manual') {
        // Fetch raw WITS (for change-point detection on inc/depth) AND the
        // merged latest record (for MWD channels like mwd_continuous_azimuth
        // that only live in wits.summary-1ft, not in raw corva/wits/).
        const [records, latestMerged] = await Promise.all([
          fetchRecentWitsRecords(assetId, 50),
          fetchLatestWitsRecord(assetId),
        ]);
        if (records.length === 0) {
          error('No WITS data available for snapshot');
          return;
        }
        const changePoint = findChangePointRecord(records, watchField);
        // Base: merged record gives us summary-1ft channels (mwd_continuous_azimuth etc.)
        // Overwrite with changePoint.data so depth, inc, and all raw fields
        // reflect the exact moment of the survey change — not the "latest" record.
        const mergedBase = (latestMerged?.data ?? {}) as Record<string, unknown>;
        dataObj = { ...mergedBase, ...(changePoint.data ?? {}) as Record<string, unknown> };
        log(`Manual reading: walked back to change point for '${watchField}' (merged with summary-1ft for MWD channels)`);
      } else {
        // Auto reading — watcher already triggered at the right moment, use latest
        const witsRecord = await fetchLatestWitsRecord(assetId);
        if (!witsRecord) {
          error('No WITS data available for snapshot');
          return;
        }
        dataObj = (witsRecord.data ?? {}) as Record<string, unknown>;
      }

      // Extract depth — try multiple possible locations
      // Raw WITS has data.bit_depth (17612.55) and data.hole_depth
      // Summary-1ft has data.bit_depth_max
      const depth = Number(
        dataObj.bit_depth             // Raw WITS (most accurate, current bit depth)
        ?? dataObj.hole_depth         // Raw WITS or summary-1ft
        ?? dataObj.bit_depth_max      // summary-1ft aggregated
        ?? dataObj.bit_depth_mean     // summary-1ft aggregated
        ?? dataObj.sta_depth          // Pason raw
        ?? 0
      );

      if (depth <= 0) {
        error(`Invalid depth from WITS. data.bit_depth=${dataObj.bit_depth}`);
        return;
      }

      // Update the depth ref so the next slide-sheet refresh uses the correct window.
      // Also refresh the slide sheet immediately if the bit has advanced = 50 ft
      // since the last refresh — this keeps the cached intervals current at the bit.
      const prevKnownDepth = latestBitDepthRef.current;
      latestBitDepthRef.current = depth;
      if (prevKnownDepth == null || depth - prevKnownDepth >= 50) {
        // Fire-and-forget — don't block takeReading while the fetch is in flight.
        loadSlideSheet();
      }

      // Suppress accidental rapid duplicates for AUTO mode only.
      // Manual clicks should always allow a reading at the same depth.
      if (
        source === 'auto' &&
        prev &&
        Math.abs(depth - prev.depth) < 0.5 &&
        (Date.now() - prev.timestamp) < 30000
      ) {
        log(`Skipping — duplicate reading at ${depth} ft (taken ${((Date.now() - prev.timestamp) / 1000).toFixed(0)}s ago)`);
        return;
      }

      // 2. Extract values from data.* using the resolved channel map
      const getVal = (fieldName: string): number | null => {
        if (!fieldName) return null;
        const v = dataObj[fieldName];
        if (v == null) return null;
        const num = Number(v);
        return isNaN(num) ? null : num;
      };

      // -- RAW WITS DATA DUMP ---------------------------------------------
      console.group(`%c[YieldTracker] ?? Raw WITS record at depth=${Number(dataObj.bit_depth ?? dataObj.hole_depth ?? dataObj.bit_depth_max ?? 0).toFixed(1)} ft (${source})`, 'color:#7ec8e3;font-weight:bold');
      console.log('Depth fields:', {
        bit_depth:      dataObj.bit_depth,
        hole_depth:     dataObj.hole_depth,
        bit_depth_max:  dataObj.bit_depth_max,
        bit_depth_mean: dataObj.bit_depth_mean,
        sta_depth:      dataObj.sta_depth,
      });
      console.log('All WITS keys:', Object.keys(dataObj).sort().join(', '));
      console.log('Full WITS data snapshot:', { ...dataObj });
      console.groupEnd();

      const inc = getVal(map.nearBitInc) ?? 0;
      const azRaw = map.nearBitAz ? getVal(map.nearBitAz) : null;  // null when not mapped
      const mwdInc = getVal(map.mwdInc);
      const mwdAz  = getVal(map.mwdAz);
      // Use the near-bit az when available; fall back to MWD az so the table
      // shows a real azimuth instead of 0.  Near-bit TR/DLS is still only
      // computed when azRaw != null (see rate block below).
      const az = azRaw ?? mwdAz ?? 0;
      const dc = getVal(map.dutyCycle);
      const tfSet = getVal(map.toolFaceSet);
      const tfAct = getVal(map.toolFaceActual);
      const sf = getVal(map.steeringForce);

      // -- CHANNEL EXTRACTION TABLE ---------------------------------------
      console.group('%c[YieldTracker] ?? Channel Extraction', 'color:#a8d8a8;font-weight:bold');
      console.log('Channel map in use:', {
        nearBitInc:     map.nearBitInc  || '(not mapped)',
        nearBitAz:      map.nearBitAz   || '(not mapped)',
        mwdInc:         map.mwdInc      || '(not mapped)',
        mwdAz:          map.mwdAz       || '(not mapped)',
        dutyCycle:      map.dutyCycle   || '(not mapped)',
        toolFaceSet:    map.toolFaceSet || '(not mapped)',
        toolFaceActual: map.toolFaceActual || '(not mapped)',
        steeringForce:  map.steeringForce  || '(not mapped)',
      });
      console.log('Extracted values:', {
        nearBitInc_raw: map.nearBitInc ? dataObj[map.nearBitInc] : '(channel empty)',
        inc_final:      inc,
        nearBitAz_raw:  map.nearBitAz  ? dataObj[map.nearBitAz]  : '(channel empty)',
        azRaw:          azRaw,
        az_final:       az,
        az_note:        azRaw !== null ? '? real near-bit az from WITS'
                        : mwdAz !== null ? '?? az from MWD fallback (nearBitAz not mapped)'
                        : '?? az defaulted to 0 — no az channel available',
        mwdInc:         mwdInc,
        mwdAz:          mwdAz,
        dutyCycle:      dc,
        toolFaceSet:    tfSet,
        toolFaceActual: tfAct,
        steeringForce:  sf,

      });
      if (azRaw === null && mwdAz !== null) {
        console.info(`[YieldTracker] nearBitAz not mapped — az display using MWD fallback (mwdAz=${mwdAz.toFixed(2)}°). Near-bit TR will be null, DLS = |BR|.`);
      } else if (azRaw === null && map.nearBitAz === '') {
        console.warn('[YieldTracker] nearBitAz not mapped and mwdAz also unavailable — az stored as 0. TR will be null, DLS = |BR|.');
      } else if (azRaw === null && map.nearBitAz) {
        console.warn(`[YieldTracker] nearBitAz channel "${map.nearBitAz}" IS mapped but returned null from WITS — az stored as 0. This may cause fake azimuth jumps!`);
      }
      console.groupEnd();

      // 3. Calculate RSS rates from previous reading OR most recent MWD survey.
      //    Only compute BR/TR/DLS when course length >= MIN_COURSE_LENGTH_FOR_RATES.
      //    Curve-only profiles (nearBitAz = '') skip TR; DLS = |BR|.
      let cl: number | null = null;
      let br_: number | null = null;
      let tr_: number | null = null;
      let dls_: number | null = null;

      // Reference point for rate calculation — either the last reading in the
      // table, or (when the table is empty) the most recent MWD survey station
      // before the current depth, so the very first reading gets real rates.
      let refInc: number | null = prev?.inc ?? null;
      let refAz:  number | null = prev?.az  ?? null;
      let refDepth: number | null = prev?.depth ?? null;

      if (!prev) {
        // No readings yet — fetch the most recent MWD survey station as reference
        try {
          const stations = await fetchAllSurveyStations(assetId);
          // stations are sorted by measured_depth ascending
          // Find the last station with depth < current reading depth
          let bestStation: Record<string, unknown> | null = null;
          for (const st of stations) {
            const s = st as Record<string, unknown>;
            const md = Number(s.measured_depth ?? 0);
            if (md > 0 && md < depth) bestStation = s;
          }
          if (bestStation) {
            refDepth = Number(bestStation.measured_depth);
            refInc   = Number(bestStation.inclination ?? 0);
            refAz    = Number(bestStation.azimuth ?? 0);
            log(
              `First reading: using MWD survey @ ${refDepth.toFixed(1)} ft ` +
              `(inc=${refInc.toFixed(2)}° az=${refAz.toFixed(2)}°) as reference`,
            );
          }
        } catch (e) {
          log(`First reading: could not fetch survey stations — rates will be null. ${e}`);
        }
      }

      if (refDepth != null && refInc != null) {
        cl = depth - refDepth;
        if (cl >= MIN_COURSE_LENGTH_FOR_RATES) {
          br_ = buildRate(refInc, inc, cl);
          if (azRaw != null && refAz != null) {
            // Full 3D rates — azimuth channel is mapped
            tr_ = turnRate(refAz, az, cl);
            dls_ = dls(refInc, inc, refAz, az, cl);
          } else {
            // Curve-only profile — no azimuth, DLS = |BR|
            tr_ = null;
            dls_ = Math.abs(br_);
          }
        }
      }

      // -- RSS RATE CALCULATION LOG ---------------------------------------
      console.group('%c[YieldTracker] ?? Rate Calculation (RSS / Near-bit)', 'color:#f9ca24;font-weight:bold');
      if (!prev && refDepth == null) {
        console.log('prev reading: NONE & no MWD survey found — this is the first reading. All rates = null.');
      } else {
        const refSource = prev ? 'previous reading' : 'MWD survey station';
        console.log(`Inputs (ref = ${refSource}):`, {
          ref_depth: refDepth,
          curr_depth: depth,
          courseLength_ft: cl,
          ref_inc:  refInc,
          curr_inc:  inc,
          ref_az:   refAz,
          curr_az:   az,
          azRaw:     azRaw,
        });

        if (cl == null || cl < MIN_COURSE_LENGTH_FOR_RATES) {
          console.log(`?? Course length ${cl?.toFixed(2) ?? 'null'} ft < minimum ${MIN_COURSE_LENGTH_FOR_RATES} ft — rates not computed`);
        } else if (azRaw != null && refAz != null) {
          // Warn if the reference az was 0 while current has a real value
          const azDelta = Math.abs(az - refAz);
          const azDeltaWrapped = azDelta > 180 ? 360 - azDelta : azDelta;
          if (azDeltaWrapped > 5 && (refAz === 0)) {
            console.error(
              `[YieldTracker] ?? AZIMUTH CONTAMINATION DETECTED!\n` +
              `  ref.az = ${refAz} (was stored as 0 — likely from a motor-profile reading where az defaulted to 0)\n` +
              `  curr az = ${az} (? = ${azDeltaWrapped.toFixed(2)}°)\n` +
              `  TR will be ${tr_?.toFixed(2)} °/100ft — THIS IS A SPURIOUS VALUE!`,
            );
          }
          console.log('Path: Full 3D rates (nearBitAz IS mapped)', {
            formula_BR:  `buildRate(${refInc}, ${inc}, ${cl}) = ${br_?.toFixed(4)}`,
            formula_TR:  `turnRate(${refAz}, ${az}, ${cl}) = ${tr_?.toFixed(4)}`,
            formula_DLS: `dls(${refInc}, ${inc}, ${refAz}, ${az}, ${cl}) = ${dls_?.toFixed(4)}`,
            BR_result:  br_,
            TR_result:  tr_,
            DLS_result: dls_,
          });
        } else {
          console.log('Path: Curve-only (nearBitAz is empty) — TR=null, DLS=|BR|', {
            formula_BR:  `buildRate(${refInc}, ${inc}, ${cl}) = ${br_?.toFixed(4)}`,
            BR_result:  br_,
            TR_result:  'null (skipped — no az channel)',
            DLS_result: dls_,
            DLS_note:   `DLS = |BR| = ${dls_?.toFixed(4)}`,
          });
        }
      }
      console.groupEnd();

      // 3b. Calculate MWD rates from MWD inc/az
      let mwdBr: number | null = null;
      let mwdTr: number | null = null;
      let mwdDls: number | null = null;

      // For MWD rates: use prev reading's mwdInc/mwdAz, or fall back to survey
      // station inc/az (survey stations ARE MWD measurements).
      const refMwdInc = prev?.mwdInc ?? refInc;
      const refMwdAz  = prev?.mwdAz  ?? refAz;

      if (cl != null && cl >= MIN_COURSE_LENGTH_FOR_RATES && mwdInc != null && refMwdInc != null) {
        mwdBr = buildRate(refMwdInc, mwdInc, cl);
        if (mwdAz != null && refMwdAz != null) {
          mwdTr = turnRate(refMwdAz, mwdAz, cl);
          mwdDls = dls(refMwdInc, mwdInc, refMwdAz, mwdAz, cl);
        }
        log(`MWD rates: refInc=${refMwdInc} currInc=${mwdInc} refAz=${refMwdAz} currAz=${mwdAz} CL=${cl} ? BR=${mwdBr?.toFixed(4)} TR=${mwdTr?.toFixed(4)} DLS=${mwdDls?.toFixed(4)}`);
      }

      // -- MWD RATE CALCULATION LOG ---------------------------------------
      console.group('%c[YieldTracker] ?? Rate Calculation (MWD survey sensor)', 'color:#f9ca24');
      if (cl == null || cl < MIN_COURSE_LENGTH_FOR_RATES) {
        console.log('Skipped — course length too short or null');
      } else if (mwdInc == null) {
        console.log(`?? Skipped — mwdInc is null (channel "${map.mwdInc}" not in WITS record)`);
      } else if (refMwdInc == null) {
        console.log('?? Skipped — no reference mwdInc available (no prev reading and no survey station)');
      } else {
        const azPath = (mwdAz != null && refMwdAz != null)
          ? `turnRate(${refMwdAz}, ${mwdAz}, ${cl}) = ${mwdTr?.toFixed(4)}`
          : `skipped — ${mwdAz == null ? `curr mwdAz null (channel "${map.mwdAz}")` : 'ref mwdAz null'}`;
        console.log('MWD Rates:', {
          formula_BR:   `buildRate(${refMwdInc}, ${mwdInc}, ${cl}) = ${mwdBr?.toFixed(4)}`,
          formula_TR:   azPath,
          formula_DLS:  mwdDls != null ? `dls(${refMwdInc}, ${mwdInc}, ${refMwdAz}, ${mwdAz}, ${cl}) = ${mwdDls?.toFixed(4)}` : 'skipped',
          mwdBr_result: mwdBr,
          mwdTr_result: mwdTr,
          mwdDls_result: mwdDls,
        });
      }
      console.groupEnd();

      // 3c. Calculate resultant toolface from inc/az change.
      //      Prefer RSS near-bit rates (br_/tr_).  In motor / curve-only mode
      //      where tr_ is null (nearBitAz=''), fall back to MWD rates so RES TF
      //      still populates for bent motor BHAs.
      let resultTF: number | null = null;
      {
        const useBr = br_ ?? mwdBr;
        const useTr = tr_ ?? mwdTr;
        const useInc = (br_ != null ? inc : mwdInc) ?? inc;
        if (useBr != null && useTr != null) {
          const { effectiveTF } = effectiveToolface(useBr, useTr, useInc);
          resultTF = effectiveTF;
        }
      }

      // -- RESULTANT TF LOG -----------------------------------------------
      console.group('%c[YieldTracker] ?? Resultant Toolface', 'color:#e056fd');
      if (br_ == null && mwdBr == null) {
        console.log('Skipped — no BR available (no previous reading or CL too short)');
      } else if (tr_ == null && mwdTr == null) {
        console.warn(
          `Skipped — no TR available (curve-only profile, nearBitAz='${map.nearBitAz}', mwdAz also unavailable)`,
        );
      } else {
        const useBr = br_ ?? mwdBr;
        const useTr = tr_ ?? mwdTr;
        const useInc = (br_ != null ? inc : mwdInc) ?? inc;
        const { effectiveTF, effectiveDLS } = effectiveToolface(useBr!, useTr!, useInc);
        console.log('Computed:', {
          source: br_ != null && tr_ != null ? 'RSS (near-bit)' : 'MWD (fallback)',
          inputs: { br: useBr, tr: useTr, inc: useInc },
          effectiveTF_deg: effectiveTF,
          effectiveDLS:    effectiveDLS,
          resultantTF_stored: resultTF,
        });
      }
      console.groupEnd();

      // 3d. Delta between RSS and MWD sensors
      let deltaInc_: number | null = null;
      let deltaAz_: number | null = null;
      if (mwdInc != null) {
        deltaInc_ = inc - mwdInc;
      }
      if (azRaw != null && mwdAz != null) {
        deltaAz_ = azimuthDelta(mwdAz, az); // RSS Az - MWD Az, wrapped ±180°
      }

      // 4. Toolface decomposition
      let buildCmd: number | null = null;
      let turnCmd: number | null = null;
      const tfForDecomp = tfAct ?? tfSet;
      if (dc != null && tfForDecomp != null) {
        const decomp = decomposeSteeringCommand(dc, tfForDecomp);
        buildCmd = decomp.buildCommand;
        turnCmd = decomp.turnCommand;
      }

      // -- TOOLFACE DECOMPOSITION LOG -------------------------------------
      console.group('%c[YieldTracker] ?? Toolface Decomposition', 'color:#badc58');
      console.log({
        dutyCycle:      dc,
        toolFaceSet:    tfSet,
        toolFaceActual: tfAct,
        tfUsedForDecomp: tfForDecomp,
        buildCommand:   buildCmd,
        turnCommand:    turnCmd,
        deltaInc_RSSvsMWD: deltaInc_,
        deltaAz_RSSvsMWD:  deltaAz_,
        note: dc == null || tfForDecomp == null ? '?? Skipped — dc or TF not available' : '? Decomposed',
      });
      console.groupEnd();

      // 4b. Slide / rotate breakdown using the cached slide sheet.
      //
      // Sensor position: the MWD survey captured at bit depth D represents
      // the formation at (D - mwdOffset). We record that position as
      // sensorDepth so it can be shown / used in future analysis.
      //
      // The slide sheet is indexed by bit depth (that's how drillers record
      // it), so we query with the bit-depth interval [prev.depth, depth] to
      // find how much of this interval was slide vs rotate.
      //
      // Normalized yields: if only 60% of the interval was slide, the motor
      // actually built at X / 0.60 — that's the true motor yield at 100% slide.
      const mwdOff = mwdOffsetRef.current;
      const sensorDepth_: number | null = mwdOff > 0 ? depth - mwdOff : null;
      const sensorDepthForWindow = mwdOff > 0 ? depth - mwdOff : depth;
      const tfWindowFromDepth = mwdOff > 0 ? sensorDepthForWindow : (prev?.depth ?? depth);

      let slideFt_: number | null = null;
      let rotateFt_: number | null = null;
      let normalizedDls_: number | null = null;
      let normalizedBr_: number | null = null;
      let normalizedTr_: number | null = null;
      let sheetMotorYield_: number | null = null;
      let sheetBrYield_: number | null = null;
      let sheetTrYield_: number | null = null;
      let slideSeen_: number | null = null;
      let slideAhead_: number | null = null;
      let slideStartDepth_: number | null = null;
      let slideEndDepth_: number | null = null;
      let tfAccuracy_: number | null = null;
      // TVD at bit depth — interpolated from cached MWD survey stations.
      // Used for formation alignment (deeper formations only have TVD tops)
      // and exposed in the table/DB for consumer apps.
      const tvd_ = interpolateTvdAtMd(depth, surveyStationsRef.current, inc, az);
      const formation_: string | null = getFormationNameAtDepth(depth, formationsRef.current, tvd_);

      if (mwdOff > 0) {
        log(
          `SensorPos: bit=${depth.toFixed(1)}ft mwdOffset=${mwdOff}ft ` +
          `? sensor=${sensorDepthForWindow.toFixed(1)}ft`,
        );
      } else {
        log('SensorPos: mwdOffset not set — sensor window fallback uses bit depth');
      }

      // -- Motor yield + active slide window calculations ------------
      //
      // Formula (industry standard for steerable PDM):
      //   Motor Yield (°/100ft) = (?Inclination / Slide Footage) × 100
      //
      // • ?Inclination  = change in MWD inclination over the 300-ft window
      // • Slide Footage = total slide footage within the same 300-ft window
      //                   from the cached slide-sheet intervals
      //
      // The window is anchored at the current sensor depth so that the slide
      // data the MWD tool has already "seen" is what drives the calculation.
      // Corva's pre-computed motor_yield field is NOT used — it is often null
      // for the most recent slides (lag in post-processing) and can produce
      // erratic values close to the bit.
      {
        if (slideSheetRef.current.length === 0) {
          await loadSlideSheet();
        }
        const sheets = slideSheetRef.current;

        // 1. Slide / rotate breakdown for the current reading interval (ref ? depth).
        //    This drives the slideFt / rotateFt columns in the table.
        //    refDepth comes from the prev reading or the most recent MWD survey.
        if (refDepth != null && cl != null && cl > 0) {
          if (sheets.length === 0) {
            log(
              `SlideYield [${refDepth.toFixed(1)}–${depth.toFixed(1)}ft]: ` +
              'slide sheet not loaded yet — slide footage unavailable',
            );
          } else {
            const wy = getWeightedSlideYield(refDepth, depth, sheets);
            slideFt_    = wy.slideFt;
            rotateFt_   = wy.rotateFt;
            sheetMotorYield_ = wy.weightedMotorYield;
            sheetBrYield_ = wy.weightedBrYield;
            sheetTrYield_ = wy.weightedTrYield;
            log(
              `SlideYield [${refDepth.toFixed(1)}–${depth.toFixed(1)}ft]: ` +
              `slide=${wy.slideFt.toFixed(1)}ft rotate=${wy.rotateFt.toFixed(1)}ft ` +
              `(${sheets.length} slide intervals in cache)`,
            );
          }
        }

        // 2. Active-slide seen/ahead window plus TF accuracy.
        const window = computeSlideWindow(depth, sensorDepthForWindow, sheets, tfWindowFromDepth);
        slideSeen_ = window.slideSeen;
        slideAhead_ = window.slideAhead;
        slideStartDepth_ = window.slideStartDepth;
        slideEndDepth_ = window.slideEndDepth;
        tfAccuracy_ = window.tfAccuracy;

        // 3. Normalized (motor) yield: scale rates to 100% slide using slide
        //    footage in the SAME sensor interval the MWD measured over. This
        //    is the physically correct motor yield: MY = DLS × CL / slide.
        const appDls = mwdDls ?? dls_;
        const appBr = mwdBr ?? br_;
        const appTr = mwdTr ?? tr_;
        const prevSensorMd = prev != null
          ? (mwdOff > 0 ? prev.depth - mwdOff : prev.depth)
          : null;
        const sensorSlideFt = (prevSensorMd != null && sensorDepthForWindow > prevSensorMd && sheets.length > 0)
          ? getWeightedSlideYield(prevSensorMd, sensorDepthForWindow, sheets).slideFt
          : slideFt_;
        const norm = computeNormalizedYield(cl, sensorSlideFt, appDls, appBr, appTr);
        normalizedDls_ = norm.normalizedDls;
        normalizedBr_ = norm.normalizedBr;
        normalizedTr_ = norm.normalizedTr;

        if (sheetMotorYield_ == null || sheetBrYield_ == null || sheetTrYield_ == null) {
          const fromActive = deriveYieldFromActiveSlide(window.active);
          if (sheetMotorYield_ == null) sheetMotorYield_ = fromActive.motorYield;
          if (sheetBrYield_ == null) sheetBrYield_ = fromActive.brYield;
          if (sheetTrYield_ == null) sheetTrYield_ = fromActive.trYield;
        }
      }

      // 5. Create reading
      const reading: YieldReading = {
        id: uuid(),
        assetId,
        depth,
        inc,
        az,
        mwdInc,
        mwdAz,
        courseLength: cl,
        br: br_,
        tr: tr_,
        dls: dls_,
        mwdBr,
        mwdTr,
        mwdDls,
        deltaInc: deltaInc_,
        deltaAz: deltaAz_,
        sensorDepth: sensorDepth_,
        slideFt: slideFt_,
        rotateFt: rotateFt_,
        slideSeen: slideSeen_,
        slideAhead: slideAhead_,
        slideStartDepth: slideStartDepth_,
        slideEndDepth: slideEndDepth_,
        tfAccuracy: tfAccuracy_,
        sheetMotorYield: sheetMotorYield_,
        sheetBrYield: sheetBrYield_,
        sheetTrYield: sheetTrYield_,
        normalizedDls: normalizedDls_,
        normalizedBr: normalizedBr_,
        normalizedTr: normalizedTr_,
        dlsOutlier: (() => {
          const d = mwdDls ?? dls_;
          return d != null && Math.abs(d) > DLS_OUTLIER_THRESHOLD;
        })(),
        wellName: wellNameRef.current,
        tvd: tvd_,
        deletedAt: null,
        dutyCycle: dc,
        toolFaceSet: tfSet,
        toolFaceActual: tfAct,
        toolFaceStdDev: null,
        steeringForce: sf,
        resultantTF: resultTF,
        buildCommand: buildCmd,
        turnCommand: turnCmd,
        notes: '',
        formation: formation_,
        section: cfg.section,
        timestamp: Date.now(),
        source,
      };

      // -- FINAL READING SUMMARY ------------------------------------------
      console.group(
        `%c[YieldTracker] ? Reading STORED @ ${depth.toFixed(1)} ft  (${source})`,
        'color:#00b894;font-weight:bold;font-size:13px',
      );
      console.log('Survey:', {
        depth,
        inc,
        az,
        az_note: azRaw !== null   ? '? real near-bit az'
                 : mwdAz !== null ? `?? MWD fallback az=${mwdAz.toFixed(2)}° (nearBitAz not mapped)`
                 :                  '?? az=0 (no az channel available)',
        mwdInc,
        mwdAz,
        section: cfg.section,
        source,
      });
      console.log('Rates (RSS near-bit):', {
        courseLength: cl,
        BR_buildRate:   br_,
        TR_turnRate:    tr_,
        DLS_dogleg:     dls_,
      });
      console.log('Rates (MWD):', {
        mwdBr,
        mwdTr,
        mwdDls,
        deltaInc_RSSvsMWD: deltaInc_,
        deltaAz_RSSvsMWD:  deltaAz_,
      });
      console.log('Slide / Rotate:', {
        slideFt:       slideFt_,
        rotateFt:      rotateFt_,
        sensorDepth:    sensorDepth_,
      });
      console.log('Toolface / Steering:', {
        toolFaceSet:    tfSet,
        toolFaceActual: tfAct,
        resultantTF:    resultTF,
        resultantTF_note: resultTF == null
          ? (br_ == null ? 'null — no prev reading' : '?? null — tr_ was null (motor curve-only mode)')
          : '? computed',
        dutyCycle:      dc,
        buildCommand:   buildCmd,
        turnCommand:    turnCmd,
        steeringForce:  sf,
      });
      console.groupEnd();

      // 6. Persist to dataset (don't block on failure — save locally regardless)
      saveReading(reading).catch((e) => error('Failed to persist reading:', e));

      // 7. Update local state
      setReadings((prev) => sortReadingsByTime([...prev, reading]));
      setCurrentBitDepth(depth);
      log(`Reading taken at ${depth} ft — inc=${inc} az=${az} (${source})`);
    } catch (e) {
      error('takeReading failed:', e);
    }
  }, [assetId, channelMap, loadSlideSheet]);

  // --- Set notes on a reading ----------------------------------
  const setNotes = useCallback(async (readingId: string, notes: string) => {
    // Update local state immediately
    setReadings((prev) =>
      prev.map((r) => (r.id === readingId ? { ...r, notes } : r)),
    );
    // Persist
    if (assetId) {
      await updateReadingNotes(assetId, readingId, notes);
    }
  }, [assetId]);

  // --- Delete a reading ----------------------------------------
  // Soft-delete: stamp `data.deleted_at` via PATCH on the dataset record
  // so a backend cleanup app can hard-delete later. We can't DELETE
  // directly from a UI app without backend auth, and we do not want
  // deleted rows to reappear on reload. Local state is pruned immediately
  // so the row disappears from the UI.
  const removeReading = useCallback(async (readingId: string) => {
    const now = Date.now();
    setReadings((prev) => prev.filter((r) => r.id !== readingId));
    if (assetId) {
      try {
        await softDeleteReading(assetId, readingId, now);
      } catch (e) {
        error('softDeleteReading failed:', e);
      }
      // Legacy best-effort DELETE for environments where the frontend has
      // auth (e.g. running outside the iframe shell during dev).
      deleteReading(assetId, readingId).catch(() => { /* ignore */ });
    }
  }, [assetId]);

  // --- Clear all readings ---------------------------------------
  // Soft-delete every currently-visible reading. localStorage is cleared
  // so the UI rebuilds cleanly; the dataset records remain tombstoned
  // for the backend cleanup app to hard-delete.
  const clearAll = useCallback(async () => {
    const snapshot = readingsRef.current.slice();
    setReadings([]);
    if (assetId) {
      try { localStorage.removeItem(`yieldtracker_readings_${assetId}`); } catch { /* ignore */ }
      const now = Date.now();
      // Fire tombstone PATCHes in parallel but don't block UI — caller
      // already sees an empty table. Log failures individually.
      await Promise.all(
        snapshot.map((r) =>
          softDeleteReading(assetId, r.id, now).catch((e) => {
            error(`softDeleteReading failed for ${r.id}:`, e);
          }),
        ),
      );
    }
    log(`Readings cleared (${snapshot.length} tombstoned)`);
  }, [assetId]);

  // --- Section-aware channel watcher -----------------------------
  // Watches the appropriate RSS channel based on well section:
  //   curve ? watch rss_continuous_inclination
  //   uturn ? watch rss_continuous_azimuth
  // Triggers a reading when the watched channel changes AND depth has
  // advanced at least intervalValue feet from the last reading.
  useEffect(() => {
    if (!assetId || !config.isRunning || config.intervalMode !== 'depth') return;

    // Determine which channel to watch based on section + resolved map
    const map = channelMapRef.current;
    const watchChannel = config.section === 'uturn'
      ? map.nearBitAz
      : map.nearBitInc;

    log(`Channel watcher started: watching '${watchChannel}' for ${config.section} section, interval=${config.intervalValue}ft`);

    // Reset state when the effect restarts (new section, config, etc.)
    lastSeenWatchValueRef.current = null;
    hasNewSurveyRef.current = false;

    const timer = setInterval(async () => {
      try {
        const witsRecord = await fetchLatestWitsRecord(assetId);
        if (!witsRecord) return;
        const dataObj = (witsRecord.data ?? {}) as Record<string, unknown>;

        // Get current depth and the watched channel value
        const depth = Number(dataObj.bit_depth ?? dataObj.hole_depth ?? 0);
        const watchValue = Number(dataObj[watchChannel] ?? 0);

        if (depth <= 0) return;
        setCurrentBitDepth(depth);

        const cfg = configRef.current;
        if (depth < cfg.startDepth) return;
        if (cfg.stopDepth && depth > cfg.stopDepth) return;

        const lastReading = readingsRef.current[readingsRef.current.length - 1];
        const lastDepth = lastReading?.depth ?? cfg.startDepth;
        const lastSeenVal = lastSeenWatchValueRef.current;

        // Check if the watched channel value changed (tool reported new measurement).
        // Use 0.001° threshold to filter float noise.
        const valueChanged = lastSeenVal !== null && Math.abs(watchValue - lastSeenVal) > 0.001;

        // Update last seen value
        lastSeenWatchValueRef.current = watchValue;

        // Latch: once a value change is seen, remember it across poll cycles.
        // This prevents a missed trigger when the inclination updates in one
        // 5-second window but the required depth hasn't been drilled yet —
        // the flag stays true until both conditions are satisfied together.
        if (valueChanged) {
          hasNewSurveyRef.current = true;
        }

        // Take reading when: a survey update has been seen (sticky) AND drilled enough footage
        if (hasNewSurveyRef.current && depth >= lastDepth + cfg.intervalValue) {
          const channelLabel = config.section === 'uturn' ? 'az' : 'inc';
          log(`Watcher trigger: ${channelLabel} pending survey fired at depth=${depth.toFixed(1)} (CL=${(depth - lastDepth).toFixed(1)}ft, current ${channelLabel}=${watchValue.toFixed(4)})`);
          hasNewSurveyRef.current = false;
          await takeReading('auto');
        }
      } catch {
        // Silently retry on next poll
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [assetId, config.isRunning, config.intervalMode, config.intervalValue, config.startDepth, config.stopDepth, config.section, channelMap, takeReading]);

  // --- Auto-trigger: Time-based --------------------------------
  useEffect(() => {
    if (!assetId || !config.isRunning || config.intervalMode !== 'time') return;

    const intervalMs = config.intervalValue * 60 * 1000;

    const timer = setInterval(async () => {
      await takeReading('auto');
    }, intervalMs);

    return () => clearInterval(timer);
  }, [assetId, config.isRunning, config.intervalMode, config.intervalValue, takeReading]);

  return {
    readings,
    loading,
    error: err,
    currentBitDepth,
    takeReading,
    setNotes,
    removeReading,
    clearAll,
    reload,
  };
}



