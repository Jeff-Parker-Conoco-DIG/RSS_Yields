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
        sort: JSON.stringify({ 'data.depth': 1 }),
        limit: 5000,
      },
    );
    const records = Array.isArray(data) ? data : [];
    // Fetch succeeded — dataset exists, clear any previous missing flag
    if (datasetMissingLogged) {
      datasetMissingLogged = false;
      log(`Dataset "${READINGS_DATASET}" is now available`);
    }
    return records.map(docToReading).filter((r): r is YieldReading => r !== null);
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
    // If save succeeds, dataset exists — clear the missing flag
    if (datasetMissingLogged) {
      datasetMissingLogged = false;
      log(`Dataset "${READINGS_DATASET}" is now available — readings will persist server-side`);
    }
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

// ─── Update notes on a reading ─────────────────────────────────────

export async function updateReadingNotes(
  assetId: number,
  readingId: string,
  notes: string,
): Promise<boolean> {
  if (!corvaDataAPI) return false;
  try {
    // Find the record by reading ID, then update
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

    // PATCH the notes field
    await corvaDataAPI.post(
      `/api/v1/data/${READINGS_DATASET}/${docId}`,
      { 'data.notes': notes },
    );
    log(`Updated notes for reading ${readingId}`);
    return true;
  } catch (e) {
    error('updateReadingNotes failed:', e);
    return false;
  }
}

// ─── Delete a reading ──────────────────────────────────────────────

export async function deleteReading(assetId: number, readingId: string): Promise<boolean> {
  if (!corvaDataAPI) return false;
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
    depth: r.depth,
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
    dutyCycle: r.dutyCycle,
    toolFaceSet: r.toolFaceSet,
    toolFaceActual: r.toolFaceActual,
    steeringForce: r.steeringForce,
    resultantTF: r.resultantTF,
    buildCommand: r.buildCommand,
    turnCommand: r.turnCommand,
    notes: r.notes,
    section: r.section,
    source: r.source,
  };
}

function docToReading(doc: unknown): YieldReading | null {
  try {
    const d = doc as Record<string, unknown>;
    const data = d.data as Record<string, unknown>;
    if (!data || !data.id) return null;

    const n = (v: unknown) => (v != null ? Number(v) : null);
    return {
      id: String(data.id),
      assetId: Number(d.asset_id),
      depth: Number(data.depth ?? 0),
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
      dutyCycle: n(data.dutyCycle),
      toolFaceSet: n(data.toolFaceSet),
      toolFaceActual: n(data.toolFaceActual),
      steeringForce: n(data.steeringForce),
      resultantTF: n(data.resultantTF),
      buildCommand: n(data.buildCommand),
      turnCommand: n(data.turnCommand),
      notes: String(data.notes ?? ''),
      section: (data.section as YieldReading['section']) ?? 'curve',
      timestamp: Number(d.timestamp ?? 0) * 1000, // Corva stores seconds, we use ms
      source: (data.source as 'auto' | 'manual') ?? 'manual',
    };
  } catch {
    return null;
  }
}
