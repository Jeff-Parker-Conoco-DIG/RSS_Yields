import type { YieldReading, YieldAnalysis } from '../types';

/** Column definitions for the readings export */
const READING_COLUMNS: { key: keyof YieldReading; label: string; decimals: number }[] = [
  { key: 'depth', label: 'Depth (ft)', decimals: 1 },
  { key: 'inc', label: 'Inc (°)', decimals: 2 },
  { key: 'az', label: 'Az (°)', decimals: 2 },
  { key: 'courseLength', label: 'C.L. (ft)', decimals: 1 },
  { key: 'br', label: 'BR (°/100ft)', decimals: 2 },
  { key: 'tr', label: 'TR (°/100ft)', decimals: 2 },
  { key: 'dls', label: 'DLS (°/100ft)', decimals: 2 },
  { key: 'dutyCycle', label: 'DC %', decimals: 1 },
  { key: 'toolFaceSet', label: 'TF Set (°)', decimals: 1 },
  { key: 'toolFaceActual', label: 'TF Act (°)', decimals: 1 },
  { key: 'toolFaceStdDev', label: 'TF Std', decimals: 1 },
  { key: 'buildCommand', label: 'Build Cmd', decimals: 3 },
  { key: 'turnCommand', label: 'Turn Cmd', decimals: 3 },
  { key: 'section', label: 'Section', decimals: 0 },
  { key: 'notes', label: 'Notes', decimals: 0 },
];

/**
 * Export readings data to Excel using xlsx-js-style.
 */
export function exportToExcel(
  readings: YieldReading[],
  yieldAnalysis: YieldAnalysis | null,
  wellName: string,
): void {
  try {
    const XLSX = require('xlsx-js-style');

    const wb = XLSX.utils.book_new();

    // ─── Readings Sheet ──────────────────────────────────────
    const headers = READING_COLUMNS.map((c) => c.label);
    const rows = readings.map((reading) =>
      READING_COLUMNS.map((col) => {
        const val = reading[col.key];
        if (val == null) return null;
        if (typeof val === 'string') return val;
        return Number(val);
      }),
    );

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = READING_COLUMNS.map((c) => ({ wch: Math.max(c.label.length + 2, 10) }));

    // Header styling
    for (let i = 0; i < headers.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '333333' } },
          alignment: { horizontal: 'center' },
        };
      }
    }

    // Number formatting for data cells
    for (let r = 1; r <= rows.length; r++) {
      for (let c = 0; c < READING_COLUMNS.length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v != null && typeof cell.v === 'number') {
          cell.z = READING_COLUMNS[c].decimals === 1 ? '0.0' : READING_COLUMNS[c].decimals >= 2 ? '0.00' : '0';
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Readings');

    // ─── Summary Sheet ──────────────────────────────────────
    const summary: (string | number | null)[][] = [
      ['RSS Yield Summary'],
      ['Well', wellName],
      ['Readings', readings.length],
      [],
    ];

    const overall = yieldAnalysis?.overallDLS;
    if (overall) {
      summary.push(
        ['Overall DLS Yield Regression'],
        ['Slope (°/%DC)', overall.slope],
        ['Intercept (natural tendency)', overall.intercept],
        ['R²', overall.rSquared],
        ['Data Points', overall.n],
        [],
      );
    }

    const buildY = yieldAnalysis?.buildYield;
    if (buildY) {
      summary.push(
        ['Build Yield Regression'],
        ['Slope (°/unit build-cmd)', buildY.slope],
        ['Intercept (natural build)', buildY.intercept],
        ['R²', buildY.rSquared],
        [],
      );
    }

    const turnY = yieldAnalysis?.turnYield;
    if (turnY) {
      summary.push(
        ['Turn Yield Regression'],
        ['Slope (°/unit turn-cmd)', turnY.slope],
        ['Intercept (natural walk)', turnY.intercept],
        ['R²', turnY.rSquared],
      );
    }

    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    wsSummary['!cols'] = [{ wch: 20 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Write file
    const filename = `RSS_Yields_${wellName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  } catch (e) {
    console.error('Excel export failed:', e);
  }
}
