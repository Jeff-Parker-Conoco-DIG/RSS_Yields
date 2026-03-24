import React, { useState, useEffect } from 'react';
import type { TrackingConfig, IntervalMode, WellSection } from '../../types';
import { WELL_SECTIONS } from '../../constants';
import styles from './ControlsBar.module.css';

function formatTimeRemaining(startedAt: number, hours: number): string {
  const stopAt = startedAt + hours * 3600000;
  const remaining = Math.max(0, stopAt - Date.now());
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

interface ControlsBarProps {
  config: TrackingConfig;
  onConfigChange: (config: TrackingConfig) => void;
  onTakeReading: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onClearAll: () => Promise<void>;
  currentBitDepth: number | null;
  readingCount: number;
  takingReading?: boolean;
}

export const ControlsBar: React.FC<ControlsBarProps> = ({
  config,
  onConfigChange,
  onTakeReading,
  onExportExcel,
  onExportPdf,
  onClearAll,
  currentBitDepth,
  readingCount,
  takingReading,
}) => {
  // Tick for countdown re-render
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!config.isRunning || !config.autoStopHours) return;
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, [config.isRunning, config.autoStopHours]);
  const set = <K extends keyof TrackingConfig>(key: K, value: TrackingConfig[K]) =>
    onConfigChange({ ...config, [key]: value });

  return (
    <div className={styles.bar}>
      {/* Row 1: Start depth, section, interval config */}
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Start Depth</label>
          <div className={styles.inputGroup}>
            <input
              type="number"
              className={styles.numInput}
              value={config.startDepth || ''}
              onChange={(e) => set('startDepth', Number(e.target.value))}
              placeholder="0"
              disabled={config.isRunning}
            />
            <span className={styles.unit}>ft</span>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Stop Depth</label>
          <div className={styles.inputGroup}>
            <input
              type="number"
              className={styles.numInput}
              value={config.stopDepth ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                set('stopDepth', v ? Number(v) : null);
              }}
              placeholder="TD"
              disabled={config.isRunning}
            />
            <span className={styles.unit}>ft</span>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Section</label>
          <select
            className={styles.select}
            value={config.section}
            onChange={(e) => set('section', e.target.value as WellSection)}
          >
            {WELL_SECTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.divider} />

        <div className={styles.field}>
          <label className={styles.label}>Interval</label>
          <div className={styles.inputGroup}>
            <input
              type="number"
              className={styles.numInput}
              style={{ width: 60 }}
              value={config.intervalValue}
              onChange={(e) => set('intervalValue', Number(e.target.value))}
              min={1}
              disabled={config.isRunning}
            />
            <select
              className={styles.modeSelect}
              value={config.intervalMode}
              onChange={(e) => set('intervalMode', e.target.value as IntervalMode)}
              disabled={config.isRunning}
            >
              <option value="depth">ft (min spacing)</option>
              <option value="time">min (time)</option>
              <option value="manual">manual</option>
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Stop After</label>
          <div className={styles.inputGroup}>
            <input
              type="number"
              className={styles.numInput}
              style={{ width: 50 }}
              value={config.autoStopHours ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                set('autoStopHours', v ? Number(v) : null);
              }}
              placeholder="\u2014"
              min={0.5}
              step={0.5}
              disabled={config.isRunning}
            />
            <span className={styles.unit}>hrs</span>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} title="Minimum dogleg severity needed to reach planned target. Colors BR/TR/DLS green when achieved.">DL Needed</label>
          <div className={styles.inputGroup}>
            <input
              type="number"
              className={styles.numInput}
              style={{ width: 55 }}
              value={config.dlNeeded ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                set('dlNeeded', v ? Number(v) : null);
              }}
              placeholder="\u2014"
              min={0}
              step={0.1}
            />
            <span className={styles.unit}>°/100ft</span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Action buttons */}
        <button
          className={`${styles.btn} ${config.isRunning ? styles.stopBtn : styles.startBtn}`}
          onClick={() => set('isRunning', !config.isRunning)}
          disabled={config.intervalMode === 'manual'}
          title={config.intervalMode === 'manual' ? 'Use Take Reading in manual mode' : ''}
        >
          {config.isRunning ? '⏹ Stop' : '▶ Start'}
        </button>

        <button
          className={`${styles.btn} ${styles.snapBtn}`}
          onClick={onTakeReading}
          disabled={takingReading}
        >
          {takingReading ? '⏳...' : '📸 Take Reading'}
        </button>

        <div className={styles.spacer} />

        {/* Status */}
        <div className={styles.status}>
          {currentBitDepth != null && (
            <span className={styles.depthTag}>
              Bit: {currentBitDepth.toFixed(0)} ft
            </span>
          )}
          <span className={styles.countTag}>
            {readingCount} readings
          </span>
          {config.isRunning && (
            <span className={styles.liveTag}>● LIVE</span>
          )}
          {config.isRunning && config.autoStopHours && config.startedAt && (
            <span className={styles.timerTag}>
              {formatTimeRemaining(config.startedAt, config.autoStopHours)}
            </span>
          )}
        </div>

        {/* Export + Clear */}
        <div className={styles.exportGroup}>
          <button className={styles.exportBtn} onClick={onExportExcel} title="Export Excel">
            📊
          </button>
          <button className={styles.exportBtn} onClick={onExportPdf} title="Export PDF">
            📄
          </button>
          <button
            className={styles.clearBtn}
            onClick={() => {
              if (window.confirm(`Clear all ${readingCount} readings? This cannot be undone.`)) {
                onClearAll();
              }
            }}
            disabled={readingCount === 0}
            title="Clear all readings"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};
