import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { YieldReading } from '../../types';
import styles from './AvgsWindow.module.css';

interface AvgsWindowProps {
  readings: YieldReading[];
  minSlideSeen: number;
  onMinSlideSeenChange: (val: number) => void;
  onClose: () => void;
}

export const AvgsWindow: React.FC<AvgsWindowProps> = ({ readings, minSlideSeen, onMinSlideSeenChange, onClose }) => {
  const [fromMd, setFromMd] = useState<string>('');

  // ── Dragging ────────────────────────────────────────────────────────
  const windowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: window.innerWidth - 270, y: 80 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    offset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Compute averages ───────────────────────────────────────────────
  const avgResults = useMemo(() => {
    const depth = parseFloat(fromMd);
    if (isNaN(depth) || readings.length === 0) return null;

    // Filter by depth range AND min slide seen
    const filtered = readings.filter((r) => {
      if (r.depth < depth) return false;
      if (minSlideSeen > 0 && (r.slideSeen == null || r.slideSeen < minSlideSeen)) return false;
      return true;
    });
    if (filtered.length === 0) return null;

    // Also count how many were excluded by the slide filter (for display)
    const depthOnly = readings.filter((r) => r.depth >= depth);
    const excluded = depthOnly.length - filtered.length;

    let brSum = 0, brN = 0;
    let trSum = 0, trN = 0;
    let dlsSum = 0, dlsN = 0;

    for (const r of filtered) {
      const br = r.mwdBr ?? r.br;
      const tr = r.mwdTr ?? r.tr;
      const dls = r.mwdDls ?? r.dls;
      if (br != null) { brSum += br; brN++; }
      if (tr != null) { trSum += tr; trN++; }
      if (dls != null) { dlsSum += dls; dlsN++; }
    }

    return {
      count: filtered.length,
      excluded,
      from: depth,
      to: Math.max(...filtered.map((r) => r.depth)),
      avgBr: brN > 0 ? brSum / brN : null,
      avgTr: trN > 0 ? trSum / trN : null,
      avgDls: dlsN > 0 ? dlsSum / dlsN : null,
    };
  }, [fromMd, readings, minSlideSeen]);

  return (
    <div
      ref={windowRef}
      className={styles.window}
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Title bar — draggable */}
      <div className={styles.titleBar} onMouseDown={onMouseDown}>
        <span className={styles.title}>AVGs</span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.body}>
        <div className={styles.row}>
          <label className={styles.label}>From MD</label>
          <input
            type="number"
            className={styles.input}
            value={fromMd}
            onChange={(e) => setFromMd(e.target.value)}
            placeholder="depth"
            autoFocus
          />
          <span className={styles.unit}>ft</span>
        </div>

        <div className={styles.row}>
          <label className={styles.label}>Min Slide</label>
          <input
            type="number"
            className={styles.input}
            value={minSlideSeen || ''}
            onChange={(e) => onMinSlideSeenChange(parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
          <span className={styles.unit}>ft</span>
        </div>

        {avgResults && (
          <div className={styles.results}>
            <div className={styles.info}>
              {avgResults.count} readings &bull; {avgResults.from.toFixed(0)}&ndash;{avgResults.to.toFixed(0)} ft
              {avgResults.excluded > 0 && (
                <span className={styles.excluded}> ({avgResults.excluded} excluded)</span>
              )}
            </div>
            <table className={styles.table}>
              <thead>
                <tr><th>BR</th><th>TR</th><th>DLS</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className={avgResults.avgBr != null ? styles.val : styles.nil}>
                    {avgResults.avgBr != null ? avgResults.avgBr.toFixed(2) : '—'}
                  </td>
                  <td className={avgResults.avgTr != null ? styles.val : styles.nil}>
                    {avgResults.avgTr != null ? avgResults.avgTr.toFixed(2) : '—'}
                  </td>
                  <td className={avgResults.avgDls != null ? styles.val : styles.nil}>
                    {avgResults.avgDls != null ? avgResults.avgDls.toFixed(2) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className={styles.unitLabel}>°/100ft</div>
          </div>
        )}

        {fromMd && !avgResults && (
          <div className={styles.noData}>No readings at or above {fromMd} ft</div>
        )}
      </div>
    </div>
  );
};
