'use client';

import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared dashboard card wrapper.
 *
 * Extracted from analytics-dashboard, analytics-dashboard-sections,
 * and performance-dashboard to reduce SonarCloud duplication.
 *
 * Base style matches the most common pattern:
 *   group relative overflow-hidden rounded-2xl border border-border/40
 *   bg-muted/20 p-6 backdrop-blur-xl
 *
 * Additional utility classes (e.g. `xl:col-span-6`, `mb-8`) can be
 * passed via the `className` prop.
 */
export function DashboardCard({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** Optional HTML element (e.g. `'section'`) */
  as?: ElementType;
}) {
  return (
    <Tag
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border/40' +
          ' bg-muted/20 p-6 backdrop-blur-xl',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
