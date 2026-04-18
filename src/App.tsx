import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { AppProps, TabId, TrackingConfig } from './types';
import { TABS, DEFAULT_TRACKING } from './constants';
import { useSettings } from './effects/useSettings';
import { getProfile, buildResolvedMap, WitsMapperPanel } from './witsMapper';
import { useDrillstringInfo } from './effects/useDrillstringInfo';
import { useFormations } from './effects/useFormations';
import { useReadings } from './effects/useReadings';
import { RssToolInfo } from './components/RssToolInfo';
import { WellPicker } from './components/WellPicker';
import { ControlsBar } from './components/ControlsBar';
import { ReadingsTable } from './components/ReadingsTable';
import { YieldScatterPlot } from './components/YieldScatterPlot';
import { AvgsWindow } from './components/AvgsWindow';
import { computeYieldAnalysis } from './calculations/yieldCalc';
import { isDlsOutlier } from './utils/formatting';
import { exportToExcel } from './reports/excelExport';
import { exportToPdf } from './reports/pdfExport';

const App: React.FC<AppProps> = ({ well, app, appSettings, appHeaderProps }) => {
  const [activeTab, setActiveTab] = useState<TabId>('table');
  const assetId = well?.asset_id;

  // Settings (display prefs only — RSS profile/channels managed locally)
  const { settings } = useSettings(app?.settings ?? appSettings);

  // Drillstring info
  const { toolInfo, loading: dsLoading } = useDrillstringInfo(assetId);
  const { formations } = useFormations(assetId);

  // WITS Mapper panel visibility
  const [showMapper, setShowMapper] = useState(false);

  // RSS profile & channel overrides — managed ONLY via our WITS Mapper panel, not Corva settings
  const [localOverrides, setLocalOverrides] = useState<Record<string, string>>(() => {
    if (!assetId) return {};
    try {
      const saved = localStorage.getItem(`yieldtracker_overrides_${assetId}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [localProfileId, setLocalProfileId] = useState<string>(() => {
    if (!assetId) return 'icruise';
    try {
      return localStorage.getItem(`yieldtracker_profile_${assetId}`) ?? 'icruise';
    } catch { return 'icruise'; }
  });

  // Persist profile/overrides to localStorage
  useEffect(() => {
    if (!assetId) return;
    try {
      localStorage.setItem(`yieldtracker_profile_${assetId}`, localProfileId);
      localStorage.setItem(`yieldtracker_overrides_${assetId}`, JSON.stringify(localOverrides));
    } catch { /* quota */ }
  }, [assetId, localProfileId, localOverrides]);

  // Auto-select profile based on detected RSS tool (only when no saved profile)
  useEffect(() => {
    if (!toolInfo || !assetId) return;
    // Only auto-detect if user hasn't explicitly saved a profile for this well
    const hasSaved = localStorage.getItem(`yieldtracker_profile_${assetId}`);
    if (hasSaved) return;

    const vendor = toolInfo.vendor.toLowerCase();
    const toolName = toolInfo.toolName.toLowerCase();
    if (toolName === 'bent motor') {
      // No RSS — PDM-only BHA; default to bent motor curve profile
      setLocalProfileId('bentmotor_curve');
    } else if (toolName.includes('icruise') || vendor.includes('halliburton')) {
      setLocalProfileId('icruise');
    } else if (toolName.includes('powerdrive') || vendor.includes('slb') || vendor.includes('schlumberger')) {
      setLocalProfileId('powerdrive');
    }
  }, [toolInfo, assetId]);

  const profile = useMemo(
    () => getProfile(localProfileId, localOverrides),
    [localProfileId, localOverrides],
  );

  // Rebuild resolved map from local state so mapper changes take effect immediately
  const resolvedMapFinal = useMemo(
    () => buildResolvedMap(localProfileId, localOverrides),
    [localProfileId, localOverrides],
  );

  // Tracking configuration — persisted to localStorage per asset
  const [trackingConfig, setTrackingConfig] = useState<TrackingConfig>(() => {
    if (!assetId) return DEFAULT_TRACKING;
    try {
      const saved = localStorage.getItem(`yieldtracker_config_${assetId}`);
      if (saved) {
        return JSON.parse(saved) as TrackingConfig;
      }
    } catch { /* ignore parse errors */ }
    return DEFAULT_TRACKING;
  });

  // Save config to localStorage whenever it changes
  useEffect(() => {
    if (!assetId) return;
    try {
      localStorage.setItem(`yieldtracker_config_${assetId}`, JSON.stringify(trackingConfig));
    } catch { /* ignore quota errors */ }
  }, [assetId, trackingConfig]);

  // Config change handler — manages startedAt timestamp for auto-stop timer
  const handleConfigChange = useCallback((newConfig: TrackingConfig) => {
    if (newConfig.isRunning && !trackingConfig.isRunning) {
      newConfig = { ...newConfig, startedAt: Date.now() };
    }
    if (!newConfig.isRunning && trackingConfig.isRunning) {
      newConfig = { ...newConfig, startedAt: null };
    }
    setTrackingConfig(newConfig);
  }, [trackingConfig.isRunning]);

  // Auto-stop timer
  useEffect(() => {
    if (!trackingConfig.isRunning || !trackingConfig.autoStopHours || !trackingConfig.startedAt) return;

    const stopAt = trackingConfig.startedAt + (trackingConfig.autoStopHours * 3600000);
    const remaining = stopAt - Date.now();

    if (remaining <= 0) {
      setTrackingConfig((prev) => ({ ...prev, isRunning: false, startedAt: null }));
      return;
    }

    const timer = setTimeout(() => {
      setTrackingConfig((prev) => ({ ...prev, isRunning: false, startedAt: null }));
    }, remaining);

    return () => clearTimeout(timer);
  }, [trackingConfig.isRunning, trackingConfig.autoStopHours, trackingConfig.startedAt]);

  // Core data — readings, CRUD, auto-trigger
  const {
    readings,
    loading: dataLoading,
    error: dataError,
    currentBitDepth,
    takeReading,
    setNotes,
    removeReading,
    clearAll,
    reload,
  } = useReadings(
    assetId,
    trackingConfig,
    resolvedMapFinal,
    toolInfo?.mwdBitToSurveyDistance ?? 0,
    formations,
    well?.name ?? null,
  );

  // Yield analysis for scatter plot — uses MWD-derived rates as ground truth.
  // Falls back to RSS rates for wells/readings where MWD channels aren't mapped yet.
  // Outlier readings (DLS > DLS_OUTLIER_THRESHOLD, typically survey transients)
  // are excluded so a single spike doesn't pull the regression line.
  const yieldAnalysis = useMemo(() => {
    const stations = readings
      .filter((r) => (r.mwdDls ?? r.dls) != null && !isDlsOutlier(r))
      .map((r) => ({
        mwdDLS: r.mwdDls ?? r.dls!,        // Ground-truth DLS (prefer MWD)
        mwdBUR: r.mwdBr ?? r.br ?? 0,      // Ground-truth build rate
        mwdTUR: r.mwdTr ?? r.tr ?? 0,      // Ground-truth turn rate
        avgDutyCycle: r.dutyCycle,
        buildCommand: r.buildCommand,
        turnCommand: r.turnCommand,
        courseLength: r.courseLength ?? 0,
      }));
    return computeYieldAnalysis(stations);
  }, [readings]);

  // Export handlers
  const handleExportExcel = useCallback(() => {
    exportToExcel(readings, yieldAnalysis, well?.name ?? 'RSS Yields');
  }, [readings, yieldAnalysis, well?.name]);

  const handleExportPdf = useCallback(() => {
    exportToPdf(readings, yieldAnalysis, well?.name ?? 'RSS Yields');
  }, [readings, yieldAnalysis, well?.name]);

  // Manual take reading
  const handleTakeReading = useCallback(() => {
    takeReading('manual');
  }, [takeReading]);

  // AVGs floating window + min slide filter
  const [showAvgs, setShowAvgs] = useState(false);
  const toggleAvgs = useCallback(() => setShowAvgs((v) => !v), []);
  const [minSlideSeen, setMinSlideSeen] = useState<number>(0);

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#141414', color: '#ddd' }}>
      {/* Rig + well selector — drives every per-well hook below via well.asset_id */}
      <WellPicker appHeaderProps={appHeaderProps} />

      {/* Tool info header + settings gear */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <RssToolInfo
            toolInfo={toolInfo}
            profile={profile}
            lastSurveyDepth={readings.length > 0 ? readings[readings.length - 1].depth : null}
            wsConnected={false}
            loading={dsLoading}
            wellName={well?.name ?? null}
          />
        </div>
        <button
          onClick={() => setShowMapper((v) => !v)}
          title="WITS Channel Mapper"
          style={{
            background: showMapper ? '#333' : 'transparent',
            border: '1px solid #444',
            borderRadius: 4,
            color: showMapper ? '#fff' : '#888',
            cursor: 'pointer',
            fontSize: 16,
            padding: '4px 8px',
            marginRight: 8,
          }}
        >
          {'\u2699'}
        </button>
      </div>

      {/* WITS Channel Mapper Panel (toggled by gear icon) */}
      {showMapper && (
        <WitsMapperPanel
          activeProfileId={localProfileId}
          customOverrides={localOverrides}
          onProfileChange={setLocalProfileId}
          onOverrideChange={setLocalOverrides}
          assetId={assetId}
        />
      )}

      {/* Controls bar */}
      <ControlsBar
        config={trackingConfig}
        onConfigChange={handleConfigChange}
        onTakeReading={handleTakeReading}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        onClearAll={clearAll}
        onToggleAvgs={toggleAvgs}
        showAvgs={showAvgs}
        currentBitDepth={currentBitDepth}
        readingCount={readings.length}
      />

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid #333', gap: 6 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? '#333' : 'transparent',
              border: 'none',
              borderRadius: 4,
              color: activeTab === tab.id ? '#fff' : '#888',
              padding: '5px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {dataError && (
        <div style={{ padding: '6px 16px', background: '#3a1a1a', color: '#f44336', fontSize: 12 }}>
          Error: {dataError}
        </div>
      )}

      {/* Tab content */}
      <div style={{ flex: '1 1 0', position: 'relative', minHeight: 0 }}>
        {activeTab === 'table' && (
          <ReadingsTable
            readings={readings}
            onSetNotes={setNotes}
            onDelete={removeReading}
            dlNeeded={trackingConfig.dlNeeded ?? null}
            profile={profile}
            minSlideSeen={minSlideSeen}
          />
        )}
        {activeTab === 'scatter' && (
          <YieldScatterPlot
            stations={readings.filter((r) => (r.mwdDls ?? r.dls) != null && !isDlsOutlier(r)).map((r) => ({
              avgDutyCycle: r.dutyCycle,
              mwdDLS: r.mwdDls ?? r.dls!,   // Ground-truth DLS for regression
              mwdBUR: r.mwdBr ?? r.br ?? 0,
              mwdTUR: r.mwdTr ?? r.tr ?? 0,
              rssDLS: r.dls ?? r.mwdDls!,   // RSS near-bit DLS for divergence coloring
              mwdDepth: r.depth,
              avgToolFaceSet: r.toolFaceSet,
              buildCommand: r.buildCommand,
              turnCommand: r.turnCommand,
              courseLength: r.courseLength ?? 0,
            }))}
            divergenceThreshold={settings.yieldDivergenceThreshold}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {content}
      {showAvgs && (
        <AvgsWindow
          readings={readings}
          minSlideSeen={minSlideSeen}
          onMinSlideSeenChange={setMinSlideSeen}
          onClose={() => setShowAvgs(false)}
        />
      )}
    </>
  );
};

export default App;
