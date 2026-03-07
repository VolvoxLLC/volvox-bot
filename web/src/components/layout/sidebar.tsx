'use client';

import {
  Activity,
  Bot,
  ClipboardList,
  Clock,
  LayoutDashboard,
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
import { Separator } from '@/components/ui/separator';
import { useGuildRole } from '@/hooks/use-guild-role';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import type { DashboardRole } from '@/lib/dashboard-roles';
import { hasMinimumRole } from '@/lib/dashboard-roles';
import { cn } from '@/lib/utils';

const navigation: Array<{
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  minRole: DashboardRole;
}> = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard, minRole: 'viewer' },
  { name: 'Moderation', href: '/dashboard/moderation', icon: Shield, minRole: 'moderator' },
  { name: 'Temp Roles', href: '/dashboard/temp-roles', icon: Clock, minRole: 'moderator' },
  { name: 'AI Chat', href: '/dashboard/ai', icon: MessageSquare, minRole: 'admin' },
  { name: 'Members', href: '/dashboard/members', icon: Users, minRole: 'admin' },
  { name: 'Conversations', href: '/dashboard/conversations', icon: MessagesSquare, minRole: 'admin' },
  { name: 'Tickets', href: '/dashboard/tickets', icon: Ticket, minRole: 'admin' },
  { name: 'Bot Config', href: '/dashboard/config', icon: Bot, minRole: 'admin' },
  { name: 'Audit Log', href: '/dashboard/audit-log', icon: ClipboardList, minRole: 'admin' },
  { name: 'Performance', href: '/dashboard/performance', icon: Activity, minRole: 'viewer' },
  { name: 'Logs', href: '/dashboard/logs', icon: ScrollText, minRole: 'admin' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, minRole: 'admin' },
];

interface SidebarProps {
  className?: string;
  onNavClick?: () => void;
}

export function Sidebar({ className, onNavClick }: SidebarProps) {
  const pathname = usePathname();
  const guildId = useGuildSelection();
  const { role, loading, error } = useGuildRole(guildId);

  const visibleNav = loading || (role === null && !error)
    ? navigation
    : role !== null
      ? navigation.filter((item) => hasMinimumRole(role, item.minRole))
      : navigation.filter((item) => item.minRole === 'viewer');

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex flex-1 flex-col px-3 py-4">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">Navigation</h2>
        <Separator className="mb-4" />
        <nav className="space-y-1">
          {visibleNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavClick}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground',
                  isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
      {role && (
        <div className="border-t px-3 py-3">
          <p className="text-xs text-muted-foreground">Your role</p>
          <p className="mt-0.5 text-sm font-medium capitalize">{role}</p>
        </div>
      )}
    </div>
  );
}
