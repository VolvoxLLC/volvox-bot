'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
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
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-primary via-primary/70 to-secondary/80" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-[1.9rem]">
            {Icon && <Icon className="h-5 w-5 text-primary" aria-hidden="true" />}
            <span className="truncate">{title}</span>
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {actions && (
          <div className="dashboard-chip flex shrink-0 items-center gap-2 self-start rounded-xl px-2 py-1 sm:self-start">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
