'use client';

import {
  Activity,
  ChevronDown,
  ClipboardList,
  Clock,
  Cog,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  MessagesSquare,
  ScrollText,
  Settings,
  Shield,
  Ticket,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ComponentType, useEffect, useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/** Shared shape for sidebar navigation entries */
interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

const primaryNav: NavItem[] = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Moderation', href: '/dashboard/moderation', icon: Shield },
  { name: 'Members', href: '/dashboard/members', icon: Users },
  { name: 'Tickets', href: '/dashboard/tickets', icon: Ticket },
  { name: 'Bot Config', href: '/dashboard/config', icon: Cog },
];

const secondaryNav: NavItem[] = [
  { name: 'AI Chat', href: '/dashboard/ai', icon: MessageSquare },
  { name: 'Conversations', href: '/dashboard/conversations', icon: MessagesSquare },
  { name: 'Temp Roles', href: '/dashboard/temp-roles', icon: Clock },
  { name: 'Audit Log', href: '/dashboard/audit-log', icon: ClipboardList },
  { name: 'Performance', href: '/dashboard/performance', icon: Activity },
  { name: 'Logs', href: '/dashboard/logs', icon: ScrollText },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface SidebarProps {
  className?: string;
  onNavClick?: () => void;
}

/** Renders a single sidebar navigation link with an active-state indicator pill. */
function renderNavItem(item: NavItem, isActive: boolean, onNavClick?: () => void) {
  return (
    <Link
      key={item.name}
      href={item.href}
      onClick={onNavClick}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
        'hover:bg-muted/75 hover:text-foreground',
        isActive
          ? 'bg-primary/12 text-foreground ring-1 ring-primary/25'
          : 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'absolute left-1.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full transition-colors',
          isActive ? 'bg-primary/90' : 'bg-transparent group-hover:bg-border',
        )}
      />
      <item.icon
        className={cn(
          'h-4 w-4 transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
        )}
      />
      <span>{item.name}</span>
    </Link>
  );
}

export function Sidebar({ className, onNavClick }: SidebarProps) {
  const pathname = usePathname();
  const isNavItemActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
  const hasActiveSecondaryItem = secondaryNav.some((item) => isNavItemActive(item.href));
  const activeSecondaryHref = secondaryNav.find((item) => isNavItemActive(item.href))?.href ?? null;
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(hasActiveSecondaryItem);

  useEffect(() => {
    if (activeSecondaryHref) {
      setIsSecondaryOpen(true);
    }
  }, [activeSecondaryHref]);

  return (
    <div className={cn('dashboard-panel flex h-full flex-col rounded-2xl', className)}>
      <div className="flex-1 px-3 py-4">
        <div className="mb-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
            Command Deck
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Navigate core moderation and ops tools.
          </p>
        </div>

        <nav className="space-y-1">
          {primaryNav.map((item) => renderNavItem(item, isNavItemActive(item.href), onNavClick))}
        </nav>

        <Separator className="my-4 opacity-70" />

        <details
          className="group"
          open={isSecondaryOpen}
          onToggle={(event) => setIsSecondaryOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:bg-muted/60">
            Extensions
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <nav className="mt-2 space-y-1">
            {secondaryNav.map((item) =>
              renderNavItem(item, isNavItemActive(item.href), onNavClick),
            )}
          </nav>
        </details>

        <div className="mt-4 rounded-xl border border-border/60 bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Workflow
          </p>
          <p className="mt-1.5 text-sm font-medium">
            Start with tickets, then moderation, then conversation review.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This sequence helps you clear urgent issues first and keep response quality high.
          </p>
        </div>
      </div>

      <div className="border-t border-border/60 p-3">
        <Link
          href='https://joinvolvox.com/'
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavClick}
          className="dashboard-chip flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          <span>Support and community</span>
        </Link>
      </div>
    </div>
  );
}
