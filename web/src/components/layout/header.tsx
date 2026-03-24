'use client';

import { BookOpen, LogOut } from 'lucide-react';
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
import { GithubIcon } from '@/components/ui/github-icon';
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
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[4.35rem] w-full max-w-[1920px] items-center gap-3 px-3 py-3 md:px-6">
        <MobileSidebar />

        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-sm font-extrabold text-primary-foreground shadow-sm ring-1 ring-primary/15">
            <span className="absolute inset-0 rounded-xl border border-white/10" />
            <span className="relative z-10">V</span>
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              <span className="sm:hidden">Volvox</span>
              <span className="hidden sm:inline">Volvox Control Room</span>
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 font-medium text-primary">
                <span className="status-dot-live" />
                Live
              </span>
              <span className="truncate text-muted-foreground/80">
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
                <Button
                  variant="ghost"
                  aria-label="Open user menu"
                  className="relative h-9 w-9 rounded-full ring-1 ring-border/50 transition-all hover:ring-primary/30"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={session.user.image ?? undefined}
                      alt={session.user.name ?? 'User'}
                    />
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {session.user.name?.charAt(0)?.toUpperCase() ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 rounded-xl border-border/60"
                align="end"
                forceMount
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{session.user.name}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href="https://docs.volvox.bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center"
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    Documentation
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href="https://github.com/VolvoxLLC/volvox-bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center"
                  >
                    <GithubIcon className="mr-2 h-4 w-4" />
                    GitHub repository
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
