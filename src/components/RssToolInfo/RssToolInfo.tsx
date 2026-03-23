import React from 'react';
import type { RssToolInfo as RssToolInfoType } from '../../types';
import type { WitsChannelProfile } from '../../witsMapper/types';

interface RssToolInfoProps {
  toolInfo: RssToolInfoType | null;
  profile: WitsChannelProfile;
  lastSurveyDepth: number | null;
  wsConnected: boolean;
  loading: boolean;
}

export const RssToolInfo: React.FC<RssToolInfoProps> = ({
  toolInfo,
  profile,
  lastSurveyDepth,
  wsConnected,
  loading,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 16px',
        background: '#1e1e1e',
        borderBottom: '1px solid #333',
        fontSize: 13,
        color: '#aaa',
      }}
    >
      <span style={{ fontWeight: 600, color: '#ddd' }}>
        {loading ? 'Loading...' : toolInfo ? `${toolInfo.toolName} (${toolInfo.vendor})` : 'No RSS detected'}
      </span>

      {toolInfo && (
        <>
          <span>B2S: {toolInfo.bitToSurveyDistance} ft</span>
          {toolInfo.hasMotor && <span>Motor: Yes (bend {toolInfo.motorBendAngle ?? '?'}°)</span>}
        </>
      )}

      <span>Profile: {profile.vendorName}</span>

      {lastSurveyDepth != null && <span>Last: {lastSurveyDepth.toFixed(1)} ft</span>}

      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: wsConnected ? '#4caf50' : '#666',
            display: 'inline-block',
            animation: wsConnected ? 'pulse 2s infinite' : 'none',
          }}
        />
        {wsConnected ? 'Live' : 'Offline'}
      </span>
    </div>
  );
};
