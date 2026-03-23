import React, { useState, useCallback, useMemo } from 'react';
import type { AppProps, TabId, TrackingConfig } from './types';
import { TABS, DEFAULT_TRACKING } from './constants';
import { useSettings } from './effects/useSettings';
import { useDrillstringInfo } from './effects/useDrillstringInfo';
import { useReadings } from './effects/useReadings';
import { RssToolInfo } from './components/RssToolInfo';
import { ControlsBar } from './components/ControlsBar';
import { ReadingsTable } from './components/ReadingsTable';
import { YieldScatterPlot } from './components/YieldScatterPlot';
import { computeYieldAnalysis } from './calculations/yieldCalc';
import { exportToExcel } from './reports/excelExport';
import { exportToPdf } from './reports/pdfExport';

// Corva AppContainer (optional — graceful fallback for standalone dev)
let AppContainer: React.FC<{ header: React.ReactNode; testId?: string; children: React.ReactNode }> | null = null;
let AppHeader: React.FC | null = null;

try {
  const componentsV2 = require('@corva/ui/componentsV2');
  AppContainer = componentsV2.AppContainer;
  AppHeader = componentsV2.AppHeader;
} catch {
  // Running in standalone dev mode
}

const App: React.FC<AppProps> = ({ well, app, appSettings, appHeaderProps }) => {
  const [activeTab, setActiveTab] = useState<TabId>('table');
  const assetId = well?.asset_id;

  // Settings & WITS profile
  const { settings, profile } = useSettings(app?.settings ?? appSettings);

  // Drillstring info
  const { toolInfo, loading: dsLoading } = useDrillstringInfo(assetId);

  // Tracking configuration (persisted in component state for now)
  const [trackingConfig, setTrackingConfig] = useState<TrackingConfig>(DEFAULT_TRACKING);

  // Core data — readings, CRUD, auto-trigger
  const {
    readings,
    loading: dataLoading,
    error: dataError,
    currentBitDepth,
    takeReading,
    setNotes,
    removeReading,
    reload,
  } = useReadings(assetId, trackingConfig, profile);

  // Yield analysis for scatter plot
  const yieldAnalysis = useMemo(() => {
    // Convert readings to the shape yieldCalc expects
    const stations = readings.filter((r) => r.dls != null).map((r) => ({
      mwdDLS: r.dls!,
      mwdBUR: r.br!,
      mwdTUR: r.tr!,
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

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#141414', color: '#ddd' }}>
      {/* Tool info header */}
      <RssToolInfo
        toolInfo={toolInfo}
        profile={profile}
        lastSurveyDepth={readings.length > 0 ? readings[readings.length - 1].depth : null}
        wsConnected={false}
        loading={dsLoading}
      />

      {/* Controls bar */}
      <ControlsBar
        config={trackingConfig}
        onConfigChange={setTrackingConfig}
        onTakeReading={handleTakeReading}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
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
          />
        )}
        {activeTab === 'scatter' && (
          <YieldScatterPlot
            stations={readings.filter((r) => r.dls != null).map((r) => ({
              avgDutyCycle: r.dutyCycle,
              mwdDLS: r.dls!,
              mwdBUR: r.br!,
              mwdTUR: r.tr!,
              rssDLS: r.dls!,
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

  // Wrap in Corva AppContainer if available
  if (AppContainer && AppHeader) {
    return (
      <AppContainer header={<AppHeader {...(appHeaderProps ?? {})} />} testId="rss-yields">
        {content}
      </AppContainer>
    );
  }

  return content;
};

export default App;
