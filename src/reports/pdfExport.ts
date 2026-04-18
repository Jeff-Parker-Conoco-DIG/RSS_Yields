import type { YieldReading, YieldAnalysis } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Export a one-page RSS yield summary PDF using jspdf + jspdf-autotable.
 */
export function exportToPdf(
  readings: YieldReading[],
  yieldAnalysis: YieldAnalysis | null,
  wellName: string,
): void {
  try {
    const doc = new jsPDF('landscape', 'mm', 'a4');

    // Title
    doc.setFontSize(16);
    doc.setTextColor(50, 50, 50);
    doc.text('RSS Yield Report', 14, 15);

    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(`Well: ${wellName}`, 14, 22);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 27);
    doc.text(`Readings: ${readings.length}`, 14, 32);

    const regression = yieldAnalysis?.overallDLS;
    if (regression) {
      doc.text(
        `Yield: ${regression.slope.toFixed(3)} deg/%DC | R^2 = ${regression.rSquared.toFixed(3)} | Natural: ${regression.intercept.toFixed(2)} deg/100ft`,
        14,
        37,
      );
    }

    // Readings table (top 20 + bottom 20 if many)
    const displayReadings =
      readings.length <= 40
        ? readings
        : [...readings.slice(0, 20), ...readings.slice(-20)];

    const columns = [
      'Depth',
      'Formation',
      'RSS Inc',
      'RSS Az',
      'MWD Inc',
      'MWD Az',
      'C.L.',
      'BR',
      'TR',
      'DLS',
      'MY App',
      'MY Sheet',
      'MY Delta',
      'MWD BR',
      'MWD TR',
      'MWD DLS',
      'DC %',
      'TF Set',
      'Res TF',
      'TF Acc %',
      'Section',
    ];

    const fmt = (v: number | null | undefined, d: number): string =>
      v != null ? v.toFixed(d) : '\u2014';
    const fmtPct = (v: number | null | undefined, d: number): string =>
      v != null ? `${v.toFixed(d)} %` : '\u2014';

    const rows = displayReadings.map((r) => [
      fmt(r.depth, 1),
      r.formation ?? '\u2014',
      fmt(r.inc, 2),
      fmt(r.az, 2),
      fmt(r.mwdInc, 2),
      fmt(r.mwdAz, 2),
      fmt(r.courseLength, 1),
      fmt(r.br, 2),
      fmt(r.tr, 2),
      fmt(r.dls, 2),
      fmt(r.normalizedDls, 2),
      fmt(r.sheetMotorYield, 2),
      (r.normalizedDls != null && r.sheetMotorYield != null)
        ? (r.normalizedDls - r.sheetMotorYield).toFixed(2)
        : '\u2014',
      fmt(r.mwdBr, 2),
      fmt(r.mwdTr, 2),
      fmt(r.mwdDls, 2),
      fmt(r.dutyCycle, 1),
      fmt(r.toolFaceSet, 1),
      fmt(r.resultantTF, 1),
      fmtPct(r.tfAccuracy, 1),
      r.section,
    ]);

    autoTable(doc, {
      startY: regression ? 42 : 37,
      head: [columns],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    // Save
    const filename = `RSS_Yields_${wellName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  } catch (e) {
    console.error('PDF export failed:', e);
  }
}
