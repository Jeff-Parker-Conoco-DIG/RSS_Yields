import React, { useCallback, useState, useEffect, useMemo } from 'react';
import type { WitsChannelProfile } from './types';
import { PROFILES } from './channelProfiles';
import { ALL_CHANNEL_KEYS, REQUIRED_CHANNELS } from './types';
import { discoverWitsChannels, discoverCerebroChannels } from '../api/corvaApi';
import type { DiscoveredChannel } from '../api/corvaApi';
import styles from './WitsMapperPanel.module.css';

interface WitsMapperPanelProps {
  activeProfileId: string;
  customOverrides: Record<string, string>;
  onProfileChange: (profileId: string) => void;
  onOverrideChange: (overrides: Record<string, string>) => void;
  /** Asset ID for the active well — needed for channel discovery */
  assetId?: number;
}

const CHANNEL_LABELS: Record<string, string> = {
  nearBitInc: 'Near-Bit Inclination',
  nearBitAz: 'Near-Bit Azimuth',
  dutyCycle: 'Duty Cycle',
  toolFaceSet: 'Toolface Set',
  toolFaceActual: 'Toolface Actual',
  toolFaceStdDev: 'Toolface Std Dev',
  steeringForce: 'Steering Force',
  turbineRPM: 'Turbine RPM',
  peakLateral: 'Peak Lateral',
  hfto: 'HFTO',
  bitRPM: 'Bit RPM',
};

/** Hint text to help DD pick the right channel */
const CHANNEL_HINTS: Record<string, string> = {
  nearBitInc: 'Continuous inc from RSS sensor (~8ft from bit)',
  nearBitAz: 'Continuous azimuth from RSS sensor',
  dutyCycle: 'Steering duty cycle 0-100%',
  toolFaceSet: 'Commanded toolface direction (degrees)',
  toolFaceActual: 'Achieved toolface direction (degrees)',
  toolFaceStdDev: 'Toolface consistency / scatter',
  steeringForce: 'RSS pad force or steering magnitude',
  turbineRPM: 'Downhole turbine RPM (iCruise)',
  peakLateral: 'Peak lateral vibration',
  hfto: 'High-frequency torsional oscillation',
  bitRPM: 'Near-bit RPM',
};

export const WitsMapperPanel: React.FC<WitsMapperPanelProps> = ({
  activeProfileId,
  customOverrides,
  onProfileChange,
  onOverrideChange,
  assetId,
}) => {
  const profile = PROFILES[activeProfileId] ?? PROFILES.custom;

  // ─── Channel Discovery State ──────────────────────────────────
  const [witsChannels, setWitsChannels] = useState<DiscoveredChannel[]>([]);
  const [cerebroChannels, setCerebroChannels] = useState<DiscoveredChannel[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [lastDiscoveryTime, setLastDiscoveryTime] = useState<number | null>(null);

  // Combine WITS + Cerebro channels into a single sorted list for the dropdowns
  const availableChannels = useMemo(() => {
    const all: (DiscoveredChannel & { source: 'wits' | 'cerebro' })[] = [];
    for (const ch of witsChannels) {
      all.push({ ...ch, source: 'wits' });
    }
    for (const ch of cerebroChannels) {
      // Avoid duplicates if same field name exists in both
      if (!all.some((a) => a.field === ch.field)) {
        all.push({ ...ch, source: 'cerebro' });
      }
    }
    // Channels with data first, then alphabetical
    all.sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
      return a.field.localeCompare(b.field);
    });
    return all;
  }, [witsChannels, cerebroChannels]);

  // ─── Discover Channels ────────────────────────────────────────
  const handleDiscover = useCallback(async () => {
    if (!assetId) return;
    setDiscovering(true);
    try {
      const [wits, cerebro] = await Promise.all([
        discoverWitsChannels(assetId),
        profile.dataSource.includes('cerebro')
          ? discoverCerebroChannels(assetId)
          : Promise.resolve([]),
      ]);
      setWitsChannels(wits);
      setCerebroChannels(cerebro);
      setLastDiscoveryTime(Date.now());
    } finally {
      setDiscovering(false);
    }
  }, [assetId, profile.dataSource]);

  // Auto-discover on mount if we have an asset ID and haven't discovered yet
  useEffect(() => {
    if (assetId && !lastDiscoveryTime && !discovering) {
      handleDiscover();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  // ─── Channel Selection Handler ────────────────────────────────
  const handleChannelChange = useCallback(
    (key: string, value: string) => {
      const baseValue = (profile.channels as unknown as Record<string, string | undefined>)[key];
      const newOverrides = { ...customOverrides };
      if (value === baseValue || value === '') {
        delete newOverrides[key];
      } else {
        newOverrides[key] = value;
      }
      onOverrideChange(newOverrides);
    },
    [profile, customOverrides, onOverrideChange],
  );

  // ─── Render a channel row with dropdown ───────────────────────
  const renderChannelRow = (key: string, isRequired: boolean) => {
    const baseValue = (profile.channels as unknown as Record<string, string | undefined>)[key] ?? '';
    const overridden = customOverrides[key];
    const currentValue = overridden ?? baseValue;
    const hasChannels = availableChannels.length > 0;

    // Check if current value exists in discovered channels
    const currentInList = availableChannels.some((ch) => ch.field === currentValue);
    const currentChannel = availableChannels.find((ch) => ch.field === currentValue);

    return (
      <React.Fragment key={key}>
        <div className={styles.channelRow}>
          <label className={styles.channelLabel}>
            {CHANNEL_LABELS[key] ?? key}
            {isRequired && <span className={styles.requiredDot}>•</span>}
          </label>
          <div className={styles.channelControl}>
            {hasChannels ? (
              <select
                className={`${styles.channelSelect} ${overridden ? styles.overridden : ''}`}
                value={currentValue}
                onChange={(e) => handleChannelChange(key, e.target.value)}
                title={`Current: ${currentValue || '(none)'}`}
              >
                <option value="">— not mapped —</option>

                {/* If current value isn't in discovered list, show it as custom */}
                {currentValue && !currentInList && (
                  <option value={currentValue}>
                    ⚠ {currentValue} (not found on well)
                  </option>
                )}

                {/* Active channels (have data) */}
                {availableChannels.filter((ch) => ch.hasData).length > 0 && (
                  <optgroup label="Active Channels (have data)">
                    {availableChannels
                      .filter((ch) => ch.hasData)
                      .map((ch) => (
                        <option key={ch.field} value={ch.field}>
                          {ch.field}
                          {ch.lastValue != null
                            ? ` (${typeof ch.lastValue === 'number' ? ch.lastValue.toFixed(2) : ch.lastValue})`
                            : ''}
                        </option>
                      ))}
                  </optgroup>
                )}

                {/* Inactive channels (no data in recent records) */}
                {availableChannels.filter((ch) => !ch.hasData).length > 0 && (
                  <optgroup label="Inactive (no recent data)">
                    {availableChannels
                      .filter((ch) => !ch.hasData)
                      .map((ch) => (
                        <option key={ch.field} value={ch.field}>
                          {ch.field}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            ) : (
              /* Fallback: text input + hint to click Detect */
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <input
                  className={`${styles.channelInput} ${overridden ? styles.overridden : ''}`}
                  value={currentValue}
                  placeholder={baseValue || '(not configured)'}
                  onChange={(e) => handleChannelChange(key, e.target.value)}
                />
                {!discovering && !lastDiscoveryTime && assetId && (
                  <span style={{ color: '#666', fontSize: 10, whiteSpace: 'nowrap' }}>click Detect ↑</span>
                )}
              </div>
            )}

            {/* Status indicator */}
            {hasChannels && currentValue && (
              <span
                className={`${styles.statusDot} ${
                  currentChannel?.hasData ? styles.active : styles.inactive
                }`}
                title={
                  currentChannel?.hasData
                    ? `Active — last value: ${currentChannel.lastValue}`
                    : currentInList
                      ? 'No data in recent records'
                      : 'Channel not found on this well'
                }
              />
            )}
          </div>

          {/* Hint text */}
          <span className={styles.channelHint}>{CHANNEL_HINTS[key] ?? ''}</span>
        </div>
      </React.Fragment>
    );
  };

  return (
    <div className={styles.container}>
      {/* Profile Selector + Discover Button */}
      <div className={styles.profileRow}>
        <div className={styles.profileSelect}>
          <label className={styles.fieldLabel}>RSS Vendor Profile:</label>
          <select
            className={styles.select}
            value={activeProfileId}
            onChange={(e) => onProfileChange(e.target.value)}
          >
            {Object.entries(PROFILES).map(([id, p]) => (
              <option key={id} value={id}>
                {p.vendorName}
              </option>
            ))}
          </select>
          <span
            className={`${styles.dataSourceBadge} ${
              profile.dataSource.includes('cerebro') ? styles.cerebro : styles.wits
            }`}
          >
            {profile.dataSource}
          </span>
        </div>

        <button
          className={styles.discoverBtn}
          onClick={handleDiscover}
          disabled={!assetId || discovering}
          title={!assetId ? 'No active well' : 'Query WITS data to find available channels'}
        >
          {discovering ? '⏳ Scanning...' : '🔍 Detect Channels'}
        </button>
      </div>

      {/* Discovery status */}
      {lastDiscoveryTime && (
        <div className={styles.discoveryStatus}>
          Found {availableChannels.filter((c) => c.hasData).length} active channels
          out of {availableChannels.length} total
          {cerebroChannels.length > 0 && ` (incl. ${cerebroChannels.length} Cerebro)`}
        </div>
      )}

      {/* Channel Mappings */}
      <div className={styles.channelSection}>
        <div className={styles.sectionTitle}>Required Channels</div>
        {REQUIRED_CHANNELS.map((key) => renderChannelRow(key, true))}

        <div className={styles.sectionTitle}>Optional Channels</div>
        {ALL_CHANNEL_KEYS.filter((k) => !REQUIRED_CHANNELS.includes(k)).map((key) =>
          renderChannelRow(key, false),
        )}
      </div>
    </div>
  );
};
