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
        'flex flex-col gap-4 rounded-xl border border-border/50 bg-card px-5 py-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight md:text-2xl">
          {Icon && <Icon className="h-5 w-5 text-primary" />}
          <span className="truncate">{title}</span>
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-start">{actions}</div>
      )}
    </header>
  );
}
