'use client';

import { ArrowRight, Bot, MessageSquareWarning, Sparkles, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import { useConfigContext } from '@/components/dashboard/config-context';
import { CONFIG_CATEGORIES } from '@/components/dashboard/config-workspace/config-categories';
import type {
  ConfigCategoryIcon,
  ConfigCategoryId,
} from '@/components/dashboard/config-workspace/types';
import { cn } from '@/lib/utils';

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
    <div className="space-y-8 py-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-px w-8 bg-primary/40" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
            Overview
          </span>
        </div>
        <h1 className="text-4xl font-black tracking-tight text-white/90">
          Server <span className="text-primary/80">Settings</span>
        </h1>
        <p className="text-sm font-medium text-zinc-500 max-w-lg leading-relaxed">
          Select a category below to configure your server's specialized features. Use the search
          bar above for quick navigation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 stagger-fade-in">
        {CONFIG_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category.icon];
          const dirtyCount = dirtyCategoryCounts[category.id];
          const gradient = CATEGORY_GRADIENTS[category.id];
          const iconBg = CATEGORY_ICON_BG[category.id];

          return (
            <Link
              key={category.id}
              href={`/dashboard/settings/${category.id}`}
              className="group relative"
            >
              <div className="absolute -inset-[1px] rounded-[32px] bg-gradient-to-br from-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none" />
              <div className="relative h-full overflow-hidden rounded-[31px] border border-white/5 bg-white/[0.02] p-6 shadow-2xl backdrop-blur-md transition-all duration-300 group-hover:bg-white/[0.04] group-hover:translate-y-[-2px]">
                <div
                  className="absolute top-0 right-0 w-24 h-24 blur-3xl opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none"
                  style={{ background: gradient }}
                />

                <div className="relative z-10 flex flex-col h-full gap-4">
                  <div className="flex items-start justify-between">
                    <div
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-2xl border border-white/5 shadow-inner transition-transform group-hover:scale-110 duration-500',
                        iconBg,
                      )}
                    >
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    {dirtyCount > 0 && (
                      <div className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-primary/20 border border-primary/30 px-2 text-[10px] font-black text-primary shadow-lg shadow-primary/10">
                        {dirtyCount}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 flex-grow">
                    <h3 className="text-lg font-black tracking-tight text-white/90 group-hover:text-primary transition-colors">
                      {category.label}
                    </h3>
                    <p className="text-xs font-medium leading-relaxed text-zinc-500 line-clamp-2">
                      {category.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary/0 transition-all duration-300 group-hover:text-primary/100 group-hover:translate-x-1">
                    <span>Configure Feature</span>
                    <ArrowRight className="h-3 w-3" />
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
