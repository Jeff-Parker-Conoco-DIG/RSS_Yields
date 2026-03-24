# YieldTracker — Console Log Cleanup + Dead Code Removal

Read this entire prompt. Use skills: systematic-debugging, verification-before-completion

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`

The app is being prepared for deployment to other users. There are diagnostic console logs and dead type fields that need to be cleaned up.

## Task 1: Remove Diagnostic Console Logs

### `src/effects/useReadings.ts`

Remove the MWD rate diagnostic log (added during development to debug MWD BR calculations):

Find and REMOVE this log statement (approximately line 213):
```typescript
log(`MWD rates: prevInc=${prev.mwdInc} currInc=${mwdInc} prevAz=${prev.mwdAz} currAz=${mwdAz} CL=${cl} → BR=${mwdBr?.toFixed(4)} TR=${mwdTr?.toFixed(4)} DLS=${mwdDls?.toFixed(4)}`);
```

### `src/effects/useDrillstringInfo.ts`

Remove the MWD component sensor-to-bit diagnostic log:
```typescript
log(`MWD sensor-to-bit: ${mwdBitToSurvey}ft (from BHA component)`);
```
Keep the RSS tool identification log — that one is useful:
```typescript
log(`RSS tool identified: ${rssInfo.toolName} (${rssInfo.vendor}), RSS B2S=~${rssBts}ft (fixed), MWD B2S=${mwdBts}ft`);
```

### `src/api/corvaApi.ts`

The BHA listing log is verbose — it dumps all 10 BHA names every time the app loads. Shorten it to just show which BHA was selected:

Find:
```typescript
log(`Found ${arr.length} non-planning BHAs: ${bhaList.map(b => `#${b.id} "${b.name}"`).join(', ')}`);
```
Replace with:
```typescript
log(`Found ${arr.length} non-planning BHAs`);
```

Keep the selected BHA log:
```typescript
log(`Selected active BHA: #${dsData?.id ?? '?'} "${dsData?.name ?? ''}"`);
```

## Task 2: Remove Dead Fields from YieldReading

### `src/types.ts`

The `YieldReading` interface has these fields that are no longer populated or used:

1. **`toolFaceStdDev: number | null`** — was replaced by `resultantTF`. The field still exists in the type but `takeReading()` no longer populates it (it was removed in the MWD/ResTF prompt). Remove it.

2. **`deltaInc: number | null`** — RSS Inc minus MWD Inc. Was planned but never implemented in `takeReading()`. Remove it.

3. **`deltaAz: number | null`** — RSS Az minus MWD Az. Was planned but never implemented in `takeReading()`. Remove it.

Remove all three fields from the `YieldReading` interface and their comments.

### After removing from types.ts, search for any references:

Run a global search across the `src/` directory for:
- `toolFaceStdDev` — remove any remaining references (table columns, export columns, etc.)
- `deltaInc` — remove any remaining references
- `deltaAz` — remove any remaining references

These may appear in:
- `src/components/ReadingsTable/ReadingsTable.tsx` — if there's a TF Std column still referencing it
- `src/reports/excelExport.ts` — if it's in the Excel export columns
- `src/reports/pdfExport.ts` — if it's in the PDF export columns
- `src/effects/useReadings.ts` — if takeReading() still assigns these fields

For each reference found:
- If it's a table column displaying `toolFaceStdDev`, remove the column
- If it's an export field, remove it from the export
- If it's an assignment in `takeReading()`, remove the assignment
- If it's a type reference, update the type

## Task 3: Remove Scratch Files

Delete `scratch_channel_diagnostic.js` from the project root — it was a temporary diagnostic script that's no longer needed.

Also remove `AUDIT_REPORT.md` if it exists — it was from an early code review and is outdated.

## Files to Modify

| File | Change |
|------|--------|
| `src/effects/useReadings.ts` | Remove MWD rate diagnostic log |
| `src/effects/useDrillstringInfo.ts` | Remove MWD sensor-to-bit diagnostic log |
| `src/api/corvaApi.ts` | Shorten BHA listing log |
| `src/types.ts` | Remove `toolFaceStdDev`, `deltaInc`, `deltaAz` from YieldReading |
| Any file referencing removed fields | Update to remove references |
| `scratch_channel_diagnostic.js` | DELETE file |
| `AUDIT_REPORT.md` | DELETE file if exists |

## Build Verification

Run `yarn build` after all changes. Fix all errors — removing type fields will likely cause TypeScript errors in files that reference them.

## Definition of Done

- [ ] MWD rate diagnostic log removed from useReadings.ts
- [ ] MWD sensor-to-bit diagnostic log removed from useDrillstringInfo.ts
- [ ] BHA listing log shortened in corvaApi.ts
- [ ] `toolFaceStdDev` removed from YieldReading and all references
- [ ] `deltaInc` removed from YieldReading and all references
- [ ] `deltaAz` removed from YieldReading and all references
- [ ] `scratch_channel_diagnostic.js` deleted
- [ ] `AUDIT_REPORT.md` deleted (if exists)
- [ ] No remaining references to removed fields anywhere in src/
- [ ] **`yarn build` completes with ZERO errors**
