import { log, warn, error } from '../utils/logger';
import type { FormationTop } from '../types';

// ─── Corva SDK Client Setup ───────────────────────────────────────
type ApiClient = {
  get: (url: string, params?: Record<string, unknown>) => Promise<unknown>;
  post: (url: string, data?: unknown) => Promise<unknown>;
};

let corvaDataAPI: ApiClient | null = null;
let corvaAPI: ApiClient | null = null;

// ─── Cerebro availability flag (skip after first 412) ─────────────
let cerebroAvailable = true;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const clients = require('@corva/ui/clients');
  corvaDataAPI = clients.corvaDataAPI;
  corvaAPI = clients.corvaAPI;
  log('Corva SDK clients loaded');
} catch {
  // Standalone dev mode — create shims if API key is available
  const apiKey = process.env.CORVA_API_KEY ?? process.env.REACT_APP_CORVA_API_KEY;
  if (apiKey) {
    const makeShim = (baseUrl: string): ApiClient => ({
      async get(path: string, params?: Record<string, unknown>) {
        const url = new URL(path, baseUrl);
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            if (v !== undefined) url.searchParams.set(k, String(v));
          }
        }
        const res = await fetch(url.toString(), {
          headers: { Authorization: `API ${apiKey}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
      },
      async post(path: string, data?: unknown) {
        const res = await fetch(new URL(path, baseUrl).toString(), {
          method: 'POST',
          headers: { Authorization: `API ${apiKey}`, 'Content-Type': 'application/json' },
          body: data ? JSON.stringify(data) : undefined,
        });
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
      },
    });
    corvaDataAPI = makeShim('https://data.corva.ai');
    corvaAPI = makeShim('https://api.corva.ai');
    log('Standalone API shims initialized');
  } else {
    warn('No Corva SDK and no API key — API calls will fail');
  }
}

export function isCorvaEnv(): boolean {
  return corvaAPI !== null || corvaDataAPI !== null;
}

// ─── Cached failure flags ─────────────────────────────────────────
// Some datasets return 412/404 permanently. Cache the failure so we
// don't spam the console or waste network calls on every poll cycle.
let cerebroFailed = false;

// ─── Fetch Functions ──────────────────────────────────────────────

/**
 * Fetch the active (highest BHA number) non-planning drillstring for a well.
 *
 * Corva drillstrings have a `data.id` field that represents the BHA number.
 * BHA #1 is the first run, BHA #5 is the 5th run, etc.
 * The highest non-planning BHA number is the currently active one.
 *
 * We sort by data.id descending and take the first non-planning result.
 */
export async function fetchCurrentDrillstring(assetId: number): Promise<unknown | null> {
  if (!corvaAPI) return null;
  try {
    // First fetch ALL non-planning drillstrings to find the highest BHA number
    // data.id can be a string or number, so we fetch all and sort client-side
    const data = await corvaAPI.get(
      '/v1/data/corva/data.drillstring',
      {
        aggregate: JSON.stringify([
          {
            $match: {
              asset_id: assetId,
              'data.planning': { $ne: true },
            },
          },
          {
            $project: {
              _id: 1,
              asset_id: 1,
              timestamp: 1,
              'data.id': 1,
              'data.name': 1,
              'data.components': 1,
              'data.planning': 1,
            },
          },
        ]),
      },
    );
    const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    if (arr.length === 0) return null;

    // Log all BHAs found for debugging
    const bhaList = arr.map(ds => {
      const d = ds.data as Record<string, unknown> | undefined;
      return { id: Number(d?.id ?? 0), name: d?.name ?? '' };
    });
    log(`Found ${arr.length} non-planning BHAs`);

    // Sort by numeric BHA ID descending — handles string or number data.id
    arr.sort((a, b) => {
      const aData = a.data as Record<string, unknown> | undefined;
      const bData = b.data as Record<string, unknown> | undefined;
      return Number(bData?.id ?? 0) - Number(aData?.id ?? 0);
    });

    const selected = arr[0];
    const dsData = (selected.data as Record<string, unknown> | undefined);
    log(`Selected active BHA: #${dsData?.id ?? '?'} "${dsData?.name ?? ''}"`);

    return selected;
  } catch (e) {
    error('fetchCurrentDrillstring failed:', e);
    return null;
  }
}

/**
 * Fetch all MWD survey stations for a well.
 * actual_survey is a single document per well with data.stations[] array.
 * We use the aggregate endpoint to unwind stations into individual records.
 */
export async function fetchAllSurveyStations(assetId: number): Promise<unknown[]> {
  if (!corvaAPI) return [];
  try {
    const data = await corvaAPI.get(
      '/v1/data/corva/data.actual_survey',
      {
        aggregate: JSON.stringify([
          { $match: { asset_id: assetId } },
          { $sort: { timestamp: -1 } },
          { $limit: 1 },
          { $unwind: '$data.stations' },
          { $replaceRoot: { newRoot: '$data.stations' } },
          { $sort: { measured_depth: 1 } },
        ]),
      },
    );
    return Array.isArray(data) ? data : [];
  } catch (e) {
    error('fetchAllSurveyStations failed:', e);
    return [];
  }
}

/** Fetch WITS summary-1ft data for near-bit inc/az over a depth range */
export async function fetchWitsNearBitData(
  assetId: number,
  fields: string[],
  depthFrom?: number,
  depthTo?: number,
): Promise<unknown[]> {
  if (!corvaDataAPI) return [];
  try {
    const query: Record<string, unknown> = { asset_id: assetId };
    if (depthFrom !== undefined || depthTo !== undefined) {
      query.measured_depth = {};
      if (depthFrom !== undefined) (query.measured_depth as Record<string, number>)['$gte'] = depthFrom;
      if (depthTo !== undefined) (query.measured_depth as Record<string, number>)['$lte'] = depthTo;
    }
    const data = await corvaDataAPI.get(
      `/api/v1/data/corva/wits.summary-1ft/`,
      {
        query: JSON.stringify(query),
        sort: JSON.stringify({ measured_depth: 1 }),
        fields: fields.join(','),
        limit: 10000,
      },
    );
    return Array.isArray(data) ? data : [];
  } catch (e) {
    error('fetchWitsNearBitData failed:', e);
    return [];
  }
}

/**
 * Fetch the single most recent WITS record for a well.
 *
 * Strategy: Fetch from ALL three data sources in parallel (summary-1ft,
 * raw WITS, and Cerebro) then merge the data objects into one. This ensures
 * we find iCruise/RSS channels regardless of which dataset they're in:
 *
 *   - wits.summary-1ft: RigCloud-renamed aggregated surface channels
 *   - corva/wits (raw): Pason short codes (svyinc, svyazc, rsua, rsda, etc.)
 *   - cerebro-raw: Halliburton iCruise channels (may have different names)
 *
 * Priority: Cerebro overwrites raw WITS overwrites summary-1ft for same-named
 * fields. Depth comes from whichever source has it.
 */
export async function fetchLatestWitsRecord(assetId: number): Promise<Record<string, unknown> | null> {
  if (!corvaDataAPI) return null;
  try {
    const fetchOne = async (path: string): Promise<Record<string, unknown> | null> => {
      try {
        const data = await corvaDataAPI!.get(path, {
          query: JSON.stringify({ asset_id: assetId }),
          sort: JSON.stringify({ timestamp: -1 }),
          limit: 1,
        });
        const records = Array.isArray(data) ? data : [];
        return records.length > 0 ? (records[0] as Record<string, unknown>) : null;
      } catch (e: any) {
        // Cache permanent failures for Cerebro (412 Precondition Failed, 404 Not Found)
        if (path.includes('cerebro')) {
          const status = e?.status ?? 0;
          const msg = String(e);
          if (status === 412 || status === 404 || msg.includes('412') || msg.includes('404')) {
            if (!cerebroFailed) {
              cerebroFailed = true;
              cerebroAvailable = false;
              warn('Cerebro dataset unavailable — disabled for this session');
            }
          }
        }
        return null;
      }
    };

    // Fetch sources in parallel — skip Cerebro if it already failed
    const [summaryRec, rawRec, cerebroRec] = await Promise.all([
      fetchOne('/api/v1/data/corva/wits.summary-1ft/'),
      fetchOne('/api/v1/data/corva/wits/'),
      cerebroFailed ? Promise.resolve(null) : fetchOne('/api/v1/data/corva/drilling.halliburton.cerebro-raw/'),
    ]);

    if (!summaryRec && !rawRec && !cerebroRec) {
      log('No WITS data found from any source');
      return null;
    }

    // Start with summary-1ft as base (has depth in data.bit_depth_max)
    const base = summaryRec ?? rawRec ?? cerebroRec!;
    const mergedData: Record<string, unknown> = {};

    // Layer 1: summary-1ft data
    if (summaryRec?.data && typeof summaryRec.data === 'object') {
      Object.assign(mergedData, summaryRec.data as Record<string, unknown>);
    }

    // Layer 2: raw WITS data (overwrites summary-1ft for same keys)
    if (rawRec?.data && typeof rawRec.data === 'object') {
      Object.assign(mergedData, rawRec.data as Record<string, unknown>);
    }

    // Layer 3: Cerebro data (highest priority for iCruise channels)
    if (cerebroRec?.data && typeof cerebroRec.data === 'object') {
      Object.assign(mergedData, cerebroRec.data as Record<string, unknown>);
    }

    // Use the best available top-level measured_depth
    const measuredDepth = base.measured_depth
      ?? summaryRec?.measured_depth
      ?? rawRec?.measured_depth
      ?? cerebroRec?.measured_depth;

    const merged: Record<string, unknown> = {
      ...base,
      measured_depth: measuredDepth,
      data: mergedData,
    };

    return merged;
  } catch (e) {
    error('fetchLatestWitsRecord failed:', e);
    return null;
  }
}

/**
 * Fetch the N most recent raw WITS records for a well.
 * Used by "Take Reading" to find the last change point for the watched channel.
 * Returns records sorted by timestamp DESCENDING (newest first).
 */
export async function fetchRecentWitsRecords(
  assetId: number,
  limit: number = 50,
): Promise<Record<string, unknown>[]> {
  if (!corvaDataAPI) return [];
  try {
    const data = await corvaDataAPI.get(
      '/api/v1/data/corva/wits/',
      {
        query: JSON.stringify({ asset_id: assetId }),
        sort: JSON.stringify({ timestamp: -1 }),
        limit,
      },
    );
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch (e) {
    error('fetchRecentWitsRecords failed:', e);
    return [];
  }
}

/** Fetch Cerebro raw data (iCruise) for a well */
export async function fetchCerebroRaw(
  assetId: number,
  depthFrom?: number,
  depthTo?: number,
): Promise<unknown[]> {
  if (!corvaDataAPI || cerebroFailed) return [];
  try {
    const query: Record<string, unknown> = { asset_id: assetId };
    if (depthFrom !== undefined || depthTo !== undefined) {
      query.measured_depth = {};
      if (depthFrom !== undefined) (query.measured_depth as Record<string, number>)['$gte'] = depthFrom;
      if (depthTo !== undefined) (query.measured_depth as Record<string, number>)['$lte'] = depthTo;
    }
    const data = await corvaDataAPI.get(
      `/api/v1/data/corva/drilling.halliburton.cerebro-raw/`,
      {
        query: JSON.stringify(query),
        sort: JSON.stringify({ measured_depth: 1 }),
        limit: 10000,
      },
    );
    return Array.isArray(data) ? data : [];
  } catch (e) {
    const msg = String(e);
    if (msg.includes('412') || msg.includes('404')) {
      if (!cerebroFailed) {
        cerebroFailed = true;
        warn('Cerebro dataset unavailable (412/404) — will skip in future fetches');
      }
    } else {
      error('fetchCerebroRaw failed:', e);
    }
    return [];
  }
}



/** Fetch slide sheet records for a well.
 *
 * NOTE: The `directional.slide-sheet` dataset stores slide events nested
 * inside `data.slides[]` arrays.  The top-level `measured_depth` on each
 * record does NOT correspond to the individual slide depths, so depth-
 * based filtering (`measured_depth: { $gte }`) returns zero results even
 * when slides exist at the requested depth.  We therefore always fetch
 * ALL records for the well and let the caller filter in memory.
 *
 * Sorted DESCENDING so the 500-record limit captures the most recent /
 * deepest records first — these are the ones that contain slides near
 * the current bit depth and matter most for the motor yield calculation.
 */
export async function fetchSlideSheet(
  assetId: number,
): Promise<unknown[]> {
  if (!corvaDataAPI) return [];
  try {
    const path = `/api/v1/data/corva/directional.slide-sheet/`;
    const baseQuery = JSON.stringify({ asset_id: assetId });

    // Pull from two sort keys and merge unique docs:
    // - measured_depth catches deepest records
    // - timestamp catches newest records
    const [depthData, timeData] = await Promise.all([
      corvaDataAPI.get(path, {
        query: baseQuery,
        sort: JSON.stringify({ measured_depth: -1 }),
        limit: 5000,
      }),
      corvaDataAPI.get(path, {
        query: baseQuery,
        sort: JSON.stringify({ timestamp: -1 }),
        limit: 5000,
      }),
    ]);

    const depthRecords = Array.isArray(depthData) ? depthData : [];
    const timeRecords = Array.isArray(timeData) ? timeData : [];
    const merged = new Map<string, unknown>();

    for (const rec of [...depthRecords, ...timeRecords]) {
      const row = rec as Record<string, unknown>;
      const key = String(row._id ?? `${row.timestamp ?? ''}:${JSON.stringify(row.data ?? {})}`);
      if (!merged.has(key)) merged.set(key, rec);
    }

    return Array.from(merged.values());
  } catch (e) {
    error('fetchSlideSheet failed:', e);
    return [];
  }
}

/** Fetch formation tops for a well. */
export async function fetchFormations(assetId: number): Promise<FormationTop[]> {
  if (!corvaDataAPI) return [];
  try {
    const data = await corvaDataAPI.get('/api/v1/data/corva/data.formations/', {
      limit: 1000,
      query: JSON.stringify({ asset_id: assetId }),
      sort: JSON.stringify({ 'data.md': 1 }),
      fields: 'data.md,data.td,data.formation_name',
    });

    const records = Array.isArray(data) ? data : [];
    const formations: FormationTop[] = [];

    for (const rec of records) {
      const row = rec as Record<string, unknown>;
      const recData = (row.data ?? {}) as Record<string, unknown>;
      // md and td come as numbers OR null. null → NaN via Number(); we keep
      // those as NaN so the downstream MD-based lookup can filter them out
      // (some deep formations only have TVD populated).
      const rawMd = recData.md;
      const rawTd = recData.td;
      const md = rawMd == null ? NaN : Number(rawMd);
      const td = rawTd == null ? NaN : Number(rawTd);
      // Skip records with neither md nor td — truly useless.
      if (!Number.isFinite(md) && !Number.isFinite(td)) continue;
      const name = String(recData.formation_name ?? '');
      if (!name) continue;

      formations.push({ md, td, name });
    }

    // Sort by md ascending. NaN mds sort last (they can't be placed by MD).
    formations.sort((a, b) => {
      const aMd = Number.isFinite(a.md) ? a.md : Number.POSITIVE_INFINITY;
      const bMd = Number.isFinite(b.md) ? b.md : Number.POSITIVE_INFINITY;
      return aMd - bMd;
    });

    console.group(
      `%c[YieldTracker] 🪨 Formations loaded from corva/data.formations (asset=${assetId})`,
      'color:#fdcb6e;font-weight:bold',
    );
    console.log(`Got ${formations.length} formation record(s) (sorted by md ascending):`);
    for (const f of formations) {
      const mdStr = Number.isFinite(f.md) ? f.md.toFixed(1) : 'null';
      const tdStr = Number.isFinite(f.td) ? f.td.toFixed(1) : 'null';
      console.log(`  ${f.name || '(unnamed)'}  md=${mdStr}  tvd=${tdStr}`);
    }
    if (formations.length === 0) {
      console.warn('  No formations returned — formation column will be null.');
    }
    console.groupEnd();

    return formations;
  } catch (e) {
    error('fetchFormations failed:', e);
    return [];
  }
}

/** Fetch directional rotational tendency data */
export async function fetchDirectionalTendency(assetId: number): Promise<unknown[]> {
  if (!corvaDataAPI) return [];
  try {
    const data = await corvaDataAPI.get(
      `/api/v1/data/corva/directional.rotational-tendency/`,
      {
        query: JSON.stringify({ asset_id: assetId }),
        sort: JSON.stringify({ measured_depth: 1 }),
        limit: 500,
      },
    );
    return Array.isArray(data) ? data : [];
  } catch (e) {
    error('fetchDirectionalTendency failed:', e);
    return [];
  }
}

// ─── WITS Channel Discovery ─────────────────────────────────────

export interface DiscoveredChannel {
  /** The field key under data.* (e.g. 'iCDutyCycle', 'iCInc') */
  field: string;
  /** The last known value (helps DD identify what the channel is) */
  lastValue: number | string | null;
  /** Whether this field had non-null data in the sampled records */
  hasData: boolean;
}

/**
 * Discover available WITS channels on a well by fetching recent records
 * from wits.summary-1ft and extracting all data.* field keys.
 *
 * This is the key to making the WITS mapper work across rigs — the field
 * names in data.* are the RigCloud rename values configured per-rig by
 * the data provider (Pason, Totco, etc). They vary from rig to rig.
 *
 * Returns a sorted list of discovered channels with their last known values.
 */
export async function discoverWitsChannels(assetId: number): Promise<DiscoveredChannel[]> {
  if (!corvaDataAPI) return [];
  try {
    // Fetch from BOTH raw WITS and summary-1ft in parallel
    // Some channels only exist in one dataset (e.g. toolface may only be in summary-1ft)
    const [rawData, summaryData] = await Promise.all([
      corvaDataAPI.get(`/api/v1/data/corva/wits/`, {
        query: JSON.stringify({ asset_id: assetId }),
        sort: JSON.stringify({ timestamp: -1 }),
        limit: 5,
      }),
      corvaDataAPI.get(`/api/v1/data/corva/wits.summary-1ft/`, {
        query: JSON.stringify({ asset_id: assetId }),
        sort: JSON.stringify({ timestamp: -1 }),
        limit: 5,
      }),
    ]);

    const rawRecords = Array.isArray(rawData) ? rawData : [];
    const summaryRecords = Array.isArray(summaryData) ? summaryData : [];
    const allRecords = [...rawRecords, ...summaryRecords];

    if (allRecords.length === 0) return [];

    // Collect all unique data.* keys across ALL records from both datasets
    const fieldMap = new Map<string, { lastValue: unknown; count: number }>();

    for (const record of allRecords) {
      const dataObj = (record as Record<string, unknown>)?.data;
      if (!dataObj || typeof dataObj !== 'object') continue;

      for (const [key, value] of Object.entries(dataObj as Record<string, unknown>)) {
        const existing = fieldMap.get(key);
        const hasValue = value != null && value !== '' && value !== 0;
        if (!existing) {
          fieldMap.set(key, { lastValue: value, count: hasValue ? 1 : 0 });
        } else {
          if (hasValue) {
            existing.count++;
            existing.lastValue = value; // Keep the most recent non-null value
          }
        }
      }
    }

    // Convert to sorted array
    const channels: DiscoveredChannel[] = [];
    for (const [field, info] of fieldMap) {
      channels.push({
        field,
        lastValue: info.lastValue as number | string | null,
        hasData: info.count > 0,
      });
    }

    // Sort: channels with data first, then alphabetically
    channels.sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
      return a.field.localeCompare(b.field);
    });

    log(`Discovered ${channels.length} WITS channels from raw+summary (${channels.filter(c => c.hasData).length} with data, raw=${rawRecords.length} summary=${summaryRecords.length} records)`);
    return channels;
  } catch (e) {
    error('discoverWitsChannels failed:', e);
    return [];
  }
}

/**
 * Discover available Cerebro channels on a well (for iCruise).
 * Same approach as WITS discovery but queries the Cerebro dataset.
 */
export async function discoverCerebroChannels(assetId: number): Promise<DiscoveredChannel[]> {
  if (!corvaDataAPI || cerebroFailed) return [];
  try {
    const data = await corvaDataAPI.get(
      `/api/v1/data/corva/drilling.halliburton.cerebro-raw/`,
      {
        query: JSON.stringify({ asset_id: assetId }),
        sort: JSON.stringify({ timestamp: -1 }),
        limit: 5,
      },
    );

    const records = Array.isArray(data) ? data : [];
    if (records.length === 0) return [];

    const fieldMap = new Map<string, { lastValue: unknown; count: number }>();

    for (const record of records) {
      const dataObj = (record as Record<string, unknown>)?.data;
      if (!dataObj || typeof dataObj !== 'object') continue;

      for (const [key, value] of Object.entries(dataObj as Record<string, unknown>)) {
        const existing = fieldMap.get(key);
        const hasValue = value != null && value !== '' && value !== 0;
        if (!existing) {
          fieldMap.set(key, { lastValue: value, count: hasValue ? 1 : 0 });
        } else {
          if (hasValue) {
            existing.count++;
            existing.lastValue = value;
          }
        }
      }
    }

    const channels: DiscoveredChannel[] = [];
    for (const [field, info] of fieldMap) {
      channels.push({
        field,
        lastValue: info.lastValue as number | string | null,
        hasData: info.count > 0,
      });
    }

    channels.sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
      return a.field.localeCompare(b.field);
    });

    log(`Discovered ${channels.length} Cerebro channels (${channels.filter(c => c.hasData).length} with data)`);
    return channels;
  } catch (e) {
    const msg = String(e);
    if (msg.includes('412') || msg.includes('404')) {
      if (!cerebroFailed) {
        cerebroFailed = true;
        warn('Cerebro dataset unavailable (412/404) — will skip in future fetches');
      }
    } else {
      error('discoverCerebroChannels failed:', e);
    }
    return [];
  }
}
