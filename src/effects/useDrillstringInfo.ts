import { useState, useEffect } from 'react';
import type { RssToolInfo } from '../types';
import { fetchCurrentDrillstring } from '../api/corvaApi';
import { log, error } from '../utils/logger';

export interface UseDrillstringInfoResult {
  toolInfo: RssToolInfo | null;
  loading: boolean;
}

/** Known RSS tool identifiers by vendor */
const RSS_IDENTIFIERS: Record<string, string> = {
  icruise: 'iCruise',
  'i-cruise': 'iCruise',
  powerdrive: 'PowerDrive',
  'power drive': 'PowerDrive',
  geo_pilot: 'Geo-Pilot',
  revolution: 'Revolution',
};

function identifyRssTool(component: Record<string, unknown>): {
  toolName: string;
  vendor: string;
} | null {
  // Primary: Corva drillstring components use `family` field
  const family = String(component.family ?? '').toLowerCase();
  if (family !== 'rss') return null;

  // Identify vendor/model from the component name
  const name = String(component.name ?? '').toLowerCase();
  const make = String(component.make ?? component.vendor ?? '').toLowerCase();

  for (const [key, toolName] of Object.entries(RSS_IDENTIFIERS)) {
    if (name.includes(key) || make.includes(key)) {
      const vendor = toolName.includes('iCruise')
        ? 'Halliburton'
        : toolName.includes('PowerDrive')
          ? 'SLB'
          : 'Unknown';
      return { toolName, vendor };
    }
  }

  // family === 'rss' but no specific tool match — generic RSS
  return { toolName: String(component.name ?? 'RSS'), vendor: make || 'Unknown' };
}

/**
 * Fetches the current drillstring and identifies the RSS tool,
 * bit-to-survey distance, and motor configuration.
 */
export function useDrillstringInfo(assetId: number | undefined): UseDrillstringInfoResult {
  const [toolInfo, setToolInfo] = useState<RssToolInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assetId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const ds = await fetchCurrentDrillstring(assetId);
        if (cancelled || !ds) {
          setToolInfo(null);
          return;
        }

        const record = ds as Record<string, unknown>;
        const components = (record.data as Record<string, unknown>)?.components as
          | Record<string, unknown>[]
          | undefined;

        if (!components?.length) {
          setToolInfo(null);
          return;
        }

        // Find RSS, MWD, motor, and bit components by family
        let rssInfo: { toolName: string; vendor: string } | null = null;
        let rssBitToSurvey = 0;
        let mwdBitToSurvey = 0;
        let hasMotor = false;
        let motorBendAngle: number | null = null;
        let motorYield: number | null = null;

        for (const comp of components) {
          const family = String(comp.family ?? '').toLowerCase();

          // RSS component
          const rss = identifyRssTool(comp);
          if (rss) {
            rssInfo = rss;
            rssBitToSurvey = Number(comp.bit_to_survey ?? comp.length ?? 0);
          }

          // MWD component — get its sensor-to-bit distance
          // Corva field: "bit_to_survey_distance" (confirmed from BHA component data)
          if (family === 'mwd' || family === 'lwd') {
            mwdBitToSurvey = Number(
              comp.bit_to_survey_distance   // Corva standard field name
              ?? comp.sensor_to_bit_distance // alternate naming
              ?? comp.bit_to_survey          // legacy field name
              ?? 0
            );
          }

          // Motor (PDM)
          if (family === 'pdm') {
            hasMotor = true;
            motorBendAngle = comp.bend_angle != null ? Number(comp.bend_angle) : null;
            motorYield = comp.motor_yield != null ? Number(comp.motor_yield) : null;
          }
        }

        // RSS B2S is fixed at ~8ft (near-bit sensor, not entered in BHA data)
        // MWD B2S is what's entered in Corva — this is the MWD sensor measurement distance
        const rssBts = 8; // Fixed — RSS near-bit sensor is always ~8ft from bit
        const mwdBts = mwdBitToSurvey > 0 ? mwdBitToSurvey : 50; // From BHA, default 50ft if not set

        if (rssInfo) {
          setToolInfo({
            ...rssInfo,
            serialNumber: null,
            bitToSurveyDistance: rssBts,
            mwdBitToSurveyDistance: mwdBts,
            hasMotor,
            motorBendAngle,
            motorYield,
          });
          log(`RSS tool identified: ${rssInfo.toolName} (${rssInfo.vendor}), RSS B2S=~${rssBts}ft (fixed), MWD B2S=${mwdBts}ft`);
        } else if (hasMotor) {
          // No RSS in BHA — bent motor (PDM + MWD) configuration.
          // The MWD is the sole survey sensor; there is no near-bit RSS sensor.
          setToolInfo({
            toolName: 'Bent Motor',
            vendor: 'PDM',
            serialNumber: null,
            bitToSurveyDistance: mwdBts,   // For motor: survey sensor IS the MWD
            mwdBitToSurveyDistance: mwdBts,
            hasMotor: true,
            motorBendAngle,
            motorYield,
          });
          log(
            `Bent motor BHA detected: MWD B2S=${mwdBts}ft, ` +
            `bend=${motorBendAngle ?? '?'}°, BHA motor yield=${motorYield ?? '?'}°/100ft`,
          );
        } else {
          setToolInfo(null);
          log('No RSS or motor found in active BHA — toolInfo set to null');
        }
      } catch (e) {
        error('useDrillstringInfo failed:', e);
        setToolInfo(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return { toolInfo, loading };
}
