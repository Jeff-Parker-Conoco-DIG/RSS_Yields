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
          <span>MWD Sensor to Bit: {toolInfo.mwdBitToSurveyDistance} ft</span>
          {toolInfo.hasMotor && (
            <span>
              Motor: Yes{toolInfo.motorBendAngle != null ? ` (bend ${toolInfo.motorBendAngle}°)` : ''}
            </span>
          )}
        </>
      )}

      {lastSurveyDepth != null && <span>Last: {lastSurveyDepth.toFixed(1)} ft</span>}
    </div>
  );
};
