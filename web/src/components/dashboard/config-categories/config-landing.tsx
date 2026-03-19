'use client';

import { ArrowRight, Bot, MessageSquareWarning, Sparkles, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { CONFIG_CATEGORIES } from '@/components/dashboard/config-workspace/config-categories';
import type { ConfigCategoryIcon } from '@/components/dashboard/config-workspace/types';
import type { ConfigCategoryId } from '@/components/dashboard/config-workspace/types';
import { Badge } from '@/components/ui/badge';

const CATEGORY_ICONS: Record<ConfigCategoryIcon, typeof Sparkles> = {
  sparkles: Sparkles,
  users: Users,
  'message-square-warning': MessageSquareWarning,
  bot: Bot,
  ticket: Ticket,
};

/** Gradient accent per category for the top bar */
const CATEGORY_GRADIENTS: Record<ConfigCategoryId, string> = {
  'ai-automation': 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--neon-cyan)))',
  'onboarding-growth': 'linear-gradient(135deg, hsl(var(--neon-cyan)), hsl(var(--secondary)))',
  'moderation-safety': 'linear-gradient(135deg, hsl(var(--neon-orange)), hsl(var(--destructive)))',
  'community-tools': 'linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--primary)))',
  'support-integrations': 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--neon-orange)))',
};

/** Icon background tint per category */
const CATEGORY_ICON_BG: Record<ConfigCategoryId, string> = {
  'ai-automation': 'bg-primary/12 text-primary',
  'onboarding-growth': 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-400',
  'moderation-safety': 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
  'community-tools': 'bg-secondary/12 text-secondary',
  'support-integrations': 'bg-primary/12 text-primary',
};

/**
 * Landing page content for the config editor.
 * Renders a responsive grid of category cards with dirty count badges.
 */
export function ConfigLandingContent() {
  const { dirtyCategoryCounts, loading } = useConfigContext();

  if (loading) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-gradient-vibrant">Settings</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your bot configuration by category. Each card opens its dedicated settings panel.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-fade-in">
        {CONFIG_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category.icon];
          const dirtyCount = dirtyCategoryCounts[category.id];
          const gradient = CATEGORY_GRADIENTS[category.id];
          const iconBg = CATEGORY_ICON_BG[category.id] ?? 'bg-primary/12 text-primary';

          return (
            <Link key={category.id} href={`/dashboard/settings/${category.id}`} className="group">
              <div
                className="settings-card h-full rounded-2xl p-5"
                style={{ '--card-accent': gradient } as CSSProperties}
              >
                <div className="relative z-10 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    {dirtyCount > 0 && (
                      <Badge
                        variant="default"
                        className="min-w-5 justify-center bg-yellow-500/90 px-1.5 text-yellow-950 hover:bg-yellow-500"
                      >
                        {dirtyCount}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-base font-semibold tracking-tight">{category.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span>Configure</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
