import React, { useState, useCallback } from 'react';
import type { YieldReading } from '../../types';
import type { WitsChannelProfile } from '../../witsMapper/types';
import { SECTION_COLORS, YIELD_COLORS, DLS_OUTLIER_THRESHOLD } from '../../constants';
import { isDlsOutlier } from '../../utils/formatting';
import styles from './ReadingsTable.module.css';

interface ReadingsTableProps {
  readings: YieldReading[];
  onSetNotes: (readingId: string, notes: string) => void;
  onDelete: (readingId: string) => void;
  /** Required DLS to reach planned target (°/100ft). When set, colors BR/TR/DLS green/orange/red. */
  dlNeeded: number | null;
  /** Active WITS channel profile — used to rename columns for motor vs RSS configurations. */
  profile: WitsChannelProfile;
  /** When > 0, rows with slideSeen below this threshold are dimmed. */
  minSlideSeen?: number;
}

function fmt(v: number | null | undefined, decimals: number): string {
  if (v == null || isNaN(v)) return '\u2014';
  return v.toFixed(decimals);
}

function fmtPercent(v: number | null | undefined, decimals: number = 1): string {
  if (v == null || isNaN(v)) return '\u2014';
  return `${v.toFixed(decimals)} %`;
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

function tfAccuracyColor(val: number | null): string | undefined {
  if (val == null) return undefined;
  if (val >= 85) return YIELD_COLORS.good;
  if (val >= 70) return YIELD_COLORS.warning;
  return YIELD_COLORS.bad;
}

function myDeltaColor(delta: number | null): string | undefined {
  if (delta == null) return undefined;
  const abs = Math.abs(delta);
  if (abs <= 0.5) return YIELD_COLORS.good;
  if (abs <= 1.5) return YIELD_COLORS.warning;
  return YIELD_COLORS.bad;
}

export const ReadingsTable: React.FC<ReadingsTableProps> = ({
  readings,
  onSetNotes,
  onDelete,
  dlNeeded,
  profile,
  minSlideSeen = 0,
}) => {
  // When a bent motor is in the hole there is no separate RSS near-bit sensor.
  // Rename the "RSS" columns so the header reflects the actual hardware.
  const isMotor = profile.toolType === 'motor';
  const noReadingsColSpan = 21;
  const incLabel = isMotor ? 'Inc' : 'RSS Inc';
  const azLabel  = isMotor ? 'Az'  : 'RSS Az';
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
            <th className={styles.thFormation}>Formation</th>
            <th title="Measured Depth (ft)">Depth</th>
            <th title="True Vertical Depth at bit (ft), interpolated from MWD surveys">TVD</th>
            <th>{incLabel}</th>
            <th>{azLabel}</th>

            {/* MWD survey columns — hidden in motor mode (same sensor as Inc/Az) */}
            {!isMotor && <th className={styles.thMwd}>MWD Inc</th>}
            {!isMotor && <th className={styles.thMwd}>MWD Az</th>}

            <th>C.L.</th>
            <th>BR</th>
            <th>TR</th>
            <th>DLS</th>
            {isMotor && <th className={styles.thMotor} title="App-tracked normalized motor yield (from survey rates and slide ratio)">MY App</th>}
            {isMotor && <th className={styles.thMotor} title="Corva slide-sheet weighted motor_yield over the same reading interval">MY Sheet</th>}
            {isMotor && <th className={styles.thMotor} title="MY App minus MY Sheet">MY Δ</th>}

            {/* MWD rate columns — hidden in motor mode (same data source as BR/TR/DLS) */}
            {!isMotor && <th className={styles.thMwd}>MWD BR</th>}
            {!isMotor && <th className={styles.thMwd}>MWD TR</th>}
            {!isMotor && <th className={styles.thMwd}>MWD DLS</th>}

            {/* Motor: sensor depth, slide seen/ahead, slide interval */}
            {isMotor && <th className={styles.thMotor} title="MWD sensor depth (bit depth minus MWD offset)">Sensor</th>}

            {/* DC% for RSS; Slide Seen + Slide Ahead for motor */}
            {isMotor
              ? <>
                  <th className={styles.thMotor} title="Footage from active-slide start to sensor (or full most-recent slide when between slides)">Slide Seen</th>
                  <th className={styles.thMotor} title="Footage within the active slide between sensor and bit">Slide Ahead</th>
                  <th className={styles.thMotor} title="Footage-weighted toolface accuracy across overlapping slides">TF Acc %</th>
                  <th className={styles.thMotor} title="Start and end depth of the active slide interval">Slide</th>
                </>
              : <th>DC%</th>
            }
            {!isMotor && <th>TF Set</th>}
            {!isMotor && <th>TF Act</th>}
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
            const belowMinSlide = minSlideSeen > 0 && (r.slideSeen == null || r.slideSeen < minSlideSeen);
            const hasVisibleSlideWindow = (r.slideSeen ?? 0) > 0 || (r.slideAhead ?? 0) > 0;
            return (
              <tr
                key={r.id}
                className={`${isLatest ? styles.latestRow : ''} ${belowMinSlide ? styles.dimmedRow : ''}`}
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

                <td className={styles.formationCell}>{r.formation || '\u2014'}</td>

                {/* Core survey data */}
                <td className={styles.depthCell}>{fmt(r.depth, 1)}</td>
                <td className={styles.depthCell} title="True Vertical Depth (ft)">
                  {fmt(r.tvd, 1)}
                </td>
                <td>{fmt(r.inc, 2)}</td>
                <td>{fmt(r.az, 2)}</td>

                {/* MWD survey — hidden in motor mode (same sensor as Inc/Az) */}
                {!isMotor && <td className={styles.mwdCell}>{fmt(r.mwdInc, 2)}</td>}
                {!isMotor && <td className={styles.mwdCell}>{fmt(r.mwdAz, 2)}</td>}

                <td>{isFirst ? '\u2014' : fmt(r.courseLength, 1)}</td>

                {/* Rates — in motor mode these ARE the MWD rates (one sensor) */}
                <td style={{ color: brColor(r.mwdBr ?? r.br, dlNeeded, r.toolFaceSet) }}>
                  {isFirst ? '\u2014' : fmt(r.mwdBr ?? r.br, 2)}
                </td>
                <td style={{ color: trColor(r.mwdTr ?? r.tr, dlNeeded, r.toolFaceSet) }}>
                  {isFirst ? '\u2014' : fmt(r.mwdTr ?? r.tr, 2)}
                </td>
                <td
                  style={{ color: dlsColor(r.mwdDls ?? r.dls, dlNeeded) }}
                  title={
                    isDlsOutlier(r)
                      ? `DLS exceeds ${DLS_OUTLIER_THRESHOLD} °/100ft — likely a survey transient. This reading is excluded from MY APP and the yield regression.`
                      : undefined
                  }
                >
                  {isFirst
                    ? '\u2014'
                    : `${fmt(r.mwdDls ?? r.dls, 2)}${isDlsOutlier(r) ? ' \u26A0' : ''}`}
                </td>
                {isMotor && (
                  <td className={styles.motorCell}>{fmt(r.normalizedDls, 2)}</td>
                )}
                {isMotor && (
                  <td className={styles.motorCell}>{fmt(r.sheetMotorYield, 2)}</td>
                )}
                {isMotor && (
                  <td
                    className={styles.motorCell}
                    style={{
                      color: myDeltaColor(
                        r.normalizedDls != null && r.sheetMotorYield != null
                          ? (r.normalizedDls - r.sheetMotorYield)
                          : null,
                      ),
                    }}
                  >
                    {r.normalizedDls != null && r.sheetMotorYield != null
                      ? (r.normalizedDls - r.sheetMotorYield).toFixed(2)
                      : '\u2014'}
                  </td>
                )}

                {/* MWD Rates — separate RSS-vs-MWD comparison; hidden in motor mode */}
                {!isMotor && (
                  <td className={styles.mwdCell} style={{ color: brColor(r.mwdBr, dlNeeded, r.toolFaceSet) }}>
                    {isFirst ? '\u2014' : fmt(r.mwdBr, 2)}
                  </td>
                )}
                {!isMotor && (
                  <td className={styles.mwdCell} style={{ color: trColor(r.mwdTr, dlNeeded, r.toolFaceSet) }}>
                    {isFirst ? '\u2014' : fmt(r.mwdTr, 2)}
                  </td>
                )}
                {!isMotor && (
                  <td className={styles.mwdCell} style={{ color: dlsColor(r.mwdDls, dlNeeded) }}>
                    {isFirst ? '\u2014' : fmt(r.mwdDls, 2)}
                  </td>
                )}

                {/* Motor: sensor depth */}
                {isMotor && (
                  <td className={styles.motorCell}>{fmt(r.sensorDepth, 1)}</td>
                )}

                {/* DC% (RSS) / Slide Seen + Slide Ahead + Slide interval (motor) */}
                {isMotor
                  ? <>
                      <td className={styles.motorCell}>{isFirst ? '\u2014' : fmt(r.slideSeen, 1)}</td>
                      <td className={styles.motorCell}>{isFirst ? '\u2014' : fmt(r.slideAhead, 1)}</td>
                      <td
                        className={styles.motorCell}
                        style={{ color: hasVisibleSlideWindow ? tfAccuracyColor(r.tfAccuracy) : undefined }}
                        title="Footage-weighted TFO accuracy over the sensor-to-bit window"
                      >
                        {hasVisibleSlideWindow ? fmtPercent(r.tfAccuracy, 1) : '\u2014'}
                      </td>
                      <td className={styles.motorCell} style={{ fontSize: 10 }}>
                        {r.slideStartDepth != null && r.slideEndDepth != null
                          ? `${r.slideStartDepth.toFixed(0)}\u2013${r.slideEndDepth.toFixed(0)}`
                          : '\u2014'}
                      </td>
                    </>
                  : <td>{fmt(r.dutyCycle, 1)}</td>
                }
                {!isMotor && <td>{fmt(r.toolFaceSet, 1)}</td>}
                {!isMotor && <td>{fmt(r.toolFaceActual, 1)}</td>}
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
              <td colSpan={noReadingsColSpan} style={{ textAlign: 'center', color: '#666', padding: 30 }}>
                No readings yet — set a start depth and take your first reading
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
