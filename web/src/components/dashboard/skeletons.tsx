import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for a stat/KPI card used in overview and moderation dashboards.
 */
export function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-20" />
        <Skeleton className="mt-1 h-3 w-32" />
      </CardContent>
    </Card>
  );
}

/**
 * Grid of stat card skeletons.
 *
 * @param count - Number of skeleton cards to render (default 4).
 */
export function StatCardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable identity
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for a page section with a heading and content area.
 */
export function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-32" />
      <div className="rounded-md border p-4">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable identity
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for the filter/search bar that appears on most dashboard pages.
 */
export function FilterBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Skeleton className="h-9 w-full max-w-sm" />
      <Skeleton className="h-9 w-[180px]" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

/**
 * Generic table skeleton with configurable rows and columns.
 *
 * @param rows - Number of skeleton rows (default 6).
 * @param columns - Number of columns per row (default 5).
 */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-md border">
      <div className="border-b px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: columns }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable identity
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable identity
          <div key={i} className="flex items-center gap-6 px-4 py-3">
            {Array.from({ length: columns }).map((_, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable identity
              <Skeleton key={j} className="h-4 w-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Full-page loading skeleton combining header, filter bar, and table.
 * Matches the common dashboard page layout.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <FilterBarSkeleton />
      <TableSkeleton />
    </div>
  );
}

/**
 * Chart placeholder skeleton for performance and analytics pages.
 */
export function ChartSkeleton({ height = 250 }: { height?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-72" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded" style={{ height }} />
      </CardContent>
    </Card>
  );
}
