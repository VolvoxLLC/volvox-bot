'use client';

import { Bot, MessageSquareWarning, Sparkles, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
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
  dirtyCounts: Record<ConfigCategoryId, number>;
}

/**
 * Route-based category navigation for the config editor.
 *
 * Desktop: renders a vertical list of Link elements.
 * Mobile: renders a select that uses router.push() for programmatic navigation.
 *
 * @param dirtyCounts - A record mapping category ids to their unsaved change counts.
 */
export function CategoryNavigation({ dirtyCounts }: CategoryNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();

  const pathSegments = pathname.split('/');
  const activeSlug = pathSegments.length > 3 ? pathSegments[3] : null;

  return (
    <>
      <div className="space-y-2 md:hidden">
        <Label htmlFor="config-category-picker" className="text-xs text-muted-foreground">
          Category
        </Label>
        <select
          id="config-category-picker"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={activeSlug ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            if (value) {
              router.push(`/dashboard/config/${value}`);
            } else {
              router.push('/dashboard/config');
            }
          }}
        >
          <option value="">Overview</option>
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
            const isActive = activeSlug === category.id;
            const dirtyCount = dirtyCounts[category.id];

            return (
              <Link
                key={category.id}
                href={`/dashboard/config/${category.id}`}
                className={cn(
                  'flex h-auto w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{category.label}</span>
                </span>
                {dirtyCount > 0 && (
                  <Badge variant="default" className="min-w-5 justify-center px-1.5">
                    {dirtyCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      </aside>
    </>
  );
}
