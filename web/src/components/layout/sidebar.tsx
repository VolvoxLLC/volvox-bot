'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  ClipboardList,
  Clock,
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
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { CONFIG_NAVIGATION } from '@/components/dashboard/config-workspace/navigation';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { WEB_APP_VERSION } from '@/lib/app-version';
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
const GLOBAL_ADMIN_ONLY_HREFS = new Set(['/dashboard/performance', '/dashboard/logs']);

interface SidebarProps {
  className?: string;
  onNavClick?: () => void;
}

/** Props for the unified sidebar navigation item */
interface SidebarItemProps {
  name: string;
  icon: ComponentType<{ className?: string }>;
  isActive: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Modular sidebar item that can render as a Link or a button.
 * Encapsulates the core visual language of the dashboard sidebar.
 */
function SidebarItem({
  name,
  icon: Icon,
  isActive,
  href,
  onClick,
  className,
}: Readonly<SidebarItemProps>) {
  const content = (
    <>
      {/* Icon Box */}
      <div
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300',
          isActive
            ? 'bg-primary/20 text-primary shadow-[0_4px_12px_hsl(var(--primary)/0.25)] ring-1 ring-primary/30'
            : 'bg-muted/30 ring-1 ring-border group-hover:bg-muted/50 group-hover:text-foreground group-hover:ring-border/60',
        )}
      >
        <Icon
          className={cn('h-3.5 w-3.5', isActive && 'drop-shadow-[0_0_4px_hsl(var(--primary)/0.4)]')}
        />
      </div>

      {/* Label */}
      <span
        className={cn(
          'truncate text-[12.5px] font-bold tracking-tight transition-colors duration-300',
          isActive ? 'text-foreground' : 'group-hover:text-foreground',
        )}
      >
        {name}
      </span>

      {/* Active Pill Indicator */}
      {isActive && (
        <div className="ml-auto relative flex h-4 w-4 items-center justify-center">
          <div className="absolute h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
          <div className="absolute h-3 w-3 rounded-full bg-primary/20 animate-pulse" />
        </div>
      )}
    </>
  );

  const sharedStyles = cn(
    'group relative flex items-center gap-3 rounded-[16px] px-2 py-2 transition-all duration-300 text-left',
    isActive
      ? 'bg-primary/10 hover:bg-primary/20 text-primary shadow-[inset_0_1px_2px_hsl(var(--foreground)/0.1),inset_0_0_0_1px_hsl(var(--primary)/0.15)] ring-1 ring-primary/5'
      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.05)]',
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className={sharedStyles}
        aria-current={isActive ? 'page' : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cn(sharedStyles, 'w-full')}>
      {content}
    </button>
  );
}

/** Backward compatibility helper for standard nav groups */
function renderNavItem(item: NavItem, isActive: boolean, onNavClick?: () => void) {
  return (
    <SidebarItem
      key={item.name}
      name={item.name}
      icon={item.icon}
      isActive={isActive}
      href={item.href}
      onClick={onNavClick}
    />
  );
}

export function Sidebar({ className, onNavClick }: SidebarProps) {
  const pathname = usePathname();
  const _guildId = useGuildSelection();
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const { activeCategoryId, activeTabId, setActiveCategoryId, setActiveTabId } = useConfigContext();

  const isSettingsMode = pathname.startsWith('/dashboard/settings');

  const isNavItemActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (typeof fetch !== 'function') return;
      try {
        const pending = fetch('/api/global-admin', { cache: 'no-store' });
        if (!pending || typeof (pending as Promise<Response>).then !== 'function') return;
        const response = await pending;
        const data = response.ok
          ? ((await response.json()) as { isGlobalAdmin?: boolean })
          : { isGlobalAdmin: false };
        if (mounted) setIsGlobalAdmin(Boolean(data.isGlobalAdmin));
      } catch {
        if (mounted) setIsGlobalAdmin(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const visibleNavGroups = useMemo(
    () =>
      navGroups.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => isGlobalAdmin || !GLOBAL_ADMIN_ONLY_HREFS.has(item.href),
        ),
      })),
    [isGlobalAdmin],
  );

  return (
    <div className={cn('flex h-full flex-col overflow-y-auto scrollbar-none', className)}>
      <div className="sticky top-0 z-20 shrink-0 bg-gradient-to-b from-background via-background/90 to-transparent px-4 pt-6 pb-2">
        {isSettingsMode ? (
          /* Back to Dashboard Button */
          <Link
            href="/dashboard"
            onClick={onNavClick}
            className="group relative flex h-14 w-full items-center gap-3 overflow-hidden rounded-[20px] px-4 transition-all active:scale-[0.98] bg-card/40 border border-border/40 backdrop-blur-xl shadow-lg hover:bg-card/60 hover:border-primary/30"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:-translate-x-0.5">
              <ArrowLeft className="h-4 w-4" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary/60 leading-none mb-1">
                Exit Settings
              </span>
              <span className="text-sm font-bold text-foreground leading-none">Dashboard</span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ) : (
          /* Server Selector island */
          <ServerSelector onSelect={onNavClick} />
        )}
      </div>

      <div className="px-4 py-4 flex flex-col gap-5 flex-1">
        {isSettingsMode ? (
          /* Settings Navigation Tree */
          <div className="space-y-4 shrink-0">
            {CONFIG_NAVIGATION.map((category) => {
              const isActive = activeCategoryId === category.id;
              const Icon = category.icon;

              return (
                <div key={category.id} className="space-y-1.5">
                  <SidebarItem
                    name={category.label}
                    icon={Icon}
                    isActive={isActive}
                    onClick={() => {
                      setActiveCategoryId(category.id);
                      if (category.tabs.length > 0) {
                        setActiveTabId(category.tabs[0].id);
                      }
                      onNavClick?.();
                    }}
                  />

                  <AnimatePresence>
                    {isActive && category.tabs.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        transition={{ duration: 0.3, ease: 'circOut' }}
                        className="overflow-hidden bg-muted/10 rounded-[18px] border border-border/30 mx-1 px-1.5 py-1.5"
                      >
                        <div className="flex flex-col gap-1">
                          {category.tabs.map((tab) => {
                            const isTabActive = activeTabId === tab.id;
                            const TabIcon = tab.icon;

                            return (
                              <SidebarItem
                                key={tab.id}
                                name={tab.label}
                                icon={TabIcon}
                                isActive={isTabActive}
                                onClick={() => {
                                  setActiveTabId(tab.id);
                                  onNavClick?.();
                                }}
                                className="scale-[0.98] origin-left"
                              />
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ) : (
          /* Standard Navigation Groups */
          visibleNavGroups.map((group) => (
            <div
              key={group.label}
              className="flex flex-col gap-1.5 rounded-[24px] bg-card/20 border border-border/30 shadow-[inset_0_1px_1px_hsl(var(--foreground)/0.02)] relative overflow-hidden p-2 shrink-0"
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
          ))
        )}
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
        <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/35">
          Volvox Dashboard · v{WEB_APP_VERSION}
        </p>
      </div>
    </div>
  );
}
