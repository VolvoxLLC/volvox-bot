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

/** Icon tint classes per category */
const CATEGORY_ICON_ACTIVE: Record<ConfigCategoryId, string> = {
  'ai-automation': 'bg-primary/15 text-primary',
  'onboarding-growth': 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  'moderation-safety': 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  'community-tools': 'bg-secondary/15 text-secondary',
  'support-integrations': 'bg-primary/15 text-primary',
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
          className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm"
          value={activeSlug ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            if (value) {
              router.push(`/dashboard/settings/${value}`);
            } else {
              router.push('/dashboard/settings');
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
        <div className="sticky top-24 space-y-1 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-2">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Categories
          </p>
          {CONFIG_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.icon];
            const isActive = activeSlug === category.id;
            const dirtyCount = dirtyCounts[category.id];
            const iconBg = isActive ? CATEGORY_ICON_ACTIVE[category.id] : 'text-muted-foreground';

            return (
              <Link
                key={category.id}
                href={`/dashboard/settings/${category.id}`}
                className={cn(
                  'flex h-auto w-full items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'sidebar-item-active text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                      iconBg,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="truncate">{category.label}</span>
                </span>
                {dirtyCount > 0 && (
                  <Badge
                    variant="default"
                    className="min-w-5 justify-center bg-yellow-500/90 px-1.5 text-yellow-950 hover:bg-yellow-500"
                  >
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
