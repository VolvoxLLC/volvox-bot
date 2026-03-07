'use client';

import { Bot, MessageSquareWarning, Sparkles, Ticket, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CONFIG_CATEGORIES } from './config-categories';
import type { ConfigCategoryIcon, ConfigCategoryId } from './types';

const CATEGORY_ICONS: Record<ConfigCategoryIcon, typeof Sparkles> = {
  sparkles: Sparkles,
  users: Users,
  'message-square-warning': MessageSquareWarning,
  bot: Bot,
  ticket: Ticket,
};

interface CategoryNavigationProps {
  activeCategoryId: ConfigCategoryId;
  dirtyCounts: Record<ConfigCategoryId, number>;
  onCategoryChange: (categoryId: ConfigCategoryId) => void;
}

export function CategoryNavigation({
  activeCategoryId,
  dirtyCounts,
  onCategoryChange,
}: CategoryNavigationProps) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        <Label htmlFor="config-category-picker" className="text-xs text-muted-foreground">
          Category
        </Label>
        <select
          id="config-category-picker"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={activeCategoryId}
          onChange={(event) => onCategoryChange(event.target.value as ConfigCategoryId)}
        >
          {CONFIG_CATEGORIES.map((category) => {
            const dirtyCount = dirtyCounts[category.id];
            const dirtyLabel = dirtyCount > 0 ? ` (${dirtyCount})` : '';
            return (
              <option key={category.id} value={category.id}>
                {category.label}
                {dirtyLabel}
              </option>
            );
          })}
        </select>
      </div>

      <aside className="hidden md:block">
        <div className="sticky top-24 space-y-2 rounded-lg border bg-card p-3">
          {CONFIG_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.icon];
            const isActive = activeCategoryId === category.id;
            const dirtyCount = dirtyCounts[category.id];

            return (
              <Button
                key={category.id}
                variant={isActive ? 'secondary' : 'ghost'}
                className="h-auto w-full justify-between px-3 py-2 text-left"
                onClick={() => onCategoryChange(category.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm">{category.label}</span>
                </span>
                {dirtyCount > 0 && (
                  <Badge variant="default" className="min-w-5 justify-center px-1.5">
                    {dirtyCount}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
