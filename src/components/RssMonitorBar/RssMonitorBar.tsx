import React, { useState, useRef, useEffect } from 'react';
import type { RssMonitorValues, RssMonitorThresholds } from '../../effects/useRssMonitor';
import styles from './RssMonitorBar.module.css';

// ─── Alert level logic ─────────────────────────────────────────────
type AlertLevel = 'green' | 'yellow' | 'red' | 'unknown';

function getAlertLevel(value: number | null, yellow: number, red: number): AlertLevel {
  if (value == null) return 'unknown';
  if (value >= red) return 'red';
  if (value >= yellow) return 'yellow';
  return 'green';
}

function getRpmAlertLevel(value: number | null, low: number, critical: number): AlertLevel {
  if (value == null) return 'unknown';
  if (value <= critical) return 'red';
  if (value <= low) return 'yellow';
  return 'green';
}

const COLOR_CLASS: Record<AlertLevel, string> = {
  green: styles.colorGreen,
  yellow: styles.colorYellow,
  red: styles.colorRed,
  unknown: styles.colorUnknown,
};

const FILL_CLASS: Record<AlertLevel, string> = {
  green: styles.fillGreen,
  yellow: styles.fillYellow,
  red: styles.fillRed,
  unknown: styles.fillUnknown,
};

// ─── Trend tracking ────────────────────────────────────────────────
type Trend = '↑' | '↓' | '→';

function getTrend(current: number | null, prev: number | null): Trend {
  if (current == null || prev == null) return '→';
  const diff = current - prev;
  if (Math.abs(diff) < 0.1) return '→';
  return diff > 0 ? '↑' : '↓';
}

// ─── Gauge component ───────────────────────────────────────────────
interface GaugeProps {
  label: string;
  value: number | null;
  unit: string;
  alert: AlertLevel;
  fillPercent: number;
  trend: Trend;
  decimals?: number;
}

const Gauge: React.FC<GaugeProps> = ({ label, value, unit, alert, fillPercent, trend, decimals = 1 }) => (
  <div className={styles.gauge}>
    <div className={styles.gaugeHeader}>
      <span className={styles.gaugeLabel}>{label}</span>
      <span className={`${styles.gaugeValue} ${COLOR_CLASS[alert]}`}>
        {value != null ? `${value.toFixed(decimals)}${unit}` : '—'}
        <span className={styles.trendArrow}>{trend}</span>
      </span>
    </div>
    <div className={styles.gaugeTrack}>
      <div
        className={`${styles.gaugeFill} ${FILL_CLASS[alert]}`}
        style={{ width: `${Math.min(100, Math.max(0, fillPercent))}%` }}
      />
    </div>
  </div>
);

// ─── Threshold editor row ──────────────────────────────────────────
interface ThresholdRowProps {
  label: string;
  tag1Label: string;
  tag1Class: string;
  value1: number;
  tag2Label: string;
  tag2Class: string;
  value2: number;
  unit?: string;
  onChange1: (v: number) => void;
  onChange2: (v: number) => void;
}

const ThresholdRow: React.FC<ThresholdRowProps> = ({
  label, tag1Label, tag1Class, value1, tag2Label, tag2Class, value2, unit, onChange1, onChange2,
}) => (
  <div className={styles.thresholdRow}>
    <span className={styles.thresholdLabel}>{label}</span>
    <span className={`${styles.thresholdTag} ${tag1Class}`}>{tag1Label}</span>
    <input
      className={styles.thresholdInput}
      type="number"
      value={value1}
      onChange={(e) => onChange1(Number(e.target.value))}
    />
    {unit && <span style={{ color: '#666', fontSize: 10 }}>{unit}</span>}
    <span className={`${styles.thresholdTag} ${tag2Class}`}>{tag2Label}</span>
    <input
      className={styles.thresholdInput}
      type="number"
      value={value2}
      onChange={(e) => onChange2(Number(e.target.value))}
    />
    {unit && <span style={{ color: '#666', fontSize: 10 }}>{unit}</span>}
  </div>
);

// ─── Main component ────────────────────────────────────────────────
interface RssMonitorBarProps {
  values: RssMonitorValues;
  thresholds: RssMonitorThresholds;
  onThresholdsChange: (t: RssMonitorThresholds) => void;
}

export const RssMonitorBar: React.FC<RssMonitorBarProps> = ({ values, thresholds, onThresholdsChange }) => {
  const [showSettings, setShowSettings] = useState(false);
  const prevValues = useRef<RssMonitorValues>(values);

  // Track previous values for trend arrows
  useEffect(() => {
    const timer = setTimeout(() => { prevValues.current = values; }, 500);
    return () => clearTimeout(timer);
  }, [values]);

  const prev = prevValues.current;

  // Gauge scale maximums
  const axialFill = values.mwdAxialShock != null ? (values.mwdAxialShock / 40) * 100 : 0;
  const lateralFill = values.mwdLateralShock != null ? (values.mwdLateralShock / 50) * 100 : 0;
  const whirlFill = values.rssWhirl != null ? (values.rssWhirl / 5) * 100 : 0;
  const rpmFill = values.turbineRPM != null ? (values.turbineRPM / 3000) * 100 : 0;

  const updateThreshold = (
    key: keyof RssMonitorThresholds,
    subKey: string,
    value: number,
  ) => {
    onThresholdsChange({
      ...thresholds,
      [key]: { ...thresholds[key], [subKey]: value },
    });
  };

  return (
    <>
      <div className={styles.monitorBar}>
        <Gauge
          label="Axial"
          value={values.mwdAxialShock}
          unit="g"
          alert={getAlertLevel(values.mwdAxialShock, thresholds.mwdAxialShock.yellow, thresholds.mwdAxialShock.red)}
          fillPercent={axialFill}
          trend={getTrend(values.mwdAxialShock, prev.mwdAxialShock)}
        />
        <Gauge
          label="Lateral"
          value={values.mwdLateralShock}
          unit="g"
          alert={getAlertLevel(values.mwdLateralShock, thresholds.mwdLateralShock.yellow, thresholds.mwdLateralShock.red)}
          fillPercent={lateralFill}
          trend={getTrend(values.mwdLateralShock, prev.mwdLateralShock)}
        />
        <Gauge
          label="Whirl"
          value={values.rssWhirl}
          unit=""
          alert={getAlertLevel(values.rssWhirl, thresholds.rssWhirl.yellow, thresholds.rssWhirl.red)}
          fillPercent={whirlFill}
          trend={getTrend(values.rssWhirl, prev.rssWhirl)}
        />
        <Gauge
          label="Turb RPM"
          value={values.turbineRPM}
          unit=""
          alert={getRpmAlertLevel(values.turbineRPM, thresholds.turbineRPM.low, thresholds.turbineRPM.critical)}
          fillPercent={rpmFill}
          trend={getTrend(values.turbineRPM, prev.turbineRPM)}
          decimals={0}
        />
        <button
          className={`${styles.settingsBtn} ${showSettings ? styles.settingsBtnActive : ''}`}
          onClick={() => setShowSettings((v) => !v)}
          title="Configure alert thresholds"
        >
          {'\u2699'}
        </button>
      </div>

      {showSettings && (
        <div className={styles.thresholdPanel}>
          <ThresholdRow
            label="Axial Shock"
            tag1Label="YEL" tag1Class={styles.tagYellow}
            value1={thresholds.mwdAxialShock.yellow}
            tag2Label="RED" tag2Class={styles.tagRed}
            value2={thresholds.mwdAxialShock.red}
            unit="g"
            onChange1={(v) => updateThreshold('mwdAxialShock', 'yellow', v)}
            onChange2={(v) => updateThreshold('mwdAxialShock', 'red', v)}
          />
          <ThresholdRow
            label="Lateral Shock"
            tag1Label="YEL" tag1Class={styles.tagYellow}
            value1={thresholds.mwdLateralShock.yellow}
            tag2Label="RED" tag2Class={styles.tagRed}
            value2={thresholds.mwdLateralShock.red}
            unit="g"
            onChange1={(v) => updateThreshold('mwdLateralShock', 'yellow', v)}
            onChange2={(v) => updateThreshold('mwdLateralShock', 'red', v)}
          />
          <ThresholdRow
            label="RSS Whirl"
            tag1Label="YEL" tag1Class={styles.tagYellow}
            value1={thresholds.rssWhirl.yellow}
            tag2Label="RED" tag2Class={styles.tagRed}
            value2={thresholds.rssWhirl.red}
            onChange1={(v) => updateThreshold('rssWhirl', 'yellow', v)}
            onChange2={(v) => updateThreshold('rssWhirl', 'red', v)}
          />
          <ThresholdRow
            label="Turbine RPM"
            tag1Label="LOW" tag1Class={styles.tagLow}
            value1={thresholds.turbineRPM.low}
            tag2Label="CRIT" tag2Class={styles.tagCritical}
            value2={thresholds.turbineRPM.critical}
            onChange1={(v) => updateThreshold('turbineRPM', 'low', v)}
            onChange2={(v) => updateThreshold('turbineRPM', 'critical', v)}
          />
        </div>
      )}
    </>
  );
};
