import React, { useCallback } from 'react';
import type { AppProps } from './types';
import { WitsMapperPanel } from './witsMapper/WitsMapperPanel';
import { DEFAULT_SETTINGS } from './constants';

const AppSettings: React.FC<AppProps> = ({ well, appSettings, onSettingChange }) => {
  const settings = { ...DEFAULT_SETTINGS, ...appSettings };

  const set = useCallback(
    (key: string, value: unknown) => onSettingChange?.(key, value),
    [onSettingChange],
  );

  return (
    <div style={{ padding: 16, color: '#ddd', fontSize: 13 }}>
      <h3 style={{ color: '#aaa', fontSize: 14, marginBottom: 16 }}>RSS Yields Settings</h3>

      {/* WITS Channel Mapper — now with auto-detect */}
      <WitsMapperPanel
        activeProfileId={settings.activeProfile}
        customOverrides={settings.customChannelOverrides}
        onProfileChange={(id) => set('activeProfile', id)}
        onOverrideChange={(overrides) => set('customChannelOverrides', overrides)}
        assetId={well?.asset_id}
      />

      {/* Unit System */}
      <div style={{ marginTop: 20 }}>
        <label style={{ display: 'block', color: '#aaa', marginBottom: 6 }}>Unit System</label>
        <select
          value={settings.unitSystem}
          onChange={(e) => set('unitSystem', e.target.value)}
          style={{ background: '#2a2a2a', color: '#ccc', border: '1px solid #555', borderRadius: 4, padding: '6px 10px' }}
        >
          <option value="imperial">Imperial (ft, °/100ft)</option>
          <option value="metric">Metric (m, °/30m)</option>
        </select>
      </div>

      {/* Divergence Threshold */}
      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'block', color: '#aaa', marginBottom: 6 }}>
          Yield Divergence Threshold (°/100ft)
        </label>
        <input
          type="number"
          step="0.1"
          min="0.1"
          max="5"
          value={settings.yieldDivergenceThreshold}
          onChange={(e) => set('yieldDivergenceThreshold', parseFloat(e.target.value))}
          style={{ background: '#2a2a2a', color: '#ccc', border: '1px solid #555', borderRadius: 4, padding: '6px 10px', width: 80 }}
        />
      </div>

      {/* Color Mode */}
      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'block', color: '#aaa', marginBottom: 6 }}>Scatter Plot Color By</label>
        <select
          value={settings.colorMode}
          onChange={(e) => set('colorMode', e.target.value)}
          style={{ background: '#2a2a2a', color: '#ccc', border: '1px solid #555', borderRadius: 4, padding: '6px 10px' }}
        >
          <option value="divergence">RSS vs MWD Divergence</option>
          <option value="section">Well Section</option>
          <option value="time">Time</option>
        </select>
      </div>

      {/* Motor Contribution */}
      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#aaa' }}>
          <input
            type="checkbox"
            checked={settings.showMotorContribution}
            onChange={(e) => set('showMotorContribution', e.target.checked)}
          />
          Show Motor Contribution (hybrid BHA)
        </label>
      </div>
    </div>
  );
};

export default AppSettings;
