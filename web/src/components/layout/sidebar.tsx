'use client';

import {
  Activity,
  Bot,
  ChevronDown,
  ClipboardList,
  Clock,
  Cog,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  MessagesSquare,
  ScrollText,
  Shield,
  Ticket,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const primaryNav = [
  {
    name: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Moderation',
    href: '/dashboard/moderation',
    icon: Shield,
  },
  {
    name: 'Members',
    href: '/dashboard/members',
    icon: Users,
  },
  {
    name: 'Tickets',
    href: '/dashboard/tickets',
    icon: Ticket,
  },
  {
    name: 'Bot Config',
    href: '/dashboard/config',
    icon: Cog,
  },
];

const secondaryNav = [
  {
    name: 'AI Chat',
    href: '/dashboard/ai',
    icon: MessageSquare,
  },
  {
    name: 'Conversations',
    href: '/dashboard/conversations',
    icon: MessagesSquare,
  },
  {
    name: 'Temp Roles',
    href: '/dashboard/temp-roles',
    icon: Clock,
  },
  {
    name: 'Audit Log',
    href: '/dashboard/audit-log',
    icon: ClipboardList,
  },
  {
    name: 'Performance',
    href: '/dashboard/performance',
    icon: Activity,
  },
  {
    name: 'Logs',
    href: '/dashboard/logs',
    icon: ScrollText,
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    icon: Bot,
  },
];

interface SidebarProps {
  className?: string;
  onNavClick?: () => void;
}

export function Sidebar({ className, onNavClick }: SidebarProps) {
  const pathname = usePathname();
  const isNavItemActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
  const hasActiveSecondaryItem = secondaryNav.some((item) => isNavItemActive(item.href));

  return (
    <div
      className={cn('flex h-full flex-col rounded-2xl border border-border/50 bg-card', className)}
    >
      <div className="flex-1 px-3 py-4">
        <div className="mb-3 px-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Main
          </h2>
        </div>

        <nav className="space-y-1">
          {primaryNav.map((item) => {
            const isActive = isNavItemActive(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavClick}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  'hover:bg-muted/75 hover:text-foreground',
                  isActive
                    ? 'bg-primary/12 text-foreground ring-1 ring-primary/30 shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                <item.icon
                  className={cn(
                    'h-4 w-4 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <Separator className="my-4" />

        <details className="group" open={hasActiveSecondaryItem}>
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:bg-muted/60">
            More tools
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <nav className="mt-2 space-y-1">
            {secondaryNav.map((item) => {
              const isActive = isNavItemActive(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onNavClick}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    'hover:bg-muted/75 hover:text-foreground',
                    isActive
                      ? 'bg-primary/12 text-foreground ring-1 ring-primary/30 shadow-sm'
                      : 'text-muted-foreground',
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-4 w-4 transition-colors',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </details>
      </div>

      <div className="border-t border-border/60 p-3">
        <Link
          href="https://joinvolvox.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          <span>Support and community</span>
        </Link>
      </div>
    </div>
  );
}
