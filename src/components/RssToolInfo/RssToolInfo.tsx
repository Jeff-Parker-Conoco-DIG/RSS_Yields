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
  const isMotorProfile = profile.toolType === 'motor';

  // Header badge: always driven by the active PROFILE so changes are instant.
  // When BHA detection returns extra info we append it, but the primary label
  // comes from the profile the user selected.
  const profileLabel = isMotorProfile ? 'Bent Motor (PDM)' : profile.vendorName;

  // For a bent motor, show bend angle and BHA-rated motor yield prominently
  const isMotorBha = toolInfo?.toolName === 'Bent Motor';

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
      {/* Tool name — driven by the active profile */}
      <span style={{ fontWeight: 600, color: '#ddd' }}>
        {loading ? 'Loading...' : profileLabel}
      </span>

      {toolInfo && (
        <>
          <span>MWD B2S: {toolInfo.mwdBitToSurveyDistance} ft</span>

          {isMotorBha ? (
            // Bent motor — show bend angle and BHA-rated yield
            <>
              {toolInfo.motorBendAngle != null && (
                <span>Bend: {toolInfo.motorBendAngle}°</span>
              )}
              {toolInfo.motorYield != null && (
                <span title="BHA-rated motor yield from drillstring">
                  BHA Yield: {toolInfo.motorYield.toFixed(2)} °/100ft
                </span>
              )}
            </>
          ) : (
            // RSS BHA — show motor assist note if present
            toolInfo.hasMotor && (
              <span>
                Motor assist{toolInfo.motorBendAngle != null ? ` (bend ${toolInfo.motorBendAngle}°)` : ''}
              </span>
            )
          )}
        </>
      )}

      {lastSurveyDepth != null && <span>Last: {lastSurveyDepth.toFixed(1)} ft</span>}
    </div>
  );
};
