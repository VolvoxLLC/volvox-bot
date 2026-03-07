import type { Metadata } from 'next';

export const APP_TITLE = 'Volvox.Bot - AI Powered Discord Bot';

interface DashboardTitleMatcher {
  matches: (pathname: string) => boolean;
  title: string;
}

const dashboardTitleMatchers: DashboardTitleMatcher[] = [
  {
    matches: (pathname) => pathname.startsWith('/dashboard/members/'),
    title: 'Member Details',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/conversations/'),
    title: 'Conversation Details',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/tickets/'),
    title: 'Ticket Details',
  },
  {
    matches: (pathname) => pathname === '/dashboard',
    title: 'Overview',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/moderation'),
    title: 'Moderation',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/temp-roles'),
    title: 'Temp Roles',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/ai'),
    title: 'AI Chat',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/members'),
    title: 'Members',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/conversations'),
    title: 'Conversations',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/tickets'),
    title: 'Tickets',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/config'),
    title: 'Bot Config',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/audit-log'),
    title: 'Audit Log',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/performance'),
    title: 'Performance',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/logs'),
    title: 'Logs',
  },
  {
    matches: (pathname) => pathname.startsWith('/dashboard/settings'),
    title: 'Settings',
  },
];

function normalizePathname(pathname: string | null | undefined): string | null {
  if (!pathname) {
    return null;
  }

  const trimmedPathname =
    pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  return trimmedPathname || '/';
}

export function formatDocumentTitle(pageTitle?: string | null): string {
  return pageTitle ? `${pageTitle} - ${APP_TITLE}` : APP_TITLE;
}

export function getDashboardPageTitle(pathname: string | null | undefined): string | null {
  const normalizedPathname = normalizePathname(pathname);
  if (!normalizedPathname) {
    return null;
  }

  const matchedRoute = dashboardTitleMatchers.find(({ matches }) => matches(normalizedPathname));
  return matchedRoute?.title ?? null;
}

export function getDashboardDocumentTitle(pathname: string | null | undefined): string {
  return formatDocumentTitle(getDashboardPageTitle(pathname));
}

export function createPageMetadata(title: string, description?: string): Metadata {
  if (!description) {
    return { title };
  }

  return {
    title,
    description,
  };
}
