'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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

// ─── Component ────────────────────────────────────────────────────────────────

interface LogFiltersProps {
  onFilterChange: (filter: LogFilter) => void;
  disabled?: boolean;
}

/**
 * Filter bar for the log viewer.
 *
 * Provides level dropdown, module input, and free-text search.
 * Debounces text inputs and sends consolidated filter to WS server.
 */
export function LogFilters({ onFilterChange, disabled = false }: LogFiltersProps) {
  const [level, setLevel] = useState<LogFilter['level']>('all');
  const [module, setModule] = useState('');
  const [search, setSearch] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFilterChangeRef = useRef(onFilterChange);
  onFilterChangeRef.current = onFilterChange;

  // Build and emit filter, debouncing text fields
  const emitFilter = useCallback(
    (opts: { level: LogFilter['level']; module: string; search: string }) => {
      const filter: LogFilter = {};
      if (opts.level && opts.level !== 'all') filter.level = opts.level as LogLevel;
      if (opts.module.trim()) filter.module = opts.module.trim();
      if (opts.search.trim()) filter.search = opts.search.trim();
      onFilterChangeRef.current(filter);
    },
    [],
  );

  const scheduleEmit = useCallback(
    (opts: { level: LogFilter['level']; module: string; search: string }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => emitFilter(opts), DEBOUNCE_MS);
    },
    [emitFilter],
  );

  // Level change is instant (no debounce)
  const handleLevelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newLevel = e.target.value as LogFilter['level'];
      setLevel(newLevel);
      // Cancel any pending debounce and emit immediately
      if (debounceRef.current) clearTimeout(debounceRef.current);
      emitFilter({ level: newLevel, module, search });
    },
    [emitFilter, module, search],
  );

  const handleModuleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setModule(val);
      scheduleEmit({ level, module: val, search });
    },
    [level, search, scheduleEmit],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearch(val);
      scheduleEmit({ level, module, search: val });
    },
    [level, module, scheduleEmit],
  );

  const handleClear = useCallback(() => {
    setLevel('all');
    setModule('');
    setSearch('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    emitFilter({ level: 'all', module: '', search: '' });
  }, [emitFilter]);

  // Cleanup debounce on unmount
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
    <div className="flex flex-wrap items-center gap-2">
      {/* Level selector */}
      <select
        value={level ?? 'all'}
        onChange={handleLevelChange}
        disabled={disabled}
        aria-label="Filter by log level"
        className={`${inputCls} font-bold uppercase tracking-wider text-[11px] text-muted-foreground/70 cursor-pointer hover:bg-card/60`}
      >
        {LEVEL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value ?? 'all'} className="bg-popover text-foreground">
            {opt.label}
          </option>
        ))}
      </select>

      {/* Module filter */}
      <input
        type="text"
        value={module}
        onChange={handleModuleChange}
        disabled={disabled}
        placeholder="Module..."
        aria-label="Filter by module name"
        className={`${inputCls} w-40`}
      />

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={handleSearchChange}
        disabled={disabled}
        placeholder="Search messages…"
        aria-label="Search log messages"
        className={`${inputCls} w-56`}
      />

      {/* Clear */}
      <Button
        size="sm"
        variant="ghost"
        onClick={handleClear}
        disabled={disabled}
        className="h-9 rounded-xl px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:bg-white/5 hover:text-foreground"
      >
        Reset
      </Button>
    </div>
  );
}
