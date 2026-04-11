'use client';

import { Bot, MessageSquareWarning, Sparkles, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const SETTINGS_TABS = [
  { id: 'ai-automation', label: 'AI & Automation', icon: Sparkles },
  { id: 'onboarding-growth', label: 'Onboarding & Growth', icon: Users },
  { id: 'moderation-safety', label: 'Moderation & Safety', icon: MessageSquareWarning },
  { id: 'community-tools', label: 'Community Tools', icon: Bot },
  { id: 'support-integrations', label: 'Support & Integrations', icon: Ticket },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  const isSettingsDashboard = pathname.startsWith('/dashboard/settings');

  if (!isSettingsDashboard) return null;

  const activeSettingsSlug = pathname.split('/dashboard/settings/')[1]?.split('/')[0] ?? null;

  return (
    <div className="mb-6 flex justify-center sticky top-0 z-30 pt-2">
      <nav
        className="flex items-center gap-1 rounded-[24px] border border-border/40 bg-background/60 p-1 backdrop-blur-3xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] transition-all duration-300 hover:border-border/60"
        aria-label="Settings categories"
      >
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSettingsSlug === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/dashboard/settings/${tab.id}`}
              className={cn(
                'relative flex h-9 items-center justify-center gap-2 rounded-full px-4 text-[11px] font-bold uppercase tracking-widest transition-all duration-500 select-none shrink-0 outline-none',
                isActive
                  ? 'bg-primary/10 text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border border-primary/20 z-10'
                  : 'border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30 z-0',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                className={cn(
                  'h-3.5 w-3.5 transition-colors duration-500',
                  isActive
                    ? 'text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]'
                    : 'opacity-60',
                )}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
