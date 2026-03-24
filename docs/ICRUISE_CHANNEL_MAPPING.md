# iCruise Channel Mapping Reference
## Noralis → RigCloud → Corva (Raw WITS & Summary-1ft)

### Data Flow
```
Noralis Surface System → RigCloud (rename/aggregate) → Corva raw WITS (corva/wits)
                                                     → Corva summary-1ft (wits.summary-1ft)
                                                     → Corva Cerebro (drilling.halliburton.cerebro-raw) [412 on Nabors X04]
```

### Well Under Test
- **Rig:** Nabors X04
- **Asset ID:** 74307056
- **RSS Tool:** Halliburton iCruise
- **MWD:** Halliburton (Noralis surface system)
- **Data Provider:** RigCloud
- **Date:** March 23, 2026

---

## CONFIRMED CHANNELS (verified on Nabors X04, 448 channels discovered)

### RSS Steering & Survey Channels

| WITS ID | Noralis / RigCloud Name       | RigCloud Rename | Corva Raw WITS Field          | Value   | Summary-1ft Variants                    | Status  |
|---------|-------------------------------|-----------------|-------------------------------|---------|------------------------------------------|---------|
| 862     | RSS Inclination               | iCInc           | `rss_continuous_inclination`  | 92.87°  | `_max`, `_mean`, `_median`, `_min`       | ✅ Active |
| 868     | RSS Azimuth                   | iCAzim          | `rss_continuous_azimuth`      | 279.75° | `_max`, `_mean`, `_median`, `_min`       | ✅ Active |
| 880     | RSS Possum (Duty Cycle)       | iCDutyCycle     | `rsspsum`                     | 70.00%  | —                                        | ✅ Active |
| 871     | RSS Toolface Type             | iCTFSet         | ❌ NOT IN WITS                | —       | —                                        | ❌ Missing |
| 878     | RSS Lower Torque RPM          | iCTurbRPM       | `rsslowtorqrpm`               | 2100    | —                                        | ✅ Active |
| 865     | RSS Inclination Target        | iCIncSet        | ❌ NOT IN WITS                | —       | `rssinctgt` (inactive)                   | ⚠ Inactive |
| 867     | RSS Azimuth Target            | iCAzimSet       | `rssazitgt`                   | 7.68°   | —                                        | ✅ Active |
| 7070    | RSS Stick Slip Indicator      | iCSSlip         | ❌ NOT IN WITS                | —       | `rss_ssind` (inactive)                   | ⚠ Inactive |

### RSS Shock & Vibration Channels

| WITS ID | Noralis / RigCloud Name       | RigCloud Rename   | Corva Raw WITS Field | Value | Summary-1ft Variants | Status  |
|---------|-------------------------------|--------------------|----------------------|-------|----------------------|---------|
| 919     | RSS Vibe Radial               | iCPeakLateral      | `rsswhirl`           | 1.00  | —                    | ✅ Active |
| 851     | RSS Shock Axial               | iCPeakAxial        | ❌ NOT IN WITS       | —     | `rssvibax` (inactive)| ⚠ Inactive |
| 849     | RSS Shock Lateral             | iCAvgLatY          | ❌ NOT IN WITS       | —     | —                    | ❌ Missing |
| 916     | RSS Shock Radial              | iCAvgLatX          | ❌ NOT IN WITS       | —     | —                    | ❌ Missing |
| 904     | Icruise HFTO                  | Icruise HFTO       | ❌ NOT IN WITS       | —     | —                    | ❌ Missing |
| 7099    | MWD Low S&V Alarm Threshold   | iCHFTO             | ❌ NOT IN WITS       | —     | —                    | ❌ Missing |

### Toolface Channels

| WITS ID | Noralis / RigCloud Name       | RigCloud Rename | Corva Raw WITS Field    | Value    | Summary-1ft Variants              | Status  |
|---------|-------------------------------|-----------------|-------------------------|----------|-----------------------------------|---------|
| —       | Gravity Toolface              | —               | `gravity_tool_face`     | 73.13°   | `_max`, `_mean`, `_median`, `_min`| ✅ Active |
| —       | Magnetic Toolface             | —               | `magnetic_tool_face`    | 333.93°  | `_max`, `_mean`, `_median`, `_min`| ✅ Active |

### MWD Survey Channels

| WITS ID | Noralis / RigCloud Name       | RigCloud Rename | Corva Raw WITS Field        | Value    | Summary-1ft Variants              | Status  |
|---------|-------------------------------|-----------------|------------------------------|----------|-----------------------------------|---------|
| —       | Continuous Inclination        | —               | `continuous_inclination`     | 90.75°   | `_max`, `_mean`, `_median`, `_min`| ✅ Active |
| —       | MWD Continuous Azimuth        | —               | `mwd_continuous_azimuth`     | 275.35°  | `_max`, `_mean`, `_median`, `_min`| ✅ Active |

### MWD Shock & Vibration Channels

| WITS ID | Noralis / RigCloud Name       | RigCloud Rename                  | Corva Raw WITS Field          | Value  | Summary-1ft Variants              | Status  |
|---------|-------------------------------|----------------------------------|-------------------------------|--------|-----------------------------------|---------|
| 946     | MWD Axial SHK Peak            | iCruise Peak Axial Vib (Z)       | `mwd_axial_peak_shock`        | 13.00g | `_max`, `_mean`, `_median`, `_min`| ✅ Active |
| 947     | MWD Lateral SHK Peak          | iCruise Peak Lat Vib (x)         | `mwd_lateral_peak_shock`      | 29.00g | `_max`, `_mean`, `_median`, `_min`| ✅ Active |

### RSS Status / Mode Channels

| WITS ID | Noralis / RigCloud Name       | RigCloud Rename | Corva Raw WITS Field | Value | Status  |
|---------|-------------------------------|-----------------|----------------------|-------|---------|
| 869     | RSS RTSTAT                    | iCTFSrc         | ❌ NOT IN WITS       | —     | ❌ Missing |
| 905     | RSS RTSTAT2                   | iCIncSrc        | ❌ NOT IN WITS       | —     | ❌ Missing |
| 907     | RSS RTSTAT3                   | iCMode          | ❌ NOT IN WITS       | —     | ❌ Missing |
| 913     | RSS RTSTAT4                   | iCTFStdDev      | ❌ NOT IN WITS       | —     | ❌ Missing |
| 921     | RSS GRRAW                     | iCToolConfig    | ❌ NOT IN WITS       | —     | ❌ Missing |
| 923     | MWD Telemetry Mode            | iCAzimSource    | ❌ NOT IN WITS       | —     | ❌ Missing |

### Other MWD Channels

| WITS ID | Noralis / RigCloud Name       | RigCloud Rename           | Corva Raw WITS Field | Value | Status  |
|---------|-------------------------------|---------------------------|----------------------|-------|---------|
| 967     | MWD RPM Tool Min              | iCCRPM                    | ❌ NOT IN WITS       | —     | ❌ Missing |
| 9058    | MWD APWD                      | iCruise Diff Pressure     | ❌ NOT IN WITS       | —     | ❌ Missing |
| 915     | MWD Med S&V Alarm Threshold   | iCAvgAxial                | ❌ NOT IN WITS       | —     | ❌ Missing |

---

## SUMMARY

### What's Available for RSS Monitoring (YieldTracker)

**Real-time channels (from raw WITS, updated every ~1 sec):**
- `rss_continuous_inclination` — RSS near-bit inc
- `rss_continuous_azimuth` — RSS near-bit az
- `rsspsum` — Duty cycle %
- `gravity_tool_face` — Gravity toolface (best available TF, but not iCruise TF Set)
- `rsslowtorqrpm` — RSS turbine RPM
- `rsswhirl` — RSS whirl/lateral vibe indicator
- `rssazitgt` — RSS azimuth target setpoint
- `mwd_axial_peak_shock` — MWD axial peak shock (g)
- `mwd_lateral_peak_shock` — MWD lateral peak shock (g)

**Summary channels (from summary-1ft, aggregated per foot):**
- All of the above with `_max`, `_mean`, `_median`, `_min` variants

### What's Missing (not flowing through Noralis → RigCloud → Corva)

**Critical for RSS monitoring:**
- iCruise TF Set (WITS 871) — commanded toolface setpoint
- iCruise HFTO (WITS 904) — high-frequency torsional oscillation
- RSS Peak Axial shock (WITS 851) — RSS-measured axial shock
- RSS Shock Lateral (WITS 849) — RSS-measured lateral shock

**Nice to have:**
- iCruise Mode (WITS 907) — current operating mode
- iCruise TF StdDev (WITS 913) — toolface consistency
- APWD / Diff Pressure (WITS 9058)
- MWD RPM Tool Min (WITS 967) — near-bit RPM

### Action Items to Get Missing Channels

1. **Contact RigCloud data tech** — verify WITS records 871, 904, 851, 849, 916 are configured in the RigCloud rename mapping for this rig
2. **Contact Noralis field tech** — verify the Noralis surface system is transmitting these WITS records to RigCloud
3. **Consider Cerebro** — if Halliburton's Cerebro pipeline can be enabled (`drilling.halliburton.cerebro-raw` currently returns 412), ALL iCruise channels would be available with `iC` prefix names

---

## RSS MONITORING ALERT THRESHOLDS (Recommended)

| Parameter | Channel | Green | Yellow | Red | Units |
|-----------|---------|-------|--------|-----|-------|
| MWD Axial Shock | `mwd_axial_peak_shock` | < 10 | 10-20 | > 20 | g |
| MWD Lateral Shock | `mwd_lateral_peak_shock` | < 15 | 15-30 | > 30 | g |
| RSS Whirl | `rsswhirl` | < 2 | 2-3 | > 3 | level |
| Turbine RPM | `rsslowtorqrpm` | > 1500 | 1000-1500 | < 1000 | RPM |
| HFTO | (not available) | < 1 | 1-2 | > 2 | level |

**Current values on Nabors X04 (March 23, 2026):**
- MWD Axial: 13g (Yellow ⚠)
- MWD Lateral: 29g (Yellow ⚠)
- RSS Whirl: 1.0 (Green ✅)
- Turbine RPM: 2100 (Green ✅)

*Note: 29g lateral shock is high — the MWD tool is taking significant lateral impacts.*
