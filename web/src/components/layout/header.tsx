'use client';

import { ExternalLink, LogOut } from 'lucide-react';
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
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1920px] items-center gap-3 px-3 md:px-6">
        <MobileSidebar />

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            V
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold">Volvox Dashboard</p>
            {currentPageTitle && currentPageTitle !== 'Overview' && (
              <p className="truncate text-xs text-muted-foreground">{currentPageTitle}</p>
            )}
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
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full border border-border/60"
                >
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
