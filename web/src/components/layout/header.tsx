'use client';

import { CircleDot, ExternalLink, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { getDashboardPageTitle } from '@/lib/page-titles';
import { MobileSidebar } from './mobile-sidebar';

/**
 * Renders the top navigation header for the Volvox.Bot Dashboard, including branding, a theme toggle, and a session-aware user menu.
 *
 * If the session reports a `RefreshTokenError`, initiates sign-out and redirects to `/login`; a guard prevents duplicate sign-out attempts.
 *
 * @returns The header element for the dashboard
 */
export function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const signingOut = useRef(false);
  const currentPageTitle = getDashboardPageTitle(pathname);

  // Single handler for RefreshTokenError — sign out and redirect to login.
  // session.error is set by the JWT callback when refreshDiscordToken fails.
  // Note: This is the ONLY RefreshTokenError handler in the app (providers.tsx
  // delegates to this component to avoid race conditions).
  // The signingOut guard prevents duplicate sign-out attempts when the session
  // refetches and re-triggers this effect.
  useEffect(() => {
    if (session?.error === 'RefreshTokenError' && !signingOut.current) {
      signingOut.current = true;
      signOut({ callbackUrl: '/login' });
    }
  }, [session?.error]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.35rem] w-full max-w-[1920px] items-center gap-3 px-3 md:px-6">
        <MobileSidebar />

        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-secondary text-sm font-extrabold text-primary-foreground shadow">
            <span className="absolute inset-0 rounded-xl border border-white/20" />
            V
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold tracking-tight">Volvox Control Room</p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 font-medium">
                <CircleDot className="h-3 w-3 text-primary" />
                Live
              </span>
              <span className="truncate">
                {currentPageTitle && currentPageTitle !== 'Overview'
                  ? currentPageTitle
                  : 'Overview'}
              </span>
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <ThemeToggle />
          {status === 'loading' && (
            <Skeleton className="h-8 w-8 rounded-full" data-testid="header-skeleton" />
          )}
          {status === 'unauthenticated' && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          )}
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="dashboard-chip relative h-9 w-9 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={session.user.image ?? undefined}
                      alt={session.user.name ?? 'User'}
                    />
                    <AvatarFallback>
                      {session.user.name?.charAt(0)?.toUpperCase() ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{session.user.name}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href="https://github.com/VolvoxLLC/volvox-bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Documentation
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => signOut({ callbackUrl: '/' })}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
