import React, { useMemo, useState } from 'react';
import { computeYieldAnalysis } from '../../calculations/yieldCalc';
import type { YieldDataPoint } from '../../calculations/yieldCalc';
import { YIELD_COLORS } from '../../constants';
import styles from './YieldScatterPlot.module.css';

/** Shape of data points passed to the scatter plot */
export interface ScatterStation extends YieldDataPoint {
  mwdDepth: number;
  rssDLS: number;
  avgToolFaceSet: number | null;
}

interface YieldScatterPlotProps {
  stations: ScatterStation[];
  divergenceThreshold: number;
  onStationClick?: (station: ScatterStation) => void;
}

const MARGIN = { top: 20, right: 30, bottom: 50, left: 60 };

export const YieldScatterPlot: React.FC<YieldScatterPlotProps> = ({
  stations,
  divergenceThreshold,
  onStationClick,
}) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; station: ScatterStation } | null>(null);

  const points = useMemo(
    () => stations.filter((s) => s.avgDutyCycle != null && s.avgDutyCycle > 0),
    [stations],
  );

  const yieldAnalysis = useMemo(() => computeYieldAnalysis(stations), [stations]);
  const regression = yieldAnalysis.overallDLS;

  // Chart dimensions (relative — rendered in viewBox)
  const W = 600;
  const H = 400;
  const plotW = W - MARGIN.left - MARGIN.right;
  const plotH = H - MARGIN.top - MARGIN.bottom;

  // Scales
  const xMax = Math.max(100, ...points.map((p) => p.avgDutyCycle!));
  const yMax = Math.max(10, ...points.map((p) => p.rssDLS)) * 1.1;

  const scaleX = (v: number) => MARGIN.left + (v / xMax) * plotW;
  const scaleY = (v: number) => MARGIN.top + plotH - (v / yMax) * plotH;

  // Grid lines
  const xTicks = [0, 25, 50, 75, 100].filter((t) => t <= xMax);
  const yTicks: number[] = [];
  const yStep = Math.ceil(yMax / 5);
  for (let i = 0; i <= yMax; i += yStep) yTicks.push(i);

  return (
    <div className={styles.container}>
      <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        {xTicks.map((t) => (
          <line key={`gx-${t}`} x1={scaleX(t)} y1={MARGIN.top} x2={scaleX(t)} y2={MARGIN.top + plotH} className={styles.gridLine} />
        ))}
        {yTicks.map((t) => (
          <line key={`gy-${t}`} x1={MARGIN.left} y1={scaleY(t)} x2={MARGIN.left + plotW} y2={scaleY(t)} className={styles.gridLine} />
        ))}

        {/* Axes */}
        <line x1={MARGIN.left} y1={MARGIN.top + plotH} x2={MARGIN.left + plotW} y2={MARGIN.top + plotH} stroke="#555" />
        <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={MARGIN.top + plotH} stroke="#555" />

        {/* Tick labels */}
        {xTicks.map((t) => (
          <text key={`xt-${t}`} x={scaleX(t)} y={MARGIN.top + plotH + 16} textAnchor="middle" className={styles.tick}>
            {t}
          </text>
        ))}
        {yTicks.map((t) => (
          <text key={`yt-${t}`} x={MARGIN.left - 8} y={scaleY(t) + 4} textAnchor="end" className={styles.tick}>
            {t}
          </text>
        ))}

        {/* Axis labels */}
        <text x={MARGIN.left + plotW / 2} y={H - 5} textAnchor="middle" className={styles.axisLabel}>
          Duty Cycle (%)
        </text>
        <text x={14} y={MARGIN.top + plotH / 2} textAnchor="middle" className={styles.axisLabel} transform={`rotate(-90, 14, ${MARGIN.top + plotH / 2})`}>
          DLS (°/100ft)
        </text>

        {/* Regression line */}
        {regression && (
          <>
            <line
              x1={scaleX(0)}
              y1={scaleY(regression.intercept)}
              x2={scaleX(xMax)}
              y2={scaleY(regression.slope * xMax + regression.intercept)}
              className={styles.regressionLine}
            />
            <text x={MARGIN.left + plotW - 10} y={MARGIN.top + 16} textAnchor="end" className={styles.annotation}>
              R² = {regression.rSquared.toFixed(3)} | Yield = {regression.slope.toFixed(3)} °/%DC
            </text>
          </>
        )}

        {/* Data points */}
        {points.map((p, i) => {
          const cx = scaleX(p.avgDutyCycle!);
          const cy = scaleY(p.mwdDLS);
          const dlsDelta = Math.abs(p.rssDLS - p.mwdDLS);
          const color =
            dlsDelta <= divergenceThreshold * 0.5
              ? YIELD_COLORS.good
              : dlsDelta <= divergenceThreshold
                ? YIELD_COLORS.warning
                : YIELD_COLORS.bad;

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={5}
              fill={color}
              fillOpacity={0.8}
              stroke="#fff"
              strokeWidth={0.5}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, station: p })}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => onStationClick?.(p)}
            />
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x + 12, top: tooltip.y - 30 }}
        >
          <div>Depth: {tooltip.station.mwdDepth.toFixed(1)} ft</div>
          <div>DC: {tooltip.station.avgDutyCycle?.toFixed(1)}%</div>
          <div>DLS: {tooltip.station.rssDLS.toFixed(2)} °/100ft</div>
          <div>TF: {tooltip.station.avgToolFaceSet?.toFixed(1) ?? '—'}°</div>
        </div>
      )}
    </div>
  );
};
