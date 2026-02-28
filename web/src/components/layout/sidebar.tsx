'use client';

import {
  Bot,
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
import { cn } from '@/lib/utils';

const navigation = [
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
    name: 'AI Chat',
    href: '/dashboard/ai',
    icon: MessageSquare,
  },
  {
    name: 'Members',
    href: '/dashboard/members',
    icon: Users,
  },
  {
    name: 'Conversations',
    href: '/dashboard/conversations',
    icon: MessagesSquare,
  },
  {
    name: 'Tickets',
    href: '/dashboard/tickets',
    icon: Ticket,
  },
  {
    name: 'Bot Config',
    href: '/dashboard/config',
    icon: Bot,
  },
  {
    name: 'Logs',
    href: '/dashboard/logs',
    icon: ScrollText,
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
];

interface SidebarProps {
  className?: string;
  onNavClick?: () => void;
}

export function Sidebar({ className, onNavClick }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="px-3 py-4">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">Navigation</h2>
        <Separator className="mb-4" />
        <nav className="space-y-1">
          {navigation.map((item) => {
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
    </div>
  );
}
