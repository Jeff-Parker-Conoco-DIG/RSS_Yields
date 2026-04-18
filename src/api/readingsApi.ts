import type { YieldReading } from '../types';
import { READINGS_DATASET } from '../constants';
import { log, error } from '../utils/logger';

// ─── Corva SDK Client (same pattern as corvaApi.ts) ────────────────
type ApiClient = {
  get: (url: string, params?: Record<string, unknown>) => Promise<unknown>;
  post: (url: string, data?: unknown) => Promise<unknown>;
};

let corvaDataAPI: ApiClient | null = null;

try {
  const clients = require('@corva/ui/clients');
  corvaDataAPI = clients.corvaDataAPI;
} catch {
  const apiKey = process.env.CORVA_API_KEY ?? process.env.REACT_APP_CORVA_API_KEY;
  if (apiKey) {
    corvaDataAPI = {
      async get(path: string, params?: Record<string, unknown>) {
        const url = new URL(path, 'https://data.corva.ai');
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
        const res = await fetch(new URL(path, 'https://data.corva.ai').toString(), {
          method: 'POST',
          headers: { Authorization: `API ${apiKey}`, 'Content-Type': 'application/json' },
          body: data ? JSON.stringify(data) : undefined,
        });
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
      },
    };
  }
}

// ─── 404 guard: only log dataset-missing errors once ─────────────────
let datasetMissingLogged = false;

function sortReadingsByTimestamp(readings: YieldReading[]): YieldReading[] {
  return [...readings].sort((a, b) => {
    const tsA = Number.isFinite(a.timestamp) ? a.timestamp : 0;
    const tsB = Number.isFinite(b.timestamp) ? b.timestamp : 0;
    if (tsA !== tsB) return tsA - tsB;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

function isDatasetMissing(e: unknown): boolean {
  // Corva SDK errors have a .status property
  const status = (e as any)?.status;
  if (status === 404) return true;
  const msg = String(e);
  return msg.includes('404') || msg.includes('Not Found');
}

// ─── Fetch all readings for a well ─────────────────────────────────

export async function fetchReadings(assetId: number): Promise<YieldReading[]> {
  if (!corvaDataAPI) return [];
  try {
    const data = await corvaDataAPI.get(
      `/api/v1/data/${READINGS_DATASET}/`,
      {
        query: JSON.stringify({ asset_id: assetId }),
        sort: JSON.stringify({ timestamp: 1, _id: 1 }),
        limit: 5000,
      },
    );
    const records = Array.isArray(data) ? data : [];
    const parsed = records
      .map(docToReading)
      .filter((r): r is YieldReading => r !== null)
      // Hide soft-deleted rows from the UI. A backend cleanup app will
      // hard-delete these from the dataset; until then the record exists
      // but we don't show it.
      .filter((r) => r.deletedAt == null);
    return sortReadingsByTimestamp(parsed);
  } catch (e) {
    if (isDatasetMissing(e)) {
      if (!datasetMissingLogged) {
        datasetMissingLogged = true;
        log(`Readings dataset "${READINGS_DATASET}" not found (404). Readings will be stored in local state only.`);
      }
    } else {
      error('fetchReadings failed:', e);
    }
    return [];
  }
}

// ─── Save a new reading ────────────────────────────────────────────

export async function saveReading(reading: YieldReading): Promise<boolean> {
  if (!corvaDataAPI) {
    log('No API client — reading not persisted (dev mode)');
    return false;
  }
  if (datasetMissingLogged) {
    // Dataset doesn't exist — skip silently (already logged once)
    return false;
  }
  try {
    await corvaDataAPI.post(
      `/api/v1/data/${READINGS_DATASET}/`,
      {
        asset_id: reading.assetId,
        timestamp: Math.floor(reading.timestamp / 1000), // Corva uses seconds
        version: 1,
        data: readingToData(reading),
      },
    );
    log(`Saved reading at ${reading.depth} ft`);
    return true;
  } catch (e) {
    if (isDatasetMissing(e)) {
      if (!datasetMissingLogged) {
        datasetMissingLogged = true;
        log(`Readings dataset "${READINGS_DATASET}" not found (404). Readings will be stored in local state only.`);
      }
    } else {
      error('saveReading failed:', e);
    }
    return false;
  }
}

// ─── Update helpers: find doc + PATCH partial fields ───────────────

/**
 * Locate a reading's Corva document _id by asset + reading id.
 * Returns null if not found or on error.
 */
async function findDocId(assetId: number, readingId: string): Promise<string | null> {
  if (!corvaDataAPI) return null;
  try {
    const data = await corvaDataAPI.get(
      `/api/v1/data/${READINGS_DATASET}/`,
      {
        query: JSON.stringify({ asset_id: assetId, 'data.id': readingId }),
        limit: 1,
      },
    );
    const records = Array.isArray(data) ? data : [];
    if (records.length === 0) return null;
    const doc = records[0] as Record<string, unknown>;
    return typeof doc._id === 'string' ? doc._id : null;
  } catch (e) {
    if (isDatasetMissing(e)) return null;
    error('findDocId failed:', e);
    return null;
  }
}

/**
 * PATCH a subset of `data.*` fields on an existing record.
 *
 * Corva's data API supports MongoDB-style partial updates via PATCH with
 * dot-paths in the body. We send these as `{ "data.fieldName": value }`
 * pairs so only the listed fields mutate; everything else on the record
 * is untouched.
 *
 * Falls back to raw `fetch` because the Corva SDK client exposed in the
 * iframe only has `get` / `post` methods — PATCH goes through the ambient
 * session cookie inside the Corva shell, or an API-key header in dev.
 */
async function patchReadingData(
  docId: string,
  partialData: Record<string, unknown>,
): Promise<boolean> {
  // Build dot-path body: { "data.notes": "...", "data.deleted_at": 123, ... }
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(partialData)) {
    body[`data.${k}`] = v;
  }
  const url = new URL(
    `/api/v1/data/${READINGS_DATASET}/${docId}`,
    'https://data.corva.ai',
  );
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.CORVA_API_KEY ?? process.env.REACT_APP_CORVA_API_KEY;
  if (apiKey) headers['Authorization'] = `API ${apiKey}`;
  try {
    const res = await fetch(url.toString(), {
      method: 'PATCH',
      credentials: 'include', // use ambient session cookie inside Corva iframe
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      error(`patchReadingData ${docId} → ${res.status} ${res.statusText}`);
      return false;
    }
    return true;
  } catch (e) {
    error('patchReadingData failed:', e);
    return false;
  }
}

// ─── Update notes on a reading ─────────────────────────────────────

export async function updateReadingNotes(
  assetId: number,
  readingId: string,
  notes: string,
): Promise<boolean> {
  if (!corvaDataAPI || datasetMissingLogged) return false;
  const docId = await findDocId(assetId, readingId);
  if (!docId) return false;
  const ok = await patchReadingData(docId, { notes });
  if (ok) log(`Updated notes for reading ${readingId}`);
  return ok;
}

// ─── Soft-delete a reading (tombstone for backend cleanup) ─────────
//
// Stamps `data.deleted_at` (unix ms) on the record. The frontend filters
// records where `deleted_at != null` out of the loaded list, so the row
// disappears from the UI but persists in the dataset until a backend
// cleanup app hard-deletes it.
export async function softDeleteReading(
  assetId: number,
  readingId: string,
  deletedAtMs: number = Date.now(),
): Promise<boolean> {
  if (!corvaDataAPI || datasetMissingLogged) return false;
  const docId = await findDocId(assetId, readingId);
  if (!docId) return false;
  const ok = await patchReadingData(docId, { deleted_at: deletedAtMs });
  if (ok) log(`Tombstoned reading ${readingId} at ${deletedAtMs}`);
  return ok;
}

// ─── Delete a reading ──────────────────────────────────────────────

export async function deleteReading(assetId: number, readingId: string): Promise<boolean> {
  if (!corvaDataAPI || datasetMissingLogged) return false;
  try {
    const data = await corvaDataAPI.get(
      `/api/v1/data/${READINGS_DATASET}/`,
      {
        query: JSON.stringify({ asset_id: assetId, 'data.id': readingId }),
        limit: 1,
      },
    );
    const records = Array.isArray(data) ? data : [];
    if (records.length === 0) return false;

    const doc = records[0] as Record<string, unknown>;
    const docId = doc._id as string;

    // DELETE the document
    const url = new URL(
      `/api/v1/data/${READINGS_DATASET}/${docId}`,
      'https://data.corva.ai',
    );
    await fetch(url.toString(), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    log(`Deleted reading ${readingId}`);
    return true;
  } catch (e) {
    error('deleteReading failed:', e);
    return false;
  }
}

// ─── Helpers: convert between Corva doc and YieldReading ───────────

function readingToData(r: YieldReading): Record<string, unknown> {
  return {
    id: r.id,
    // Denormalized identity for downstream consumers
    well_name: r.wellName,
    well_asset_id: r.assetId,
    depth: r.depth,
    /** True Vertical Depth at bit (ft), interpolated from MWD surveys. */
    tvd: r.tvd,
    inc: r.inc,
    az: r.az,
    mwdInc: r.mwdInc,
    mwdAz: r.mwdAz,
    courseLength: r.courseLength,
    br: r.br,
    tr: r.tr,
    dls: r.dls,
    mwdBr: r.mwdBr,
    mwdTr: r.mwdTr,
    mwdDls: r.mwdDls,
    deltaInc: r.deltaInc,
    deltaAz: r.deltaAz,
    sensorDepth: r.sensorDepth,
    slideFt: r.slideFt,
    rotateFt: r.rotateFt,
    slideSeen: r.slideSeen,
    slideAhead: r.slideAhead,
    slideStartDepth: r.slideStartDepth,
    slideEndDepth: r.slideEndDepth,
    tfAccuracy: r.tfAccuracy,
    sheetMotorYield: r.sheetMotorYield,
    sheetBrYield: r.sheetBrYield,
    sheetTrYield: r.sheetTrYield,
    normalizedDls: r.normalizedDls,
    normalizedBr: r.normalizedBr,
    normalizedTr: r.normalizedTr,

    dutyCycle: r.dutyCycle,
    toolFaceSet: r.toolFaceSet,
    toolFaceActual: r.toolFaceActual,
    toolFaceStdDev: r.toolFaceStdDev,
    steeringForce: r.steeringForce,
    resultantTF: r.resultantTF,
    buildCommand: r.buildCommand,
    turnCommand: r.turnCommand,
    formation: r.formation,
    notes: r.notes,
    section: r.section,
    source: r.source,
    dls_outlier: r.dlsOutlier,
    /** Soft-delete tombstone (unix ms). Null on live records. */
    deleted_at: r.deletedAt,
  };
}

function docToReading(doc: unknown): YieldReading | null {
  try {
    const d = doc as Record<string, unknown>;
    const data = d.data as Record<string, unknown>;
    if (!data || !data.id) return null;

    const n = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const parsed = Number(v);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return {
      id: String(data.id),
      assetId: Number(d.asset_id),
      wellName: typeof data.well_name === 'string' ? data.well_name : null,
      depth: Number(data.depth ?? 0),
      tvd: n(data.tvd),
      inc: Number(data.inc ?? 0),
      az: Number(data.az ?? 0),
      mwdInc: n(data.mwdInc),
      mwdAz: n(data.mwdAz),
      courseLength: n(data.courseLength),
      br: n(data.br),
      tr: n(data.tr),
      dls: n(data.dls),
      mwdBr: n(data.mwdBr),
      mwdTr: n(data.mwdTr),
      mwdDls: n(data.mwdDls),
      deltaInc: n(data.deltaInc),
      deltaAz: n(data.deltaAz),
      sensorDepth: n(data.sensorDepth),
      slideFt: n(data.slideFt),
      rotateFt: n(data.rotateFt),
      slideSeen: n(data.slideSeen),
      slideAhead: n(data.slideAhead),
      slideStartDepth: n(data.slideStartDepth),
      slideEndDepth: n(data.slideEndDepth),
      tfAccuracy: n(data.tfAccuracy),
      sheetMotorYield: n(data.sheetMotorYield),
      sheetBrYield: n(data.sheetBrYield),
      sheetTrYield: n(data.sheetTrYield),
      normalizedDls: n(data.normalizedDls),
      normalizedBr: n(data.normalizedBr),
      normalizedTr: n(data.normalizedTr),
      // Derive dlsOutlier if missing (legacy readings pre-dating this field).
      dlsOutlier: typeof data.dlsOutlier === 'boolean'
        ? data.dlsOutlier
        : (() => {
            const d = n(data.mwdDls) ?? n(data.dls);
            return d != null && Math.abs(d) > 30;
          })(),

      dutyCycle: n(data.dutyCycle),
      toolFaceSet: n(data.toolFaceSet),
      toolFaceActual: n(data.toolFaceActual),
      toolFaceStdDev: n(data.toolFaceStdDev),
      steeringForce: n(data.steeringForce),
      resultantTF: n(data.resultantTF),
      buildCommand: n(data.buildCommand),
      turnCommand: n(data.turnCommand),
      formation: data.formation != null ? String(data.formation) : null,
      notes: String(data.notes ?? ''),
      section: (data.section as YieldReading['section']) ?? 'curve',
      timestamp: Number(d.timestamp ?? 0) * 1000, // Corva stores seconds, we use ms
      source: (data.source as 'auto' | 'manual') ?? 'manual',
      deletedAt: n(data.deleted_at),
    };
  } catch {
    return null;
  }
}
