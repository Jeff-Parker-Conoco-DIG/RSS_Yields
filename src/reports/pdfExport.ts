import type { YieldReading, YieldAnalysis } from '../types';

/**
 * Export a one-page RSS yield summary PDF using jspdf + jspdf-autotable.
 */
export function exportToPdf(
  readings: YieldReading[],
  yieldAnalysis: YieldAnalysis | null,
  wellName: string,
): void {
  try {
    const { jsPDF } = require('jspdf');
    require('jspdf-autotable');

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
        `Yield: ${regression.slope.toFixed(3)} °/%DC | R² = ${regression.rSquared.toFixed(3)} | Natural: ${regression.intercept.toFixed(2)} °/100ft`,
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
      'Inc',
      'Az',
      'C.L.',
      'BR',
      'TR',
      'DLS',
      'DC %',
      'TF Set',
      'Section',
    ];

    const fmt = (v: number | null | undefined, d: number): string =>
      v != null ? v.toFixed(d) : '—';

    const rows = displayReadings.map((r) => [
      fmt(r.depth, 1),
      fmt(r.inc, 2),
      fmt(r.az, 2),
      fmt(r.courseLength, 1),
      fmt(r.br, 2),
      fmt(r.tr, 2),
      fmt(r.dls, 2),
      fmt(r.dutyCycle, 1),
      fmt(r.toolFaceSet, 1),
      r.section,
    ]);

    (doc as any).autoTable({
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
