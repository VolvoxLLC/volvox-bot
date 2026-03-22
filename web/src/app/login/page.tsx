'use client';

import { ArrowRight, BadgeCheck, Bot, Settings2, Shield, Sparkles, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { Suspense, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/theme-toggle';

function LoginForm() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get('callbackUrl');
  // Validate callbackUrl is a safe relative path to prevent open redirects.
  // Reject absolute URLs, protocol-relative URLs (//evil.com), and missing values.
  const callbackUrl =
    rawCallbackUrl?.startsWith('/') && !rawCallbackUrl.startsWith('//')
      ? rawCallbackUrl
      : '/dashboard';

  useEffect(() => {
    if (session) {
      if (session.error === 'RefreshTokenError') {
        // RefreshTokenError is handled centrally by the Header component
        // (which has a signingOut guard ref to prevent duplicates).
        // Do NOT call signOut here to avoid a race condition.
        return;
      }
      router.push(callbackUrl);
    }
  }, [session, router, callbackUrl]);

  // Show spinner while session is loading or user is already authenticated (redirecting).
  // Don't show spinner if the session has a token refresh error — show the login form instead.
  if (status === 'loading' || (session && !session.error)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const dashboardHighlights = [
    {
      icon: Shield,
      label: 'Moderation',
      description: 'Cases, audit trails, and safety controls in one place.',
    },
    {
      icon: Bot,
      label: 'AI ops',
      description: 'Review conversations, usage, and automation without tab hell.',
    },
    {
      icon: Ticket,
      label: 'Tickets',
      description: 'Keep support queues and follow-up work moving.',
    },
  ];

  const trustSignals = ['Discord OAuth', 'Role-aware server access', 'Safe callback URLs'];

  return (
    <div className="dashboard-canvas dashboard-grid relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_34%),radial-gradient(circle_at_85%_15%,hsl(var(--secondary)/0.08),transparent_26%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))]" />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-14">
        <section className="max-w-2xl space-y-6 lg:pr-6">
          <div className="dashboard-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Discord operations hub
          </div>

          <div className="space-y-4">
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Control moderation, AI, tickets, and config from one control room.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Volvox.Bot keeps community ops in one place so you can handle incidents, review
              conversations, and tune automation without bouncing across six different tools.
            </p>
          </div>
        </section>

        <Card className="dashboard-panel w-full max-w-md rounded-[1.75rem] border-border/70 shadow-xl shadow-black/5 lg:row-span-2 lg:justify-self-end">
          <CardHeader className="space-y-5 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-xl font-bold text-white shadow-sm">
                V
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Volvox.Bot</p>
                <p className="text-sm text-muted-foreground">Control Room access</p>
              </div>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription className="text-sm leading-6 text-muted-foreground">
                Sign in with Discord to pick a server, open the dashboard, and get back to work.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Inside the dashboard
              </div>
              <ul className="mt-3 space-y-3">
                <li className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  Review moderation queues, audit history, and member context.
                </li>
                <li className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  Track AI usage, conversation health, and automation output.
                </li>
                <li className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  Keep support tickets and config updates from drifting.
                </li>
              </ul>
            </div>

            <Button
              variant="discord"
              size="lg"
              className="w-full gap-2 text-base"
              onClick={() => signIn('discord', { callbackUrl })}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
              </svg>
              Sign in with Discord
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>

            <p className="text-center text-sm leading-6 text-muted-foreground">
              We&apos;ll only access your Discord profile and server list to connect your workspace.
            </p>

            <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-1 text-sm">
              <Link
                href="https://docs.volvox.bot"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary transition-colors hover:text-primary/80"
              >
                View docs
              </Link>
              <span className="text-xs text-muted-foreground">Safe callback URLs only</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:pr-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {dashboardHighlights.map(({ icon: Icon, label, description }) => (
              <div
                key={label}
                className="dashboard-panel rounded-2xl px-4 py-4 shadow-none transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">{label}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {trustSignals.map((signal) => (
              <span
                key={signal}
                className="dashboard-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground"
              >
                <BadgeCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                {signal}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
