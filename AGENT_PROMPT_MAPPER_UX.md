# YieldTracker — Searchable Channel Dropdowns + Save/Export Mapping

Read this entire prompt. Use skills: systematic-debugging, frontend-design, verification-before-completion

## Context

App: `C:\Users\jdp05\PycharmProjects\RSS_Yields\`
App key: `copca.yieldtracker.ui`

The WitsMapperPanel lets the DD map logical channels (nearBitInc, dutyCycle, etc.) to actual WITS field names. There are 135+ channels discovered from raw WITS, so scrolling through a native `<select>` dropdown is painful.

## Feature 1: Searchable Channel Dropdowns

### Problem

The current native `<select>` elements in `WitsMapperPanel.tsx` don't support typing to filter. With 135+ channels, the DD has to scroll through a huge list to find the right one. They might know the channel name (e.g. "rss_continuous") OR the current value (e.g. they see "89.26" on another screen and want to find which channel has that value).

### Solution

Replace each native `<select>` with a custom searchable combobox component. The search should filter by:

1. **Channel name** (field key) — e.g. typing "rss" filters to channels containing "rss"
2. **Current value** — e.g. typing "89" filters to channels whose lastValue contains "89"
3. **Both combined** — the search text matches against `fieldName (value)` so either part works

### Implementation

Create a new component `src/witsMapper/SearchableChannelSelect.tsx`:

```typescript
interface SearchableChannelSelectProps {
  value: string;                    // Currently selected field name
  channels: DiscoveredChannel[];    // Available channels from discovery
  onChange: (fieldName: string) => void;
  isOverridden: boolean;
  placeholder?: string;
}
```

The component should:

1. Show the currently selected channel name + value in a styled input-like display
2. When clicked/focused, open a dropdown with a text input at the top for searching
3. As the user types, filter the channel list by matching against BOTH the field name AND the stringified value
4. Group results into "Active Channels" (hasData=true) and "Inactive Channels" (hasData=false) — same as the current `<optgroup>` structure
5. Each option shows: `field_name (value)` with the field name in normal weight and value in a muted color
6. Highlight the matching portion of the text (bold the matched substring)
7. Clicking an option selects it and closes the dropdown
8. Pressing Escape or clicking outside closes the dropdown
9. If the current value isn't in the discovered list, show it as a warning option at the top: `⚠ field_name (not found on well)`
10. Include a "— not mapped —" option at the top to clear the selection

### Styling

The searchable dropdown should match the existing dark theme:
- Input/trigger: same as `.channelSelect` styles — dark background (#2a2a2a), monospace font, border
- Dropdown panel: position absolute below the trigger, dark background (#1e1e1e), border, max-height with scroll, z-index above other content
- Search input at top of dropdown: subtle border-bottom, placeholder "Search channels..."
- Options: padding 6px 10px, hover highlight (#333), selected highlight (#2a4a6a)
- Group headers: uppercase, muted, small font — same as `.sectionTitle`
- Match highlighting: bold the matched portion of text, or use a subtle highlight background

### No external dependencies

Do NOT use react-select, downshift, or any external library. Build it with plain React + CSS modules. The app runs in a Corva iframe and external deps add bundle size. A simple filtered list with keyboard support is sufficient.

### Keyboard support (nice to have, not required for MVP)

- Arrow keys to navigate options
- Enter to select
- Escape to close

### Replace in WitsMapperPanel.tsx

In the `renderChannelRow` function, replace the `<select>` element with `<SearchableChannelSelect>`:

```tsx
// Before:
<select className={...} value={currentValue} onChange={...}>
  <option>...</option>
  <optgroup>...</optgroup>
</select>

// After:
<SearchableChannelSelect
  value={currentValue}
  channels={availableChannels}
  onChange={(val) => handleChannelChange(key, val)}
  isOverridden={!!overridden}
  placeholder={baseValue || '(not configured)'}
/>
```

Keep the text input fallback when `availableChannels.length === 0` (channels not discovered yet).

## Feature 2: Save Channel Mapping Per User

### Problem

The DD configures 7-11 channel mappings, then refreshes the page and loses them all. They need to reconfigure every time.

### Solution

Save the complete mapping (profile ID + overrides) to localStorage, keyed by a user-identifiable key. Since Corva provides `currentUser` in the app props, use the user's company_id + a label.

### Storage structure

```typescript
interface SavedMapping {
  id: string;              // UUID
  name: string;            // User-given name, e.g. "Nabors X04 iCruise" or "Helmerich 401 PowerDrive"
  profileId: string;       // e.g. 'icruise'
  overrides: Record<string, string>;  // Channel overrides
  createdAt: number;       // timestamp
  updatedAt: number;       // timestamp
}

// localStorage key: 'yieldtracker_saved_mappings'
// Value: JSON array of SavedMapping objects
```

### UI in WitsMapperPanel

Add a row below the profile selector with:

1. **Save button** — saves the current profile + overrides as a named mapping
   - First save: prompts for a name (e.g. `window.prompt('Name this mapping:', 'Nabors X04 iCruise')`)
   - Subsequent saves with the same name: updates the existing entry silently
   
2. **Load dropdown** — shows saved mappings by name, selecting one loads its profile + overrides
   ```tsx
   <select onChange={handleLoadMapping}>
     <option value="">Load saved mapping...</option>
     {savedMappings.map(m => (
       <option key={m.id} value={m.id}>{m.name} ({new Date(m.updatedAt).toLocaleDateString()})</option>
     ))}
   </select>
   ```

3. **Delete button** — removes the currently loaded mapping from localStorage (with confirm)

### Implementation

```typescript
// In WitsMapperPanel.tsx or a new hook useSavedMappings.ts

const STORAGE_KEY = 'yieldtracker_saved_mappings';

function loadSavedMappings(): SavedMapping[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMappingToStorage(mappings: SavedMapping[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch { /* quota */ }
}
```

## Feature 3: Export Mapping

### Problem

The DD maps channels for a rig, then moves to a different computer/browser and has to redo it. They need to export the mapping and import it elsewhere.

### Solution

Export the current mapping as a JSON file that can be downloaded and shared. Import allows loading a JSON file to restore the mapping.

### Export button

Add an "Export" button next to the Save button:

```tsx
<button onClick={handleExport}>📤 Export</button>
```

```typescript
const handleExport = () => {
  const mapping: SavedMapping = {
    id: uuid(),
    name: currentMappingName || `${profile.vendorName} mapping`,
    profileId: activeProfileId,
    overrides: customOverrides,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  const blob = new Blob([JSON.stringify(mapping, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wits-mapping-${mapping.name.replace(/\s+/g, '-').toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

### Import button

Add an "Import" button:

```tsx
<button onClick={() => importRef.current?.click()}>📥 Import</button>
<input
  ref={importRef}
  type="file"
  accept=".json"
  style={{ display: 'none' }}
  onChange={handleImport}
/>
```

```typescript
const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const mapping = JSON.parse(reader.result as string) as SavedMapping;
      if (mapping.profileId && mapping.overrides) {
        onProfileChange(mapping.profileId);
        onOverrideChange(mapping.overrides);
        log(`Imported mapping: ${mapping.name}`);
      }
    } catch {
      alert('Invalid mapping file');
    }
  };
  reader.readAsText(file);
  
  // Reset the file input so the same file can be re-imported
  e.target.value = '';
};
```

## Files to Modify / Create

| File | Action |
|------|--------|
| `src/witsMapper/SearchableChannelSelect.tsx` | CREATE — searchable combobox component |
| `src/witsMapper/SearchableChannelSelect.module.css` | CREATE — styles for the searchable dropdown |
| `src/witsMapper/WitsMapperPanel.tsx` | MODIFY — replace `<select>` with `<SearchableChannelSelect>`, add Save/Load/Export/Import UI |
| `src/witsMapper/WitsMapperPanel.module.css` | MODIFY — add styles for save/load/export/import row |
| `src/witsMapper/index.ts` | UPDATE — export new component if needed |

## What NOT to change

- `src/witsMapper/types.ts` — channel types are correct
- `src/witsMapper/channelProfiles.ts` — profiles are correct
- `src/api/corvaApi.ts` — channel discovery is correct
- `src/effects/useReadings.ts` — reading logic is correct
- Any other files outside the witsMapper module

## Build Verification

Run `yarn build` after all changes. Fix all errors before considering done.

## Definition of Done

- [ ] `SearchableChannelSelect` component created — no external deps
- [ ] Typing in the search filters by channel name AND by value
- [ ] Channels grouped into Active / Inactive sections
- [ ] Each option shows field name + current value
- [ ] Clicking outside or pressing Escape closes the dropdown
- [ ] Overridden channels show orange border (existing behavior preserved)
- [ ] Status dot still shows active/inactive state
- [ ] Save mapping: prompts for name, stores to localStorage
- [ ] Load mapping: dropdown shows saved mappings, selecting one restores profile + overrides
- [ ] Delete mapping: removes from localStorage with confirmation
- [ ] Export mapping: downloads a .json file with the current profile + overrides
- [ ] Import mapping: file picker loads a .json and applies profile + overrides
- [ ] All existing WitsMapperPanel functionality still works (profile selector, detect channels, override tracking)
- [ ] **`yarn build` completes with ZERO errors**
