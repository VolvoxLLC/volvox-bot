'use client';

import {
  Activity,
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
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { cn } from '@/lib/utils';
import { ServerSelector } from './server-selector';

/** Shared shape for sidebar navigation entries */
interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

const navGroups = [
  {
    label: 'Core Controls',
    icon: LayoutDashboard,
    items: [
      { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Moderation', href: '/dashboard/moderation', icon: Shield },
      { name: 'Members', href: '/dashboard/members', icon: Users },
      { name: 'Tickets', href: '/dashboard/tickets', icon: Ticket },
      { name: 'Bot Config', href: '/dashboard/config', icon: Cog },
    ],
  },
  {
    label: 'Intelligence',
    icon: Sparkles,
    items: [
      { name: 'AI Chat', href: '/dashboard/ai', icon: MessageSquare },
      { name: 'Conversations', href: '/dashboard/conversations', icon: MessagesSquare },
    ],
  },
  {
    label: 'System Ops',
    icon: Activity,
    items: [
      { name: 'Temp Roles', href: '/dashboard/temp-roles', icon: Clock },
      { name: 'Audit Log', href: '/dashboard/audit-log', icon: ClipboardList },
      { name: 'Performance', href: '/dashboard/performance', icon: Activity },
      { name: 'Logs', href: '/dashboard/logs', icon: ScrollText },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
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
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-[16px] px-2 py-2 transition-all duration-300',
        isActive
          ? 'bg-primary/10 hover:bg-primary/20 text-primary shadow-[inset_0_1px_2px_hsl(var(--foreground)/0.1),inset_0_0_0_1px_hsl(var(--primary)/0.15)] ring-1 ring-primary/5'
          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.05)]',
      )}
    >
      <div
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300',
          isActive
            ? 'bg-primary/20 text-primary shadow-[0_4px_12px_hsl(var(--primary)/0.25)] ring-1 ring-primary/30'
            : 'bg-muted/30 ring-1 ring-border group-hover:bg-muted/50 group-hover:text-foreground group-hover:ring-border/60',
        )}
      >
        <item.icon
          className={cn('h-3.5 w-3.5', isActive && 'drop-shadow-[0_0_4px_hsl(var(--primary)/0.4)]')}
        />
      </div>

      <span
        className={cn(
          'truncate text-[12.5px] font-bold tracking-tight transition-colors duration-300',
          isActive ? 'text-foreground' : 'group-hover:text-foreground',
        )}
      >
        {item.name}
      </span>

      {isActive && (
        <div className="ml-auto relative flex h-4 w-4 items-center justify-center">
          <div className="absolute h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
          <div className="absolute h-3 w-3 rounded-full bg-primary/20 animate-pulse" />
        </div>
      )}
    </Link>
  );
}

export function Sidebar({ className, onNavClick }: SidebarProps) {
  const pathname = usePathname();
  const _guildId = useGuildSelection();
  const isNavItemActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Server Selector Island - Sticky Top */}
      <div className="sticky top-0 z-20 shrink-0 bg-gradient-to-b from-background via-background/90 to-transparent px-4 pt-6 pb-2">
        <ServerSelector />
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-5">
        {navGroups.map((group) => (
          <div
            key={group.label}
            className="flex flex-col gap-1.5 rounded-[24px] bg-card/20 border border-border/30 shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.02)] relative overflow-hidden p-2"
          >
            <div className="flex items-center gap-2 px-3 pb-1 pt-2 relative z-10">
              <group.icon className="h-3.5 w-3.5 text-primary/60" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/40">
                {group.label}
              </span>
            </div>
            <nav className="flex flex-col space-y-0.5 relative z-10">
              {group.items.map((item) =>
                renderNavItem(item, isNavItemActive(item.href), onNavClick),
              )}
            </nav>
            {/* Subtle glow behind the island if active item exists inside */}
            {group.items.some((item) => isNavItemActive(item.href)) && (
              <div className="absolute top-0 right-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
            )}
          </div>
        ))}
      </div>

      {/* Support Island - Fixed Bottom Solid Button */}
      <div className="sticky bottom-0 shrink-0 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-6 pt-10 z-10">
        <Link
          href="https://joinvolvox.com/"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavClick}
          className="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-[20px] transition-all active:scale-[0.98] bg-primary text-primary-foreground shadow-[0_8px_16px_hsl(var(--primary)/0.25),inset_0_1px_1px_hsl(var(--primary-foreground)/0.3)] ring-1 ring-primary-foreground/20 hover:brightness-110"
        >
          <div className="relative z-10 flex items-center gap-2.5">
            <LifeBuoy className="h-4.5 w-4.5 animate-[spin_4s_linear_infinite]" />
            <span className="text-xs font-black uppercase tracking-[0.2em]">Support Hub</span>
          </div>

          {/* Active Shine */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent -translate-x-[150%] transition-transform duration-[1200ms] ease-in-out group-hover:translate-x-[150%] pointer-events-none" />
        </Link>
      </div>
    </div>
  );
}
