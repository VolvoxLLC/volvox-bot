'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
 *
 * @param value - Current search text shown in the input.
 * @param onChange - Callback invoked with the new search text when the input changes or is cleared.
 * @param results - Array of configuration items to display; at most the first eight are shown.
 * @param onSelect - Callback invoked with the selected configuration item when a result row is clicked.
 * @returns The search input and, when there is input, a results panel that shows matching items or a no-match message.
 */
export function ConfigSearch({ value, onChange, results, onSelect }: ConfigSearchProps) {
  const normalizedValue = value.trim();
  const limitedResults = results.slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="config-search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pl-9 pr-9"
          placeholder="Search settings, channels, roles, or features..."
          aria-label="Search settings"
        />
        {normalizedValue.length > 0 && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => onChange('')}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {normalizedValue.length > 0 && (
        <div className="rounded-md border bg-card p-2">
          {limitedResults.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">No matching settings.</p>
          ) : (
            <ul className="space-y-1" aria-label="Search results">
              {limitedResults.map((item) => (
                <li key={item.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start px-2 py-2 text-left"
                    onClick={() => onSelect(item)}
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.description} • {getCategoryById(item.categoryId).label}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
