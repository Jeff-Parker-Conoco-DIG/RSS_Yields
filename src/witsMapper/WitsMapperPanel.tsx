import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import type { WitsChannelProfile } from './types';
import { PROFILES } from './channelProfiles';
import { ALL_CHANNEL_KEYS, REQUIRED_CHANNELS } from './types';
import { discoverWitsChannels, discoverCerebroChannels } from '../api/corvaApi';
import type { DiscoveredChannel } from '../api/corvaApi';
import { SearchableChannelSelect } from './SearchableChannelSelect';
import styles from './WitsMapperPanel.module.css';

interface WitsMapperPanelProps {
  activeProfileId: string;
  customOverrides: Record<string, string>;
  onProfileChange: (profileId: string) => void;
  onOverrideChange: (overrides: Record<string, string>) => void;
  /** Asset ID for the active well — needed for channel discovery */
  assetId?: number;
}

interface SavedMapping {
  id: string;
  name: string;
  profileId: string;
  overrides: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'yieldtracker_saved_mappings';

function loadSavedMappings(): SavedMapping[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistMappings(mappings: SavedMapping[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch { /* quota */ }
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const CHANNEL_LABELS: Record<string, string> = {
  nearBitInc: 'RSS Near-Bit Inc',
  nearBitAz: 'RSS Near-Bit Az',
  mwdInc: 'MWD Inc',
  mwdAz: 'MWD Az',
  dutyCycle: 'Duty Cycle',
  toolFaceSet: 'Toolface Set',
  toolFaceActual: 'Toolface Actual',
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
  mwdInc: 'Continuous inc from MWD tool (~50-90ft behind bit)',
  mwdAz: 'Continuous azimuth from MWD tool',
  dutyCycle: 'Steering duty cycle 0-100%',
  toolFaceSet: 'Commanded toolface direction (degrees)',
  toolFaceActual: 'Achieved toolface direction (degrees)',
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
  const importRef = useRef<HTMLInputElement>(null);

  // ─── Channel Discovery State ──────────────────────────────────
  const [witsChannels, setWitsChannels] = useState<DiscoveredChannel[]>([]);
  const [cerebroChannels, setCerebroChannels] = useState<DiscoveredChannel[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [lastDiscoveryTime, setLastDiscoveryTime] = useState<number | null>(null);

  // ─── Saved Mappings State ─────────────────────────────────────
  const [savedMappings, setSavedMappings] = useState<SavedMapping[]>(loadSavedMappings);
  const [currentMappingName, setCurrentMappingName] = useState('');

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

  // ─── Save / Load / Delete Mapping ─────────────────────────────
  const handleSave = useCallback(() => {
    let name = currentMappingName;
    if (!name) {
      const input = window.prompt('Name this mapping:', `${profile.vendorName} mapping`);
      if (!input) return;
      name = input;
      setCurrentMappingName(name);
    }

    const existing = savedMappings.find((m) => m.name === name);
    let updated: SavedMapping[];
    if (existing) {
      updated = savedMappings.map((m) =>
        m.id === existing.id
          ? { ...m, profileId: activeProfileId, overrides: customOverrides, updatedAt: Date.now() }
          : m,
      );
    } else {
      const newMapping: SavedMapping = {
        id: uuid(),
        name,
        profileId: activeProfileId,
        overrides: customOverrides,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      updated = [...savedMappings, newMapping];
    }
    setSavedMappings(updated);
    persistMappings(updated);
  }, [activeProfileId, customOverrides, currentMappingName, savedMappings, profile.vendorName]);

  const handleLoad = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    const mapping = savedMappings.find((m) => m.id === id);
    if (!mapping) return;
    onProfileChange(mapping.profileId);
    onOverrideChange(mapping.overrides);
    setCurrentMappingName(mapping.name);
  }, [savedMappings, onProfileChange, onOverrideChange]);

  const handleDelete = useCallback(() => {
    if (!currentMappingName) return;
    if (!window.confirm(`Delete mapping "${currentMappingName}"?`)) return;
    const updated = savedMappings.filter((m) => m.name !== currentMappingName);
    setSavedMappings(updated);
    persistMappings(updated);
    setCurrentMappingName('');
  }, [currentMappingName, savedMappings]);

  // ─── Export / Import ──────────────────────────────────────────
  const handleExport = useCallback(() => {
    const mapping: SavedMapping = {
      id: uuid(),
      name: currentMappingName || `${profile.vendorName} mapping`,
      profileId: activeProfileId,
      overrides: customOverrides,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const blob = new Blob([JSON.stringify(mapping, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wits-mapping-${mapping.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeProfileId, customOverrides, currentMappingName, profile.vendorName]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const mapping = JSON.parse(reader.result as string) as SavedMapping;
        if (mapping.profileId && mapping.overrides) {
          onProfileChange(mapping.profileId);
          onOverrideChange(mapping.overrides);
          if (mapping.name) setCurrentMappingName(mapping.name);
        }
      } catch {
        alert('Invalid mapping file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [onProfileChange, onOverrideChange]);

  // ─── Render a channel row with searchable dropdown ────────────
  const renderChannelRow = (key: string, isRequired: boolean) => {
    const baseValue = (profile.channels as unknown as Record<string, string | undefined>)[key] ?? '';
    const overridden = customOverrides[key];
    const currentValue = overridden ?? baseValue;
    const hasChannels = availableChannels.length > 0;

    const currentChannel = availableChannels.find((ch) => ch.field === currentValue);

    return (
      <React.Fragment key={key}>
        <div className={styles.channelRow}>
          <label className={styles.channelLabel}>
            {CHANNEL_LABELS[key] ?? key}
            {isRequired && <span className={styles.requiredDot}>{'\u2022'}</span>}
          </label>
          <div className={styles.channelControl}>
            {hasChannels ? (
              <SearchableChannelSelect
                value={currentValue}
                channels={availableChannels}
                onChange={(val) => handleChannelChange(key, val)}
                isOverridden={!!overridden}
                placeholder={baseValue || '(not configured)'}
              />
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
                  <span style={{ color: '#666', fontSize: 10, whiteSpace: 'nowrap' }}>click Detect</span>
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
                    ? `Active \u2014 last value: ${currentChannel.lastValue}`
                    : currentChannel
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
          {discovering ? 'Scanning...' : 'Detect Channels'}
        </button>
      </div>

      {/* Save / Load / Export / Import Row */}
      <div className={styles.mappingRow}>
        <select className={styles.loadSelect} onChange={handleLoad} value="">
          <option value="">Load saved mapping...</option>
          {savedMappings.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({new Date(m.updatedAt).toLocaleDateString()})
            </option>
          ))}
        </select>
        <button className={styles.mappingBtn} onClick={handleSave} title="Save current mapping">
          Save{currentMappingName ? ` "${currentMappingName}"` : ''}
        </button>
        {currentMappingName && (
          <button className={styles.mappingBtnDanger} onClick={handleDelete} title="Delete saved mapping">
            Delete
          </button>
        )}
        <button className={styles.mappingBtn} onClick={handleExport} title="Export mapping as JSON file">
          Export
        </button>
        <button className={styles.mappingBtn} onClick={() => importRef.current?.click()} title="Import mapping from JSON file">
          Import
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
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
