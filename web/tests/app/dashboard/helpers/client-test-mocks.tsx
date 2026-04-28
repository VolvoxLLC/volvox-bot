import { Inbox, type LucideIcon } from 'lucide-react';

/**
 * Renders a simple empty-state container with a heading and an optional description.
 * Mirrors the production EmptyState prop surface closely enough for dashboard client tests.
 */
export function MockEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className} data-testid="empty-state">
      <Icon aria-hidden="true" data-testid="empty-state-icon" />
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
