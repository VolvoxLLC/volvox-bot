'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'dashboard-panel relative overflow-hidden rounded-2xl px-5 py-5 sm:px-6 sm:py-6',
        className,
      )}
    >
      {/* Accent gradient bar */}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-primary/60 to-secondary/70" />

      {/* Subtle background shimmer */}
      <span className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight md:text-[1.9rem]">
            {Icon && (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
            )}
            <span className="truncate">{title}</span>
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm px-2.5 py-1.5 sm:self-start">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
