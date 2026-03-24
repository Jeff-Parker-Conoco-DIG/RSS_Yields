# YieldTracker — WITS ID Search in Channel Dropdowns

Read this entire prompt. Use skills: systematic-debugging, verification-before-completion

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`

The WITS Mapper panel has searchable channel dropdowns (`SearchableChannelSelect.tsx`). Currently the DD can search by field name (e.g. "rss_continuous") or by value (e.g. "92.87"). The DD also wants to search by **WITS record number** — e.g. typing "871" should find the channel mapped to WITS ID 871 (RSS Toolface Type / iCTFSet).

## Goal

Add a WITS ID lookup table so the searchable dropdowns can match against WITS record numbers in addition to field names and values.

## Implementation

### Step 1: Create WITS ID lookup table

Create `src/witsMapper/witsIdLookup.ts`:

```typescript
/**
 * Mapping of WITS record IDs to their standard names and known Corva field names.
 * Used by the searchable channel dropdowns to allow DD to search by WITS number.
 *
 * Source: RigCloud rename table for Halliburton iCruise (Nabors X04, March 2026)
 * Reference: docs/ICRUISE_CHANNEL_MAPPING.md
 */
export interface WitsIdEntry {
  witsId: number;
  rigCloudName: string;           // e.g. "RSS Inclination"
  rigCloudRename: string;         // e.g. "iCInc"
  knownCorvaFields: string[];     // Known field names this WITS ID maps to in Corva
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
 * Returns matching entries.
 */
export function searchWitsIds(query: string): WitsIdEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return WITS_ID_TABLE.filter((entry) => {
    // Match WITS ID number (exact or prefix)
    if (entry.witsId > 0 && String(entry.witsId).includes(q)) return true;
    // Match RigCloud name
    if (entry.rigCloudName.toLowerCase().includes(q)) return true;
    // Match RigCloud rename (iC prefix names)
    if (entry.rigCloudRename.toLowerCase().includes(q)) return true;
    // Match known Corva field names
    if (entry.knownCorvaFields.some((f) => f.toLowerCase().includes(q))) return true;
    return false;
  });
}
```

### Step 2: Integrate into SearchableChannelSelect

Modify `src/witsMapper/SearchableChannelSelect.tsx` to:

1. Import `buildFieldToWitsMap` and `searchWitsIds` from `witsIdLookup.ts`
2. Build the field→WITS map once (useMemo)
3. Modify the search/filter logic:

**Current filter logic** (searches field name and value):
```typescript
// Pseudocode of current approach:
const filtered = channels.filter(ch => 
  ch.field.toLowerCase().includes(query) || 
  String(ch.lastValue).includes(query)
);
```

**New filter logic** (also searches WITS ID, RigCloud name, RigCloud rename):
```typescript
const fieldToWits = useMemo(() => buildFieldToWitsMap(), []);

// When filtering channels by search query:
const matchesQuery = (ch: DiscoveredChannel, query: string): boolean => {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  // Match field name
  if (ch.field.toLowerCase().includes(q)) return true;
  // Match value
  if (ch.lastValue != null && String(ch.lastValue).includes(q)) return true;

  // Match WITS ID entry for this field
  const witsEntry = fieldToWits.get(ch.field);
  if (witsEntry) {
    if (witsEntry.witsId > 0 && String(witsEntry.witsId).includes(q)) return true;
    if (witsEntry.rigCloudName.toLowerCase().includes(q)) return true;
    if (witsEntry.rigCloudRename.toLowerCase().includes(q)) return true;
  }

  // Also check if query matches ANY WITS table entry — show known fields even if not discovered
  const witsMatches = searchWitsIds(q);
  for (const entry of witsMatches) {
    if (entry.knownCorvaFields.includes(ch.field)) return true;
  }

  return false;
};
```

4. **Annotate channel options with WITS ID info:**

When rendering each channel option in the dropdown, if the field has a matching WITS ID entry, show it as additional context:

```
rss_continuous_inclination (92.87)  [WITS 862 — iCInc]
rsspsum (70.00)                     [WITS 880 — iCDutyCycle]
gravity_tool_face (73.13)           [Gravity Toolface]
mwd_axial_peak_shock (13.00)        [WITS 946]
```

The WITS annotation should be in a muted color (e.g. #666) and smaller font, appended after the value. Only show it for channels that have a WITS ID entry.

5. **Show WITS search results even for undiscovered channels:**

When the DD searches by WITS ID (e.g. "871"), and the matching channel doesn't exist in the discovered channels list, show a message below the dropdown results:

```
WITS 871: RSS Toolface Type (iCTFSet)
⚠ Not found in WITS data — channel may not be configured in RigCloud
```

This helps the DD understand WHY a channel is missing and what to ask the data tech to enable.

### Step 3: Update the search placeholder

Change the search input placeholder from "Search channels..." to "Search by name, value, or WITS ID..."

## Files to Create

| File | Purpose |
|------|---------|
| `src/witsMapper/witsIdLookup.ts` | WITS ID → field name lookup table + search functions |

## Files to Modify

| File | Change |
|------|--------|
| `src/witsMapper/SearchableChannelSelect.tsx` | Integrate WITS ID search into filter logic, annotate options, show missing channel hints |
| `src/witsMapper/index.ts` | Export new lookup functions if needed |

## What NOT to change

- `src/witsMapper/WitsMapperPanel.tsx` — panel structure is correct
- `src/witsMapper/channelProfiles.ts` — profiles are correct
- `src/witsMapper/types.ts` — types are correct
- `src/api/corvaApi.ts` — API is correct

## Build Verification

Run `yarn build` after all changes. Fix all errors.

## Definition of Done

- [ ] WITS ID lookup table created with all known iCruise channels
- [ ] `searchWitsIds()` function searches by WITS ID number, RigCloud name, and rename
- [ ] `buildFieldToWitsMap()` creates reverse lookup from Corva field → WITS entry
- [ ] Searching "871" in a dropdown shows channels associated with WITS 871
- [ ] Searching "iCTFSet" or "iCInc" finds the corresponding channels
- [ ] Channel options annotated with WITS ID info (muted, after value)
- [ ] Missing channels show a hint message with the WITS ID name
- [ ] Search placeholder updated to mention WITS ID
- [ ] **`yarn build` completes with ZERO errors**
