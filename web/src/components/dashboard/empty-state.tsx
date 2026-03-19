'use client';

import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-card px-6 py-10 text-center',
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
