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
  Sparkles,
  Ticket,
  Users,
  Zap,
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
        isActive
          ? 'sidebar-item-active text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {/* Active indicator bar */}
      <span
        className={cn(
          'absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full transition-all duration-200',
          isActive
            ? 'bg-gradient-to-b from-primary to-primary/60 shadow-[0_0_8px_hsl(var(--primary)/0.4)]'
            : 'bg-transparent group-hover:h-4 group-hover:bg-border',
        )}
      />
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200',
          isActive
            ? 'bg-primary/15 text-primary shadow-sm'
            : 'text-muted-foreground group-hover:text-foreground',
        )}
      >
        <item.icon className="h-4 w-4" />
      </span>
      <span className="truncate">{item.name}</span>
      {isActive && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" />
      )}
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
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex-1 px-3 py-4">
        {/* Section label */}
        <div className="mb-3 flex items-center gap-2 px-3">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-gradient-primary">
            Command Deck
          </p>
        </div>

        <nav className="space-y-0.5">
          {primaryNav.map((item) => renderNavItem(item, isNavItemActive(item.href), onNavClick))}
        </nav>

        <Separator className="my-4 opacity-50" />

        <details
          className="group"
          open={isSecondaryOpen}
          onToggle={(event) => setIsSecondaryOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
            <span className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Extensions
            </span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <nav className="mt-2 space-y-0.5">
            {secondaryNav.map((item) =>
              renderNavItem(item, isNavItemActive(item.href), onNavClick),
            )}
          </nav>
        </details>

        {/* Workflow tip card */}
        <div className="mt-5 overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/8 via-background to-secondary/8 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15">
              <Zap className="h-3 w-3 text-primary" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
              Workflow
            </p>
          </div>
          <p className="mt-2 text-sm font-medium leading-snug">
            Tickets → Moderation → Review
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Clear urgent issues first, then moderate, then review conversations.
          </p>
        </div>
      </div>

      <div className="border-t border-border/40 p-3">
        <Link
          href='https://joinvolvox.com/'
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavClick}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          <span>Support & Community</span>
        </Link>
      </div>
    </div>
  );
}
