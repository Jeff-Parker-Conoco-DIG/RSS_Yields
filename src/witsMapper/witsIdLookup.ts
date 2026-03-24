/**
 * Mapping of WITS record IDs to their standard names and known Corva field names.
 * Used by the searchable channel dropdowns to allow DD to search by WITS number.
 *
 * Source: RigCloud rename table for Halliburton iCruise (Nabors X04, March 2026)
 * Reference: docs/ICRUISE_CHANNEL_MAPPING.md
 */
export interface WitsIdEntry {
  witsId: number;
  rigCloudName: string;
  rigCloudRename: string;
  knownCorvaFields: string[];
}

export const WITS_ID_TABLE: WitsIdEntry[] = [
  // RSS Steering & Survey
  { witsId: 862, rigCloudName: 'RSS Inclination', rigCloudRename: 'iCInc', knownCorvaFields: ['rss_continuous_inclination'] },
  { witsId: 868, rigCloudName: 'RSS Azimuth', rigCloudRename: 'iCAzim', knownCorvaFields: ['rss_continuous_azimuth'] },
  { witsId: 880, rigCloudName: 'RSS Possum (Duty Cycle)', rigCloudRename: 'iCDutyCycle', knownCorvaFields: ['rsspsum'] },
  { witsId: 871, rigCloudName: 'RSS Toolface Type', rigCloudRename: 'iCTFSet', knownCorvaFields: [] },
  { witsId: 878, rigCloudName: 'RSS Lower Torque RPM', rigCloudRename: 'iCTurbRPM', knownCorvaFields: ['rsslowtorqrpm'] },
  { witsId: 865, rigCloudName: 'RSS Inclination Target', rigCloudRename: 'iCIncSet', knownCorvaFields: ['rssinctgt'] },
  { witsId: 867, rigCloudName: 'RSS Azimuth Target', rigCloudRename: 'iCAzimSet', knownCorvaFields: ['rssazitgt'] },
  { witsId: 7070, rigCloudName: 'RSS Stick Slip Indicator', rigCloudRename: 'iCSSlip', knownCorvaFields: ['rss_ssind'] },

  // RSS Shock & Vibration
  { witsId: 919, rigCloudName: 'RSS Vibe Radial', rigCloudRename: 'iCPeakLateral', knownCorvaFields: ['rsswhirl'] },
  { witsId: 851, rigCloudName: 'RSS Shock Axial', rigCloudRename: 'iCPeakAxial', knownCorvaFields: ['rssvibax'] },
  { witsId: 849, rigCloudName: 'RSS Shock Lateral', rigCloudRename: 'iCAvgLatY', knownCorvaFields: [] },
  { witsId: 916, rigCloudName: 'RSS Shock Radial', rigCloudRename: 'iCAvgLatX', knownCorvaFields: [] },
  { witsId: 904, rigCloudName: 'Icruise HFTO', rigCloudRename: 'Icruise HFTO', knownCorvaFields: [] },
  { witsId: 7099, rigCloudName: 'MWD Low S&V Alarm Threshold', rigCloudRename: 'iCHFTO', knownCorvaFields: [] },

  // MWD Shock & Vibration
  { witsId: 946, rigCloudName: 'MWD Axial SHK Peak', rigCloudRename: 'iCruise Peak Axial Vib (Z)', knownCorvaFields: ['mwd_axial_peak_shock'] },
  { witsId: 947, rigCloudName: 'MWD Lateral SHK Peak', rigCloudRename: 'iCruise Peak Lat Vib (x)', knownCorvaFields: ['mwd_lateral_peak_shock'] },

  // RSS Status / Mode
  { witsId: 869, rigCloudName: 'RSS RTSTAT', rigCloudRename: 'iCTFSrc', knownCorvaFields: [] },
  { witsId: 905, rigCloudName: 'RSS RTSTAT2', rigCloudRename: 'iCIncSrc', knownCorvaFields: [] },
  { witsId: 907, rigCloudName: 'RSS RTSTAT3', rigCloudRename: 'iCMode', knownCorvaFields: [] },
  { witsId: 913, rigCloudName: 'RSS RTSTAT4', rigCloudRename: 'iCTFStdDev', knownCorvaFields: [] },
  { witsId: 921, rigCloudName: 'RSS GRRAW', rigCloudRename: 'iCToolConfig', knownCorvaFields: [] },
  { witsId: 923, rigCloudName: 'MWD Telemetry Mode', rigCloudRename: 'iCAzimSource', knownCorvaFields: [] },

  // Other MWD
  { witsId: 967, rigCloudName: 'MWD RPM Tool Min', rigCloudRename: 'iCCRPM', knownCorvaFields: [] },
  { witsId: 9058, rigCloudName: 'MWD APWD', rigCloudRename: 'iCruise Diff Pressure', knownCorvaFields: [] },
  { witsId: 915, rigCloudName: 'MWD Med S&V Alarm Threshold', rigCloudRename: 'iCAvgAxial', knownCorvaFields: [] },

  // Common surface/MWD channels (not iCruise-specific but useful for search)
  { witsId: 0, rigCloudName: 'Gravity Toolface', rigCloudRename: '', knownCorvaFields: ['gravity_tool_face'] },
  { witsId: 0, rigCloudName: 'Magnetic Toolface', rigCloudRename: '', knownCorvaFields: ['magnetic_tool_face'] },
  { witsId: 0, rigCloudName: 'Continuous Inclination', rigCloudRename: '', knownCorvaFields: ['continuous_inclination'] },
  { witsId: 0, rigCloudName: 'MWD Continuous Azimuth', rigCloudRename: '', knownCorvaFields: ['mwd_continuous_azimuth'] },
];

/**
 * Build a reverse lookup: Corva field name → WITS ID entry.
 * Used to annotate channel options in the dropdown with their WITS ID.
 */
export function buildFieldToWitsMap(): Map<string, WitsIdEntry> {
  const map = new Map<string, WitsIdEntry>();
  for (const entry of WITS_ID_TABLE) {
    for (const field of entry.knownCorvaFields) {
      map.set(field, entry);
    }
  }
  return map;
}

/**
 * Search the WITS ID table by a query string.
 * Matches against: WITS ID number, RigCloud name, RigCloud rename, known Corva fields.
 */
export function searchWitsIds(query: string): WitsIdEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return WITS_ID_TABLE.filter((entry) => {
    if (entry.witsId > 0 && String(entry.witsId).includes(q)) return true;
    if (entry.rigCloudName.toLowerCase().includes(q)) return true;
    if (entry.rigCloudRename.toLowerCase().includes(q)) return true;
    if (entry.knownCorvaFields.some((f) => f.toLowerCase().includes(q))) return true;
    return false;
  });
}
