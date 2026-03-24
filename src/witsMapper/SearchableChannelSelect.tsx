import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { DiscoveredChannel } from '../api/corvaApi';
import styles from './SearchableChannelSelect.module.css';

interface SearchableChannelSelectProps {
  value: string;
  channels: DiscoveredChannel[];
  onChange: (fieldName: string) => void;
  isOverridden: boolean;
  placeholder?: string;
}

function formatValue(v: number | string | null): string {
  if (v == null) return '';
  if (typeof v === 'number') return v.toFixed(2);
  return String(v);
}

/** Render text with the matched substring bolded */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className={styles.matchHighlight}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export const SearchableChannelSelect: React.FC<SearchableChannelSelectProps> = ({
  value,
  channels,
  onChange,
  isOverridden,
  placeholder = '(not configured)',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setSearch('');
      setHighlightIdx(-1);
      // Defer to let the DOM render first
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  // Build searchable text for each channel: "field_name (value)"
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return channels;
    return channels.filter((ch) => {
      const valStr = formatValue(ch.lastValue);
      const combined = `${ch.field} ${valStr}`.toLowerCase();
      return combined.includes(q);
    });
  }, [channels, search]);

  const activeFiltered = useMemo(() => filtered.filter((ch) => ch.hasData), [filtered]);
  const inactiveFiltered = useMemo(() => filtered.filter((ch) => !ch.hasData), [filtered]);

  // Build a flat list of selectable items for keyboard nav
  const flatItems = useMemo(() => {
    const items: { field: string; type: 'clear' | 'warning' | 'channel' }[] = [];
    items.push({ field: '', type: 'clear' });
    if (value && !channels.some((ch) => ch.field === value)) {
      items.push({ field: value, type: 'warning' });
    }
    for (const ch of activeFiltered) items.push({ field: ch.field, type: 'channel' });
    for (const ch of inactiveFiltered) items.push({ field: ch.field, type: 'channel' });
    return items;
  }, [activeFiltered, inactiveFiltered, value, channels]);

  const handleSelect = useCallback((fieldName: string) => {
    onChange(fieldName);
    setOpen(false);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < flatItems.length) {
      e.preventDefault();
      handleSelect(flatItems[highlightIdx].field);
    }
  }, [flatItems, highlightIdx, handleSelect]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  // Current channel info for display
  const currentChannel = channels.find((ch) => ch.field === value);
  const currentInList = !!currentChannel;

  const triggerClass = [
    styles.trigger,
    isOverridden ? styles.triggerOverridden : '',
    open ? styles.triggerOpen : '',
  ].filter(Boolean).join(' ');

  let itemIdx = 0;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      {/* Trigger */}
      <div className={triggerClass} onClick={() => setOpen(!open)}>
        {value ? (
          <>
            <span className={styles.triggerText}>
              {!currentInList && '\u26A0 '}{value}
            </span>
            {currentChannel?.lastValue != null && (
              <span className={styles.triggerValue}>({formatValue(currentChannel.lastValue)})</span>
            )}
          </>
        ) : (
          <span className={`${styles.triggerText} ${styles.triggerPlaceholder}`}>{placeholder}</span>
        )}
        <span className={styles.triggerArrow}>{open ? '\u25B2' : '\u25BC'}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div className={styles.dropdown} onKeyDown={handleKeyDown}>
          <input
            ref={searchRef}
            className={styles.searchInput}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlightIdx(-1); }}
            placeholder="Search channels..."
            onKeyDown={handleKeyDown}
          />
          <div className={styles.optionsList} ref={listRef}>
            {/* Clear option */}
            <div
              className={`${styles.option} ${styles.optionClear} ${highlightIdx === 0 ? styles.optionHighlighted : ''} ${!value ? styles.optionSelected : ''}`}
              data-idx={0}
              onClick={() => handleSelect('')}
            >
              — not mapped —
            </div>

            {/* Warning: current value not found */}
            {value && !currentInList && (
              <div
                className={`${styles.option} ${styles.optionWarning} ${highlightIdx === 1 ? styles.optionHighlighted : ''}`}
                data-idx={1}
                onClick={() => handleSelect(value)}
              >
                {'\u26A0'} {value} (not found on well)
              </div>
            )}

            {/* Active channels */}
            {activeFiltered.length > 0 && (
              <>
                <div className={styles.groupHeader}>Active Channels ({activeFiltered.length})</div>
                {activeFiltered.map((ch) => {
                  // Offset: 1 for clear + (1 for warning if present)
                  const idx = 1 + (value && !currentInList ? 1 : 0) + itemIdx;
                  itemIdx++;
                  const isSelected = ch.field === value;
                  return (
                    <div
                      key={ch.field}
                      className={`${styles.option} ${isSelected ? styles.optionSelected : ''} ${highlightIdx === idx ? styles.optionHighlighted : ''}`}
                      data-idx={idx}
                      onClick={() => handleSelect(ch.field)}
                    >
                      <span className={styles.optionField}>
                        <HighlightMatch text={ch.field} query={search} />
                      </span>
                      {ch.lastValue != null && (
                        <span className={styles.optionValue}>
                          (<HighlightMatch text={formatValue(ch.lastValue)} query={search} />)
                        </span>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* Inactive channels */}
            {inactiveFiltered.length > 0 && (
              <>
                <div className={styles.groupHeader}>Inactive ({inactiveFiltered.length})</div>
                {inactiveFiltered.map((ch) => {
                  const idx = 1 + (value && !currentInList ? 1 : 0) + itemIdx;
                  itemIdx++;
                  const isSelected = ch.field === value;
                  return (
                    <div
                      key={ch.field}
                      className={`${styles.option} ${isSelected ? styles.optionSelected : ''} ${highlightIdx === idx ? styles.optionHighlighted : ''}`}
                      data-idx={idx}
                      onClick={() => handleSelect(ch.field)}
                    >
                      <span className={styles.optionField}>
                        <HighlightMatch text={ch.field} query={search} />
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {/* No results */}
            {activeFiltered.length === 0 && inactiveFiltered.length === 0 && search && (
              <div className={styles.noResults}>No channels matching "{search}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
