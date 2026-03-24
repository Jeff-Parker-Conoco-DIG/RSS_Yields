import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { YieldReading } from '../../types';
import { circularMeanDeg } from '../../calculations/surveyMath';
import styles from './AverageRatesModal.module.css';

interface AverageRatesModalProps {
  readings: YieldReading[];
  onClose: () => void;
}

function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function fmt(v: number | null, decimals = 2): string {
  return v != null ? v.toFixed(decimals) : '\u2014';
}

export const AverageRatesModal: React.FC<AverageRatesModalProps> = ({
  readings,
  onClose,
}) => {
  const sorted = useMemo(
    () => [...readings].sort((a, b) => a.depth - b.depth),
    [readings],
  );

  const firstDepth = sorted.length > 0 ? sorted[0].depth : 0;
  const lastDepth = sorted.length > 0 ? sorted[sorted.length - 1].depth : 0;

  const [fromDepth, setFromDepth] = useState<string>(firstDepth.toFixed(1));
  const [toDepth, setToDepth] = useState<string>(lastDepth.toFixed(1));
  const [copied, setCopied] = useState(false);

  // Reset copied state after 2s
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const from = parseFloat(fromDepth) || 0;
  const to = toDepth.trim() === '' ? Infinity : parseFloat(toDepth) || 0;

  const results = useMemo(() => {
    const inRange = sorted.filter((r) => r.depth >= from && r.depth <= to);

    const withRssRates = inRange.filter(
      (r) => r.br != null && r.dls != null,
    );
    const withMwdRates = inRange.filter(
      (r) => r.mwdBr != null && r.mwdDls != null && r.mwdDls !== 0,
    );

    const avgRssBr = mean(withRssRates.map((r) => r.br!));
    const avgRssTr = mean(withRssRates.map((r) => r.tr ?? 0));
    const avgRssDls = mean(withRssRates.map((r) => r.dls!));

    const avgMwdBr = mean(withMwdRates.map((r) => r.mwdBr!));
    const avgMwdTr = mean(withMwdRates.map((r) => r.mwdTr ?? 0));
    const avgMwdDls = mean(withMwdRates.map((r) => r.mwdDls!));

    const dcReadings = inRange.filter((r) => r.dutyCycle != null);
    const avgDc = mean(dcReadings.map((r) => r.dutyCycle!));

    const tfSetAngles = inRange
      .filter((r) => r.toolFaceSet != null)
      .map((r) => r.toolFaceSet!);
    const avgTfSet = circularMeanDeg(tfSetAngles);

    const resTfAngles = withRssRates
      .filter((r) => r.resultantTF != null)
      .map((r) => r.resultantTF!);
    const avgResTf = circularMeanDeg(resTfAngles);

    const totalCl = inRange.reduce(
      (sum, r) => sum + (r.courseLength ?? 0),
      0,
    );

    const effectiveTo =
      toDepth.trim() === '' && inRange.length > 0
        ? inRange[inRange.length - 1].depth
        : to;

    return {
      count: inRange.length,
      totalCl,
      avgRssBr,
      avgRssTr,
      avgRssDls,
      avgMwdBr,
      avgMwdTr,
      avgMwdDls,
      avgDc,
      avgTfSet,
      avgResTf,
      effectiveTo,
    };
  }, [sorted, from, to, toDepth]);

  const handleCopy = useCallback(() => {
    const lines = [
      `YieldTracker Average Rates: ${from.toFixed(1)} - ${results.effectiveTo.toFixed(1)} ft (${results.count} readings, ${results.totalCl.toFixed(1)} ft)`,
      `RSS BR: ${fmt(results.avgRssBr)}  TR: ${fmt(results.avgRssTr)}  DLS: ${fmt(results.avgRssDls)} °/100ft`,
      `MWD BR: ${fmt(results.avgMwdBr)}  TR: ${fmt(results.avgMwdTr)}  DLS: ${fmt(results.avgMwdDls)} °/100ft`,
      `Avg DC: ${results.avgDc != null ? results.avgDc.toFixed(1) : '\u2014'}%  TF Set: ${fmt(results.avgTfSet, 1)}°  Res TF: ${fmt(results.avgResTf, 1)}°`,
    ];
    const text = lines.join('\n');
    // navigator.clipboard is unavailable inside Corva iframe — use fallback
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    } catch {
      fallbackCopy(text);
    }

    function fallbackCopy(t: string) {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
      } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
  }, [from, results]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Average Rates Calculator</span>
          <button className={styles.closeBtn} onClick={onClose}>
            {'\u2715'}
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Depth inputs */}
          <div className={styles.inputRow}>
            <span className={styles.inputLabel}>From Depth</span>
            <input
              type="number"
              className={styles.depthInput}
              value={fromDepth}
              onChange={(e) => setFromDepth(e.target.value)}
            />
            <span className={styles.inputUnit}>ft</span>
          </div>
          <div className={styles.inputRow}>
            <span className={styles.inputLabel}>To Depth</span>
            <input
              type="number"
              className={styles.depthInput}
              value={toDepth}
              onChange={(e) => setToDepth(e.target.value)}
              placeholder="latest"
            />
            <span className={styles.inputUnit}>ft</span>
            <span className={styles.inputHint}>
              {toDepth.trim() === '' ? '(latest reading)' : ''}
            </span>
          </div>

          <hr className={styles.divider} />

          {results.count === 0 ? (
            <div className={styles.emptyMsg}>
              No readings in selected depth range
            </div>
          ) : (
            <>
              <div className={styles.resultsLabel}>
                Results ({results.count} readings, {results.totalCl.toFixed(1)}{' '}
                ft)
              </div>

              {/* Rate table */}
              <table className={styles.rateTable}>
                <thead>
                  <tr>
                    <th></th>
                    <th>RSS</th>
                    <th>MWD</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>BR</td>
                    <td>{fmt(results.avgRssBr)}</td>
                    <td>{fmt(results.avgMwdBr)}</td>
                    <td className={styles.unitCol}>°/100ft</td>
                  </tr>
                  <tr>
                    <td>TR</td>
                    <td>{fmt(results.avgRssTr)}</td>
                    <td>{fmt(results.avgMwdTr)}</td>
                    <td className={styles.unitCol}>°/100ft</td>
                  </tr>
                  <tr>
                    <td>DLS</td>
                    <td>{fmt(results.avgRssDls)}</td>
                    <td>{fmt(results.avgMwdDls)}</td>
                    <td className={styles.unitCol}>°/100ft</td>
                  </tr>
                </tbody>
              </table>

              {/* Meta values */}
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Avg DC</span>
                <span className={styles.metaValue}>
                  {results.avgDc != null
                    ? `${results.avgDc.toFixed(1)}%`
                    : '\u2014'}
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Avg TF Set</span>
                <span className={styles.metaValue}>
                  {fmt(results.avgTfSet, 1)}°
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Avg Res TF</span>
                <span className={styles.metaValue}>
                  {fmt(results.avgResTf, 1)}°
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Total CL</span>
                <span className={styles.metaValue}>
                  {results.totalCl.toFixed(1)} ft
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Readings</span>
                <span className={styles.metaValue}>{results.count}</span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {results.count > 0 && (
          <div className={styles.footer}>
            <button
              className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
