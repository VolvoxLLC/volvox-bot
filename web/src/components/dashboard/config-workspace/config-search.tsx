'use client';

import { Search, Settings2, X } from 'lucide-react';
import { inputClasses } from '@/components/dashboard/config-editor-utils';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCategoryById } from './config-categories';
import type { ConfigSearchItem } from './types';

interface ConfigSearchProps {
  value: string;
  onChange: (value: string) => void;
  results: ConfigSearchItem[];
  onSelect: (item: ConfigSearchItem) => void;
}

/**
 * Render a searchable UI for configuration items with inline clear and selectable results.
 */
export function ConfigSearch({ value, onChange, results, onSelect }: ConfigSearchProps) {
  const normalizedValue = value.trim();
  const limitedResults = results.slice(0, 8);

  return (
    <div className="relative group/search space-y-2">
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none z-10">
          <Search
            className="h-4 w-4 text-muted-foreground/60 group-focus-within/search:text-primary transition-colors duration-300"
            aria-hidden="true"
          />
          <div className="h-3 w-[1px] bg-border/50" />
        </div>
        <input
          id="config-search"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            inputClasses,
            'h-12 pl-12 pr-10 rounded-2xl bg-muted/20 dark:bg-black/40 border-border dark:border-white/[0.03] text-foreground dark:text-zinc-200 placeholder:text-muted-foreground/50 focus:bg-muted/30 dark:focus:bg-black/60',
          )}
          placeholder="Search settings, channels, or features..."
          aria-label="Search settings"
        />
        {normalizedValue.length > 0 && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full bg-muted/50 dark:bg-white/5 hover:bg-muted/80 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all duration-200"
            onClick={() => onChange('')}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {normalizedValue.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-3xl border border-border bg-popover/90 dark:bg-black/60 backdrop-blur-3xl shadow-2xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="p-2">
            {limitedResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <div className="size-10 rounded-2xl bg-muted/20 dark:bg-white/[0.02] border border-border/50 dark:border-white/[0.05] flex items-center justify-center mb-3 text-muted-foreground/40">
                  <Search className="size-5" />
                </div>
                <p className="text-sm font-bold text-muted-foreground">No results found</p>
                <p className="text-xs text-muted-foreground/40 mt-1">
                  Try searching for something else
                </p>
              </div>
            ) : (
              <ul className="space-y-1" aria-label="Search results">
                {limitedResults.map((item) => (
                  <li key={`${item.categoryId}-${item.id}`}>
                    <button
                      type="button"
                      className="group/item flex items-center gap-3 w-full p-3 text-left rounded-2xl hover:bg-muted/50 dark:hover:bg-white/[0.05] border border-transparent hover:border-border dark:hover:border-white/[0.05] transition-all duration-200"
                      onClick={() => onSelect(item)}
                    >
                      <div className="size-9 shrink-0 rounded-xl bg-muted/50 dark:bg-gradient-to-br dark:from-zinc-800 dark:to-zinc-900 border border-border dark:border-white/10 flex items-center justify-center shadow-md group-hover/item:scale-105 transition-transform">
                        <Settings2 className="size-4 text-muted-foreground/60 group-hover/item:text-primary transition-colors" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-foreground/90 dark:text-zinc-200 truncate group-hover/item:text-primary transition-colors">
                          {item.label}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20">
                            {getCategoryById(item.categoryId).label}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {item.description}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
