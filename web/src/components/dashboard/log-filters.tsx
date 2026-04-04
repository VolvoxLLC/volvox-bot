'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChannelSelector } from '@/components/ui/channel-selector';
import type { LogFilter, LogLevel } from '@/lib/log-ws';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS: Array<{ value: LogFilter['level']; label: string }> = [
  { value: 'all', label: 'All levels' },
  { value: 'error', label: '🔴 Error' },
  { value: 'warn', label: '🟡 Warn' },
  { value: 'info', label: '🔵 Info' },
  { value: 'debug', label: '⚫ Debug' },
];

const DEBOUNCE_MS = 300;

interface FilterState {
  level: LogFilter['level'];
  module: string;
  search: string;
  channelIds: string[];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LogFiltersProps {
  guildId: string | null;
  onFilterChange: (filter: LogFilter) => void;
  disabled?: boolean;
}

/**
 * Filter bar for the log viewer that manages and emits consolidated log filters.
 *
 * Manages local UI state for log level, module name, free-text search, and selected channel IDs.
 * Shows a guild-scoped ChannelSelector when `guildId` is provided. Debounces changes from text
 * inputs (`module`, `search`) before invoking `onFilterChange`; changes to level or channel
 * selection are forwarded immediately. When `guildId` changes the channel selection is cleared
 * and a filter without channel constraints is emitted.
 *
 * @param guildId - Guild identifier used to scope channel selection; when `null` the channel selector is hidden
 * @param onFilterChange - Callback invoked with a consolidated `LogFilter` object reflecting current UI state
 * @param disabled - When true, disables all controls in the filter bar
 * @returns The rendered filter bar JSX element
 */
export function LogFilters({ guildId, onFilterChange, disabled = false }: LogFiltersProps) {
  const [level, setLevel] = useState<LogFilter['level']>('all');
  const [module, setModule] = useState('');
  const [search, setSearch] = useState('');
  const [channelIds, setChannelIds] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFilterChangeRef = useRef(onFilterChange);
  const filterStateRef = useRef<FilterState>({
    level: 'all',
    module: '',
    search: '',
    channelIds: [],
  });
  onFilterChangeRef.current = onFilterChange;
  filterStateRef.current = { level, module, search, channelIds };

  const emitFilter = useCallback(
    (opts: FilterState) => {
      const filter: LogFilter = {};
      if (guildId) filter.guildId = guildId;
      if (opts.channelIds.length > 0) filter.channelIds = opts.channelIds;
      if (opts.level && opts.level !== 'all') filter.level = opts.level as LogLevel;
      if (opts.module.trim()) filter.module = opts.module.trim();
      if (opts.search.trim()) filter.search = opts.search.trim();
      onFilterChangeRef.current(filter);
    },
    [guildId],
  );

  const scheduleEmit = useCallback(
    (opts: FilterState) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => emitFilter(opts), DEBOUNCE_MS);
    },
    [emitFilter],
  );

  const handleLevelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newLevel = e.target.value as LogFilter['level'];
      setLevel(newLevel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      emitFilter({ level: newLevel, module, search, channelIds });
    },
    [channelIds, emitFilter, module, search],
  );

  const handleModuleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setModule(val);
      scheduleEmit({ level, module: val, search, channelIds });
    },
    [channelIds, level, scheduleEmit, search],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearch(val);
      scheduleEmit({ level, module, search: val, channelIds });
    },
    [channelIds, level, module, scheduleEmit],
  );

  const handleChannelChange = useCallback(
    (nextChannelIds: string[]) => {
      setChannelIds(nextChannelIds);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      emitFilter({ level, module, search, channelIds: nextChannelIds });
    },
    [emitFilter, level, module, search],
  );

  const handleClear = useCallback(() => {
    setLevel('all');
    setModule('');
    setSearch('');
    setChannelIds([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    emitFilter({ level: 'all', module: '', search: '', channelIds: [] });
  }, [emitFilter]);

  useEffect(() => {
    const {
      level: currentLevel,
      module: currentModule,
      search: currentSearch,
    } = filterStateRef.current;
    setChannelIds([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    emitFilter({
      level: currentLevel,
      module: currentModule,
      search: currentSearch,
      channelIds: [],
    });
  }, [guildId, emitFilter]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const inputCls =
    'h-9 rounded-xl border border-border/40 bg-card/40 px-3 text-sm text-foreground' +
    ' placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20' +
    ' backdrop-blur-sm transition-all disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <select
        value={level ?? 'all'}
        onChange={handleLevelChange}
        disabled={disabled}
        aria-label="Filter by log level"
        className={[
          inputCls,
          'font-bold uppercase tracking-wider text-[11px]',
          'text-muted-foreground/70 cursor-pointer hover:bg-card/60',
        ].join(' ')}
      >
        {LEVEL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value ?? 'all'} className="bg-popover text-foreground">
            {opt.label}
          </option>
        ))}
      </select>

      {guildId && (
        <div className="min-w-[16rem] max-w-sm flex-1">
          <ChannelSelector
            guildId={guildId}
            selected={channelIds}
            onChange={handleChannelChange}
            disabled={disabled}
            placeholder="All channels"
          />
        </div>
      )}

      <input
        type="text"
        value={module}
        onChange={handleModuleChange}
        disabled={disabled}
        placeholder="Module..."
        aria-label="Filter by module name"
        className={`${inputCls} w-40`}
      />

      <input
        type="text"
        value={search}
        onChange={handleSearchChange}
        disabled={disabled}
        placeholder="Search messages…"
        aria-label="Search log messages"
        className={`${inputCls} w-56`}
      />

      <Button
        size="sm"
        variant="ghost"
        onClick={handleClear}
        disabled={disabled}
        className={[
          'h-9 rounded-xl px-4 text-[11px] font-bold uppercase tracking-widest',
          'text-muted-foreground/50 hover:bg-white/5 hover:text-foreground',
        ].join(' ')}
      >
        Reset
      </Button>
    </div>
  );
}
