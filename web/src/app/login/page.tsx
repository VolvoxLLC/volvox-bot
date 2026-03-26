'use client';

import { motion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Bot, Settings2, Shield, Sparkles, Ticket } from 'lucide-react';
import NextImage from 'next/image';
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
  const callbackUrl =
    rawCallbackUrl?.startsWith('/') && !rawCallbackUrl.startsWith('//')
      ? rawCallbackUrl
      : '/dashboard';

  useEffect(() => {
    if (session) {
      if (session.error === 'RefreshTokenError') return;
      router.push(callbackUrl);
    }
  }, [session, router, callbackUrl]);

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
    <div className="relative min-h-screen overflow-hidden bg-background font-sans selection:bg-primary/20">
      {/* Immersive Background Layering */}
      <div className="noise absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05]" />
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full animate-pulse transition-all duration-[10s]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 blur-[100px] rounded-full animate-pulse delay-1000 transition-all duration-[8s]" />
      </div>

      <div className="absolute right-6 top-6 z-50">
        <div className="p-1 rounded-2xl bg-muted/20 backdrop-blur-md border border-border/50 shadow-lg">
          <ThemeToggle />
        </div>
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-14">
        {/* Left Content */}
        <motion.section
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="max-w-2xl space-y-8 lg:pr-6"
        >
          <div className="inline-flex items-center gap-2.5 rounded-full bg-muted/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)] backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            Discord Operations Hub
          </div>

          <div className="space-y-6">
            <h1 className="text-4xl font-black tracking-tighter text-foreground sm:text-5xl lg:text-6xl leading-[1.1]">
              Control moderation, AI, tickets, and config from one <br />
              <span className="text-aurora">control room.</span>
            </h1>
            <p className="max-w-xl text-lg font-medium leading-relaxed text-muted-foreground/80 sm:text-xl">
              Volvox.Bot keeps community ops in one place so you can handle incidents, review
              conversations, and tune automation without bouncing across six different tools.
            </p>
          </div>

          {/* Desktop Highlights */}
          <div className="hidden lg:block space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {dashboardHighlights.map(({ icon: Icon, label, description }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/10 p-4 backdrop-blur-sm transition-all duration-300 hover:bg-muted/20 hover:border-primary/30"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm font-black uppercase tracking-wider text-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground/60">
                    {description}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {trustSignals.map((signal) => (
                <span
                  key={signal}
                  className="inline-flex items-center gap-2 rounded-full bg-muted/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 border border-border/30"
                >
                  <BadgeCheck className="h-3.5 w-3.5 text-primary/30" />
                  {signal}
                </span>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Login Island (Original Card Position) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="relative w-full max-w-md lg:justify-self-end"
        >
          <div className="absolute inset-0 bg-primary/15 blur-[80px] rounded-full -z-10 animate-pulse" />

          <div className="group relative overflow-hidden rounded-[40px] border border-white/10 bg-background/40 p-8 sm:p-10 backdrop-blur-3xl shadow-[0_40px_100px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.05)] transition-all duration-700">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />

            <header className="relative z-10 space-y-6 text-left">
              <div className="flex items-center gap-4">
                <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-border/50 bg-muted/30 p-2 shadow-xl transition-transform duration-500 group-hover:scale-105">
                  <NextImage
                    src="/icon-512.png"
                    alt="Volvox Logo"
                    width={512}
                    height={512}
                    className="h-full w-full object-contain drop-shadow-md"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                </div>
                <div>
                  <p className="text-sm font-black tracking-tight text-foreground">Volvox.Bot</p>
                  <p className="text-xs text-muted-foreground/60">Control Room access</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-black tracking-tighter text-foreground leading-none">
                  Welcome back
                </h3>
                <p className="text-sm font-medium text-muted-foreground/70 leading-relaxed">
                  Sign in with Discord to pick a server, open the dashboard, and get back to work.
                </p>
              </div>
            </header>

            <div className="relative z-10 mt-8 space-y-6">
              <div className="rounded-2xl border border-border/60 bg-background/40 p-5 backdrop-blur-md">
                <div className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Inside the dashboard
                </div>
                <ul className="mt-4 space-y-3.5">
                  <li className="flex items-start gap-3 text-xs font-semibold text-muted-foreground/80 leading-relaxed">
                    <Shield
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60"
                      aria-hidden="true"
                    />
                    Review moderation queues, audit history, and member context.
                  </li>
                  <li className="flex items-start gap-3 text-xs font-semibold text-muted-foreground/80 leading-relaxed">
                    <Bot
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60"
                      aria-hidden="true"
                    />
                    Track AI usage, conversation health, and automation output.
                  </li>
                  <li className="flex items-start gap-3 text-xs font-semibold text-muted-foreground/80 leading-relaxed">
                    <Ticket
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60"
                      aria-hidden="true"
                    />
                    Keep support tickets and config updates from drifting.
                  </li>
                </ul>
              </div>

              <Button
                variant="discord"
                size="lg"
                className="relative h-14 w-full gap-3 overflow-hidden rounded-2xl bg-[#5865F2] text-md font-black uppercase tracking-widest text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(88,101,242,0.4)] active:scale-[0.98] group/login"
                onClick={() => signIn('discord', { callbackUrl })}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50 pointer-events-none" />
                <svg
                  className="h-5 w-5 drop-shadow-md transition-transform duration-500 group-hover/login:rotate-12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                </svg>
                Sign in with Discord
                <ArrowRight className="h-4 w-4 opacity-50 transition-transform group-hover/login:translate-x-1" />
              </Button>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                <Link
                  href="https://docs.volvox.bot"
                  target="_blank"
                  className="text-primary/60 hover:text-primary transition-colors"
                >
                  System Manuals
                </Link>
                <span>Safe callback URLs only</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Mobile Highlights */}
        <div className="lg:hidden w-full mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {dashboardHighlights.map(({ icon: Icon, label, description }) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/10 p-4 backdrop-blur-sm"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-black uppercase tracking-wider text-foreground">
                  {label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/60 leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {trustSignals.map((signal) => (
              <span
                key={signal}
                className="inline-flex items-center gap-2 rounded-full bg-muted/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 border border-border/30"
              >
                <BadgeCheck className="h-3.5 w-3.5 text-primary/30" />
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
