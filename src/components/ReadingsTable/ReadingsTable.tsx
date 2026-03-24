import React, { useState, useCallback } from 'react';
import type { YieldReading } from '../../types';
import { SECTION_COLORS, YIELD_COLORS } from '../../constants';
import styles from './ReadingsTable.module.css';

interface ReadingsTableProps {
  readings: YieldReading[];
  onSetNotes: (readingId: string, notes: string) => void;
  onDelete: (readingId: string) => void;
  /** Required DLS to reach planned target (°/100ft). When set, colors BR/TR/DLS green/orange/red. */
  dlNeeded: number | null;
}

function fmt(v: number | null | undefined, decimals: number): string {
  if (v == null || isNaN(v)) return '\u2014';
  return v.toFixed(decimals);
}

/** Fallback magnitude-based color — used only when dlNeeded is not set */
function rateColorMagnitude(val: number | null): string | undefined {
  if (val == null) return undefined;
  const abs = Math.abs(val);
  if (abs > 5) return YIELD_COLORS.bad;
  if (abs > 3) return YIELD_COLORS.warning;
  return undefined;
}

/**
 * DLS color against a required dogleg target.
 * Green ≥ 100% of target, orange 85–99%, red < 85%.
 * Falls back to magnitude-based coloring when dlNeeded is not set.
 */
function dlsColor(val: number | null, dlNeeded: number | null): string | undefined {
  if (val == null) return undefined;
  if (dlNeeded != null && dlNeeded > 0) {
    const pct = val / dlNeeded;
    if (pct >= 1.0) return YIELD_COLORS.good;
    if (pct >= 0.85) return YIELD_COLORS.warning;
    return YIELD_COLORS.bad;
  }
  return rateColorMagnitude(val);
}

/**
 * BR color against the build component of dlNeeded.
 * brNeeded = dlNeeded × cos(TF). Comparison is sign-aware:
 *   building (brNeeded > 0): higher BR is better.
 *   dropping (brNeeded < 0): more-negative BR is better.
 * Falls back to magnitude color when dlNeeded or TF not available.
 */
function brColor(br: number | null, dlNeeded: number | null, tf: number | null): string | undefined {
  if (br == null) return undefined;
  if (dlNeeded != null && dlNeeded > 0 && tf != null) {
    const brNeeded = dlNeeded * Math.cos((tf * Math.PI) / 180);
    if (Math.abs(brNeeded) < 0.05) {
      // TF near 90°/270° — BR contribution is negligible, no DL-based color
      return undefined;
    }
    const pct = br / brNeeded;  // Works for both positive (build) and negative (drop) targets
    if (pct >= 1.0) return YIELD_COLORS.good;
    if (pct >= 0.85) return YIELD_COLORS.warning;
    return YIELD_COLORS.bad;
  }
  return rateColorMagnitude(br);
}

/**
 * TR color against the turn component of dlNeeded.
 * trNeeded = dlNeeded × sin(TF). Same sign-aware logic as brColor.
 */
function trColor(tr: number | null, dlNeeded: number | null, tf: number | null): string | undefined {
  if (tr == null) return undefined;
  if (dlNeeded != null && dlNeeded > 0 && tf != null) {
    const trNeeded = dlNeeded * Math.sin((tf * Math.PI) / 180);
    if (Math.abs(trNeeded) < 0.05) {
      // TF near 0°/180° — TR contribution is negligible, no DL-based color
      return undefined;
    }
    const pct = tr / trNeeded;
    if (pct >= 1.0) return YIELD_COLORS.good;
    if (pct >= 0.85) return YIELD_COLORS.warning;
    return YIELD_COLORS.bad;
  }
  return rateColorMagnitude(tr);
}

/** Color code resultant TF based on divergence from TF Set */
function resTfColor(resTf: number | null, tfSet: number | null): string | undefined {
  if (resTf == null || tfSet == null) return undefined;
  let diff = Math.abs(resTf - tfSet);
  if (diff > 180) diff = 360 - diff;
  if (diff > 60) return YIELD_COLORS.bad;
  if (diff > 30) return YIELD_COLORS.warning;
  return undefined;
}

export const ReadingsTable: React.FC<ReadingsTableProps> = ({
  readings,
  onSetNotes,
  onDelete,
  dlNeeded,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const startEdit = useCallback((reading: YieldReading) => {
    setEditingId(reading.id);
    setEditText(reading.notes);
  }, []);

  const commitEdit = useCallback(() => {
    if (editingId) {
      onSetNotes(editingId, editText);
      setEditingId(null);
    }
  }, [editingId, editText, onSetNotes]);

  const confirmDelete = useCallback((id: string) => {
    if (deleteConfirm === id) {
      onDelete(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm((prev) => (prev === id ? null : prev)), 3000);
    }
  }, [deleteConfirm, onDelete]);

  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thSection}>Sec</th>
            <th>Depth</th>
            <th>RSS Inc</th>
            <th>RSS Az</th>
            <th className={styles.thMwd}>MWD Inc</th>
            <th className={styles.thMwd}>MWD Az</th>
            <th>C.L.</th>
            <th>BR</th>
            <th>TR</th>
            <th>DLS</th>
            <th className={styles.thMwd}>MWD BR</th>
            <th className={styles.thMwd}>MWD TR</th>
            <th className={styles.thMwd}>MWD DLS</th>
            <th>DC%</th>
            <th>TF Set</th>
            <th>TF Act</th>
            <th>Res TF</th>
            <th className={styles.thNotes}>Notes</th>
            <th className={styles.thSrc}>Src</th>
            <th className={styles.thDel}></th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r, i) => {
            const isLatest = i === readings.length - 1;
            const isFirst = r.br == null && r.tr == null && r.dls == null;
            return (
              <tr
                key={r.id}
                className={isLatest ? styles.latestRow : undefined}
              >
                {/* Section badge */}
                <td className={styles.sectionCell}>
                  <span
                    className={styles.sectionBadge}
                    style={{ background: SECTION_COLORS[r.section] + '33', color: SECTION_COLORS[r.section] }}
                  >
                    {r.section.slice(0, 3).toUpperCase()}
                  </span>
                </td>

                {/* Core survey data */}
                <td className={styles.depthCell}>{fmt(r.depth, 1)}</td>
                <td>{fmt(r.inc, 2)}</td>
                <td>{fmt(r.az, 2)}</td>

                {/* MWD survey */}
                <td className={styles.mwdCell}>{fmt(r.mwdInc, 2)}</td>
                <td className={styles.mwdCell}>{fmt(r.mwdAz, 2)}</td>

                <td>{isFirst ? '\u2014' : fmt(r.courseLength, 1)}</td>

                {/* RSS Rates — colored against DL Needed when set */}
                <td style={{ color: brColor(r.br, dlNeeded, r.toolFaceSet) }}>{isFirst ? '\u2014' : fmt(r.br, 2)}</td>
                <td style={{ color: trColor(r.tr, dlNeeded, r.toolFaceSet) }}>{isFirst ? '\u2014' : fmt(r.tr, 2)}</td>
                <td style={{ color: dlsColor(r.dls, dlNeeded) }}>{isFirst ? '\u2014' : fmt(r.dls, 2)}</td>

                {/* MWD Rates — ground-truth; also colored against DL Needed */}
                <td className={styles.mwdCell} style={{ color: brColor(r.mwdBr, dlNeeded, r.toolFaceSet) }}>{isFirst ? '\u2014' : fmt(r.mwdBr, 2)}</td>
                <td className={styles.mwdCell} style={{ color: trColor(r.mwdTr, dlNeeded, r.toolFaceSet) }}>{isFirst ? '\u2014' : fmt(r.mwdTr, 2)}</td>
                <td className={styles.mwdCell} style={{ color: dlsColor(r.mwdDls, dlNeeded) }}>{isFirst ? '\u2014' : fmt(r.mwdDls, 2)}</td>

                {/* Steering */}
                <td>{fmt(r.dutyCycle, 1)}</td>
                <td>{fmt(r.toolFaceSet, 1)}</td>
                <td>{fmt(r.toolFaceActual, 1)}</td>
                <td style={{ color: resTfColor(r.resultantTF, r.toolFaceSet) }}>{isFirst ? '\u2014' : fmt(r.resultantTF, 1)}</td>

                {/* Notes — editable */}
                <td className={styles.notesCell}>
                  {editingId === r.id ? (
                    <input
                      className={styles.notesInput}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span
                      className={styles.notesText}
                      onClick={() => startEdit(r)}
                      title="Click to edit notes"
                    >
                      {r.notes || '+ note'}
                    </span>
                  )}
                </td>

                {/* Source indicator */}
                <td className={styles.srcCell}>
                  <span className={r.source === 'auto' ? styles.srcAuto : styles.srcManual}>
                    {r.source === 'auto' ? 'A' : 'M'}
                  </span>
                </td>

                {/* Delete */}
                <td className={styles.deleteCell}>
                  <button
                    className={`${styles.deleteBtn} ${deleteConfirm === r.id ? styles.deleteConfirm : ''}`}
                    onClick={() => confirmDelete(r.id)}
                    title={deleteConfirm === r.id ? 'Click again to confirm delete' : 'Delete this reading'}
                  >
                    {deleteConfirm === r.id ? '\u2713' : '\u2715'}
                  </button>
                </td>
              </tr>
            );
          })}
          {readings.length === 0 && (
            <tr>
              <td colSpan={20} style={{ textAlign: 'center', color: '#666', padding: 30 }}>
                No readings yet — set a start depth and take your first reading
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
