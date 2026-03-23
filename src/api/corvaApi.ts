import { log, warn, error } from '../utils/logger';

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

/**
 * Fetch the most recent non-planning drillstring for a well.
 * Uses corvaAPI (api.corva.ai) with aggregate to get latest by timestamp,
 * excluding planning BHAs.
 */
export async function fetchCurrentDrillstring(assetId: number): Promise<unknown | null> {
  if (!corvaAPI) return null;
  try {
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
          { $sort: { timestamp: -1 } },
          { $limit: 1 },
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
    const arr = Array.isArray(data) ? data : [];
    return arr[0] ?? null;
  } catch (e) {
    error('fetchCurrentDrillstring failed:', e);
    return null;
  }
}

/** Fetch slide sheet records for a well */
export async function fetchSlideSheet(assetId: number): Promise<unknown[]> {
  if (!corvaDataAPI) return [];
  try {
    const data = await corvaDataAPI.get(
      `/api/v1/data/corva/directional.slide-sheet/`,
      {
        query: JSON.stringify({ asset_id: assetId }),
        sort: JSON.stringify({ measured_depth: 1 }),
        limit: 500,
      },
    );
    return Array.isArray(data) ? data : [];
  } catch (e) {
    error('fetchSlideSheet failed:', e);
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
    // Fetch the most recent 5 raw WITS records (not summary-1ft which has aggregated field names)
    const data = await corvaDataAPI.get(
      `/api/v1/data/corva/wits/`,
      {
        query: JSON.stringify({ asset_id: assetId }),
        sort: JSON.stringify({ timestamp: -1 }),
        limit: 5,
      },
    );

    const records = Array.isArray(data) ? data : [];
    if (records.length === 0) return [];

    // Collect all unique data.* keys across the sampled records
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

    log(`Discovered ${channels.length} WITS channels (${channels.filter(c => c.hasData).length} with data)`);
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
