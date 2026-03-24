import React, { useMemo, useState, useCallback, useRef } from 'react';
import type { YieldReading, WellSection } from '../../types';
import styles from './DepthTrackPlot.module.css';

interface DepthTrackPlotProps {
  readings: YieldReading[];
}

// ─── Layout constants ──────────────────────────────────────────────
const TRACK_WIDTH = 110;
const TRACK_GAP = 4;
const LABEL_HEIGHT = 40;
const DEPTH_AXIS_WIDTH = 55;
const PADDING = { top: 10, right: 10, bottom: 20 };
const PX_PER_FT = 3;
const MIN_CHART_HEIGHT = 300;

// ─── Track definitions ─────────────────────────────────────────────
interface TrackDef {
  label: string;
  unit: string;
  lines: {
    key: string;
    getValue: (r: YieldReading) => number | null;
    color: string;
    dashed: boolean;
    filled?: boolean;
  }[];
  scaleMode: 'auto' | 'fixed';
  fixedMin?: number;
  fixedMax?: number;
  autoPadding?: number;
}

const TRACKS: TrackDef[] = [
  {
    label: 'Inclination',
    unit: '°',
    lines: [
      { key: 'rssInc', getValue: (r) => r.inc, color: '#4caf50', dashed: false },
      { key: 'mwdInc', getValue: (r) => r.mwdInc, color: '#888', dashed: true },
    ],
    scaleMode: 'auto',
    autoPadding: 2,
  },
  {
    label: 'Azimuth',
    unit: '°',
    lines: [
      { key: 'rssAz', getValue: (r) => r.az, color: '#2196f3', dashed: false },
      { key: 'mwdAz', getValue: (r) => r.mwdAz, color: '#888', dashed: true },
    ],
    scaleMode: 'auto',
    autoPadding: 5,
  },
  {
    label: 'DLS',
    unit: '°/100ft',
    lines: [
      { key: 'rssDls', getValue: (r) => r.dls, color: '#ff9800', dashed: false },
      { key: 'mwdDls', getValue: (r) => r.mwdDls, color: '#888', dashed: true },
    ],
    scaleMode: 'auto',
    fixedMin: 0,
    autoPadding: 0,
  },
  {
    label: 'Duty Cycle',
    unit: '%',
    lines: [
      { key: 'dc', getValue: (r) => r.dutyCycle, color: '#9c27b0', dashed: false, filled: true },
    ],
    scaleMode: 'fixed',
    fixedMin: 0,
    fixedMax: 100,
  },
  {
    label: 'Toolface',
    unit: '°',
    lines: [
      { key: 'tfSet', getValue: (r) => r.toolFaceSet, color: '#e91e63', dashed: false },
      { key: 'tfRes', getValue: (r) => r.resultantTF, color: '#888', dashed: true },
    ],
    scaleMode: 'fixed',
    fixedMin: 0,
    fixedMax: 360,
  },
];

// ─── Section colors ────────────────────────────────────────────────
const SECTION_BG: Record<WellSection, string> = {
  curve: 'rgba(245,158,11,0.05)',
  uturn: 'rgba(139,92,246,0.05)',
};

// ─── Helpers ───────────────────────────────────────────────────────

function computeScale(
  track: TrackDef,
  readings: YieldReading[],
): [number, number] {
  if (track.scaleMode === 'fixed') {
    return [track.fixedMin ?? 0, track.fixedMax ?? 100];
  }

  let min = Infinity;
  let max = -Infinity;

  for (const line of track.lines) {
    for (const r of readings) {
      const v = line.getValue(r);
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  if (!isFinite(min)) return [0, 1];

  const pad = track.autoPadding ?? 0;
  min = track.fixedMin != null ? track.fixedMin : min - pad;
  max = max + pad;

  // DLS: ensure max is at least data * 1.2
  if (track.label === 'DLS' && max > 0) {
    max = max * 1.2;
  }

  if (max <= min) max = min + 1;
  return [min, max];
}

function buildPolylinePoints(
  readings: YieldReading[],
  getValue: (r: YieldReading) => number | null,
  scaleX: (v: number) => number,
  scaleY: (depth: number) => number,
): string {
  const pts: string[] = [];
  for (const r of readings) {
    const val = getValue(r);
    if (val == null) continue;
    pts.push(`${scaleX(val)},${scaleY(r.depth)}`);
  }
  return pts.join(' ');
}

function buildAreaPolygon(
  readings: YieldReading[],
  getValue: (r: YieldReading) => number | null,
  scaleX: (v: number) => number,
  scaleY: (depth: number) => number,
  x0: number,
): string {
  const valPts: { x: number; y: number }[] = [];
  for (const r of readings) {
    const val = getValue(r);
    if (val == null) continue;
    valPts.push({ x: scaleX(val), y: scaleY(r.depth) });
  }
  if (valPts.length < 2) return '';
  const first = valPts[0];
  const last = valPts[valPts.length - 1];
  return `${x0},${first.y} ${valPts.map((p) => `${p.x},${p.y}`).join(' ')} ${x0},${last.y}`;
}

function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step: number;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * mag;
}

// ─── Component ─────────────────────────────────────────────────────

export const DepthTrackPlot: React.FC<DepthTrackPlotProps> = ({ readings }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [hover, setHover] = useState<{
    idx: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  // Sort by depth ascending
  const sorted = useMemo(
    () => [...readings].sort((a, b) => a.depth - b.depth),
    [readings],
  );

  // Depth range
  const depthMin = sorted.length > 0 ? sorted[0].depth : 0;
  const depthMax = sorted.length > 0 ? sorted[sorted.length - 1].depth : 0;
  const depthRange = depthMax - depthMin || 1;

  // Chart dimensions
  const totalTrackWidth = TRACKS.length * TRACK_WIDTH + (TRACKS.length - 1) * TRACK_GAP;
  const svgWidth = DEPTH_AXIS_WIDTH + totalTrackWidth + PADDING.right;
  const plotHeight = Math.max(MIN_CHART_HEIGHT, depthRange * PX_PER_FT);
  const svgHeight = PADDING.top + LABEL_HEIGHT + plotHeight + PADDING.bottom;

  // Depth scale
  const scaleY = useCallback(
    (depth: number) => {
      return PADDING.top + LABEL_HEIGHT + ((depth - depthMin) / depthRange) * plotHeight;
    },
    [depthMin, depthRange, plotHeight],
  );

  // Compute scales per track
  const trackScales = useMemo(
    () => TRACKS.map((t) => computeScale(t, sorted)),
    [sorted],
  );

  // Depth ticks
  const depthTicks = useMemo(() => {
    const step = niceStep(depthRange, Math.min(20, plotHeight / 30));
    const ticks: number[] = [];
    const start = Math.ceil(depthMin / step) * step;
    for (let d = start; d <= depthMax; d += step) {
      ticks.push(Math.round(d * 10) / 10);
    }
    return ticks;
  }, [depthMin, depthMax, depthRange, plotHeight]);

  // Section bands
  const sectionBands = useMemo(() => {
    if (sorted.length < 2) return [];
    const bands: { section: WellSection; y1: number; y2: number }[] = [];
    let currentSection = sorted[0].section;
    let startDepth = sorted[0].depth;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].section !== currentSection || i === sorted.length - 1) {
        const endDepth = sorted[i].section !== currentSection ? sorted[i - 1].depth : sorted[i].depth;
        bands.push({
          section: currentSection,
          y1: scaleY(startDepth),
          y2: scaleY(endDepth),
        });
        currentSection = sorted[i].section;
        startDepth = sorted[i].depth;
      }
    }

    // Handle last section
    if (bands.length === 0 || bands[bands.length - 1].section !== sorted[sorted.length - 1].section) {
      bands.push({
        section: sorted[sorted.length - 1].section,
        y1: scaleY(startDepth),
        y2: scaleY(sorted[sorted.length - 1].depth),
      });
    }

    return bands;
  }, [sorted, scaleY]);

  // Find nearest reading to mouse Y
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (sorted.length < 2 || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const plotTop = PADDING.top + LABEL_HEIGHT;
      const plotBot = plotTop + plotHeight;

      if (mouseY < plotTop || mouseY > plotBot) {
        setHover(null);
        return;
      }

      // Map mouseY to depth
      const depth = depthMin + ((mouseY - plotTop) / plotHeight) * depthRange;

      // Binary search for closest reading
      let best = 0;
      let bestDist = Math.abs(sorted[0].depth - depth);
      for (let i = 1; i < sorted.length; i++) {
        const d = Math.abs(sorted[i].depth - depth);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }

      setHover({ idx: best, clientX: e.clientX, clientY: e.clientY });
    },
    [sorted, depthMin, depthRange, plotHeight],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  if (readings.length < 2) {
    return (
      <div className={styles.emptyState}>
        At least 2 readings needed for depth track
      </div>
    );
  }

  const hoveredReading = hover != null ? sorted[hover.idx] : null;
  const crosshairY = hoveredReading ? scaleY(hoveredReading.depth) : 0;

  return (
    <div className={styles.container} ref={containerRef}>
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* ── Depth axis labels ── */}
        {depthTicks.map((d) => (
          <g key={`dtick-${d}`}>
            <line
              x1={DEPTH_AXIS_WIDTH - 4}
              y1={scaleY(d)}
              x2={DEPTH_AXIS_WIDTH}
              y2={scaleY(d)}
              stroke="#555"
              strokeWidth={1}
            />
            <text
              x={DEPTH_AXIS_WIDTH - 6}
              y={scaleY(d)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#888"
              fontSize={11}
              fontFamily="'Roboto Mono', monospace"
            >
              {Math.round(d)}
            </text>
            {/* Horizontal grid across all tracks */}
            <line
              x1={DEPTH_AXIS_WIDTH}
              y1={scaleY(d)}
              x2={DEPTH_AXIS_WIDTH + totalTrackWidth}
              y2={scaleY(d)}
              stroke="#2a2a2a"
              strokeWidth={1}
            />
          </g>
        ))}

        {/* ── Tracks ── */}
        {TRACKS.map((track, ti) => {
          const trackX = DEPTH_AXIS_WIDTH + ti * (TRACK_WIDTH + TRACK_GAP);
          const [sMin, sMax] = trackScales[ti];
          const sRange = sMax - sMin || 1;
          const scaleX = (v: number) => trackX + ((v - sMin) / sRange) * TRACK_WIDTH;

          return (
            <g key={track.label}>
              {/* Track header background */}
              <rect
                x={trackX}
                y={PADDING.top}
                width={TRACK_WIDTH}
                height={LABEL_HEIGHT}
                fill="#1e1e1e"
                rx={2}
              />
              {/* Track label */}
              <text
                x={trackX + TRACK_WIDTH / 2}
                y={PADDING.top + 15}
                textAnchor="middle"
                fill="#aaa"
                fontSize={10}
                fontFamily="'Roboto', sans-serif"
                fontWeight={600}
                textTransform="uppercase"
                style={{ textTransform: 'uppercase' } as React.CSSProperties}
              >
                {track.label}
              </text>
              {/* Scale range */}
              <text
                x={trackX + TRACK_WIDTH / 2}
                y={PADDING.top + 30}
                textAnchor="middle"
                fill="#666"
                fontSize={9}
                fontFamily="'Roboto Mono', monospace"
              >
                {sMin.toFixed(1)} — {sMax.toFixed(1)} {track.unit}
              </text>

              {/* Track border lines */}
              <line
                x1={trackX}
                y1={PADDING.top + LABEL_HEIGHT}
                x2={trackX}
                y2={PADDING.top + LABEL_HEIGHT + plotHeight}
                stroke="#333"
                strokeWidth={1}
              />
              <line
                x1={trackX + TRACK_WIDTH}
                y1={PADDING.top + LABEL_HEIGHT}
                x2={trackX + TRACK_WIDTH}
                y2={PADDING.top + LABEL_HEIGHT + plotHeight}
                stroke="#333"
                strokeWidth={1}
              />

              {/* Section background bands */}
              {sectionBands.map((band, bi) => (
                <rect
                  key={`band-${ti}-${bi}`}
                  x={trackX}
                  y={band.y1}
                  width={TRACK_WIDTH}
                  height={Math.max(1, band.y2 - band.y1)}
                  fill={SECTION_BG[band.section]}
                />
              ))}

              {/* Lines */}
              {track.lines.map((line) => {
                if (line.filled) {
                  const areaPts = buildAreaPolygon(
                    sorted,
                    line.getValue,
                    scaleX,
                    scaleY,
                    trackX,
                  );
                  const linePts = buildPolylinePoints(
                    sorted,
                    line.getValue,
                    scaleX,
                    scaleY,
                  );
                  return (
                    <g key={line.key}>
                      {areaPts && (
                        <polygon
                          points={areaPts}
                          fill={line.color}
                          fillOpacity={0.3}
                        />
                      )}
                      {linePts && (
                        <polyline
                          points={linePts}
                          fill="none"
                          stroke={line.color}
                          strokeWidth={1.5}
                        />
                      )}
                    </g>
                  );
                }

                const pts = buildPolylinePoints(
                  sorted,
                  line.getValue,
                  scaleX,
                  scaleY,
                );
                if (!pts) return null;
                return (
                  <polyline
                    key={line.key}
                    points={pts}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={1.5}
                    strokeDasharray={line.dashed ? '4 3' : undefined}
                  />
                );
              })}
            </g>
          );
        })}

        {/* ── Crosshair ── */}
        {hover != null && (
          <line
            x1={DEPTH_AXIS_WIDTH}
            y1={crosshairY}
            x2={DEPTH_AXIS_WIDTH + totalTrackWidth}
            y2={crosshairY}
            stroke="#fff"
            strokeWidth={1}
            strokeOpacity={0.4}
            pointerEvents="none"
          />
        )}
      </svg>

      {/* ── Tooltip ── */}
      {hover != null && hoveredReading && (
        <div
          className={styles.tooltip}
          style={{
            left: hover.clientX + 16,
            top: hover.clientY - 10,
          }}
        >
          <div>
            <span className={styles.tooltipLabel}>Depth:</span>
            <span className={styles.tooltipValue}>
              {hoveredReading.depth.toFixed(1)} ft
            </span>
          </div>
          <div>
            <span className={styles.tooltipLabel}>RSS Inc:</span>
            <span className={styles.tooltipValue}>
              {hoveredReading.inc.toFixed(2)}°
            </span>
            {hoveredReading.mwdInc != null && (
              <>
                {'  '}
                <span className={styles.tooltipLabel}>MWD Inc:</span>
                <span className={styles.tooltipValue}>
                  {hoveredReading.mwdInc.toFixed(2)}°
                </span>
              </>
            )}
          </div>
          <div>
            <span className={styles.tooltipLabel}>RSS Az:</span>
            <span className={styles.tooltipValue}>
              {hoveredReading.az.toFixed(2)}°
            </span>
            {hoveredReading.mwdAz != null && (
              <>
                {'  '}
                <span className={styles.tooltipLabel}>MWD Az:</span>
                <span className={styles.tooltipValue}>
                  {hoveredReading.mwdAz.toFixed(2)}°
                </span>
              </>
            )}
          </div>
          <div>
            <span className={styles.tooltipLabel}>DLS:</span>
            <span className={styles.tooltipValue}>
              {hoveredReading.dls != null ? hoveredReading.dls.toFixed(2) : '—'}
            </span>
            {hoveredReading.mwdDls != null && (
              <>
                {'  '}
                <span className={styles.tooltipLabel}>MWD DLS:</span>
                <span className={styles.tooltipValue}>
                  {hoveredReading.mwdDls.toFixed(2)}
                </span>
              </>
            )}
          </div>
          <div>
            <span className={styles.tooltipLabel}>DC:</span>
            <span className={styles.tooltipValue}>
              {hoveredReading.dutyCycle != null
                ? `${hoveredReading.dutyCycle.toFixed(0)}%`
                : '—'}
            </span>
            {'  '}
            <span className={styles.tooltipLabel}>TF Set:</span>
            <span className={styles.tooltipValue}>
              {hoveredReading.toolFaceSet != null
                ? `${hoveredReading.toolFaceSet.toFixed(1)}°`
                : '—'}
            </span>
            {'  '}
            <span className={styles.tooltipLabel}>Res TF:</span>
            <span className={styles.tooltipValue}>
              {hoveredReading.resultantTF != null
                ? `${hoveredReading.resultantTF.toFixed(1)}°`
                : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
