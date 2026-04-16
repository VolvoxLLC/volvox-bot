'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Bot, Globe, Shield } from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { Suspense, useEffect } from 'react';
import { PrismaticBackground } from '@/components/landing/Hero';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';

interface FeatureItemProps {
  readonly icon: typeof Shield;
  readonly label: string;
  readonly sub: string;
  readonly className?: string;
}

function FeatureItem({ icon: Icon, label, sub, className }: FeatureItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-3.5 md:p-0 rounded-2xl md:rounded-none border border-border/40 md:border-none bg-card/20 md:bg-transparent backdrop-blur-md md:backdrop-blur-none transition-all shadow-sm md:shadow-none',
        className,
      )}
    >
      <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-card border border-border group-hover:border-primary/20 transition-all shadow-sm">
        <Icon className="w-5 h-5 text-foreground/40 group-hover:text-primary transition-colors" />
      </div>
      <div className="flex flex-col items-start text-left">
        <h3 className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/80 group-hover:text-foreground transition-colors">
          {label}
        </h3>
        <p className="text-[9px] md:text-[10px] font-medium text-foreground/20 uppercase tracking-widest leading-none mt-1">
          {sub}
        </p>
      </div>
    </div>
  );
}

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <PrismaticBackground />
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="relative h-16 w-16 rounded-full border border-border bg-card p-3 shadow-2xl animate-pulse overflow-hidden">
            <NextImage src="/icon-192.png" alt="Loading" fill className="object-cover opacity-50" />
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-[0.4em] text-foreground/20 font-mono"
            suppressHydrationWarning
          >
            Syncing
          </span>
        </div>
      </div>
    );
  }

  const features = [
    { icon: Shield, label: 'Active Sentry', sub: 'Autonomous Protection' },
    { icon: Bot, label: 'Neural Ops', sub: 'AI Synthesis' },
    { icon: Globe, label: 'Global Edge', sub: 'High Speed Infrastructure' },
  ];

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background font-sans selection:bg-primary/20">
      <PrismaticBackground />

      {/* Floating Header - Ultra High on Mobile */}
      <nav className="absolute inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-4 md:py-8 md:px-12">
        <Link href="/" className="group flex items-center gap-3 outline-none">
          <div className="relative h-8 w-8 md:h-9 md:w-9 overflow-hidden rounded-full border border-white/10 shadow-lg transition-transform group-hover:scale-105">
            <NextImage
              src="/icon-192.png"
              alt="Volvox"
              fill
              sizes="36px"
              className="object-cover"
            />
          </div>
          <span className="text-lg md:text-xl font-black uppercase tracking-tighter text-foreground">
            Volvox
          </span>
        </Link>
        <div className="rounded-full bg-card/40 backdrop-blur-xl border border-border/50 p-0.5 md:p-1 shadow-sm">
          <ThemeToggle />
        </div>
      </nav>

      <main className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-0 md:px-6 py-20">
        <div className="w-full max-w-4xl flex flex-col items-center text-center">
          {/* ─── MAIN CONTENT ─── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.21, 1.02, 0.47, 0.98] }}
            className="space-y-4 md:space-y-6 mb-12 md:mb-16 px-6"
          >
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter text-foreground leading-none uppercase">
              Dashboard Portal
            </h1>
            <p className="max-w-md mx-auto text-base md:text-lg font-medium leading-relaxed text-foreground/50">
              Welcome back. Authorize your Discord account to assume control of your community
              intelligence.
            </p>
          </motion.div>

          {/* ─── AUTH NODE ─── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="w-full max-w-sm mb-16 md:mb-24 px-6"
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-secondary/30 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative overflow-hidden rounded-[2rem] md:rounded-[2.5rem] border border-border/80 bg-card p-2 shadow-2xl backdrop-blur-3xl">
                <Button
                  variant="discord"
                  size="lg"
                  className="relative h-14 md:h-16 w-full gap-4 overflow-hidden rounded-[1.5rem] md:rounded-[2rem] bg-foreground text-background transition-all hover:scale-[1.01] active:scale-[0.98] group/btn shadow-xl px-8"
                  onClick={() => signIn('discord', { callbackUrl })}
                >
                  <svg
                    className="h-5 w-5 min-w-[20px] min-h-[20px] shrink-0 fill-current transition-transform group-hover/btn:scale-110"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label="Discord Logo"
                  >
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                  </svg>
                  <span className="text-sm font-bold uppercase tracking-[0.2em] whitespace-nowrap">
                    Sign in with discord
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover/btn:translate-x-1" />
                </Button>
              </div>
            </div>
          </motion.div>

          {/* ─── CAPABILITY INDICATORS ─── */}
          <div className="w-full max-w-5xl">
            {/* Mobile: Automatic Infinite Marquee */}
            <div className="md:hidden w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]">
              <motion.div
                className="flex gap-3 px-4 w-max"
                animate={{ x: ['0%', '-33.33%'] }}
                transition={{
                  ease: 'linear',
                  duration: 15,
                  repeat: Infinity,
                }}
              >
                {[...features, ...features, ...features].map((f, i) => (
                  <FeatureItem
                    key={`marquee-${f.label}-${i}`}
                    icon={f.icon}
                    label={f.label}
                    sub={f.sub}
                    className="min-w-[240px]"
                  />
                ))}
              </motion.div>
            </div>

            {/* Desktop: Standard Grid */}
            <div className="hidden md:grid md:grid-cols-3 gap-12 w-full px-6 md:px-0">
              {features.map((f) => (
                <div key={f.label} className="group flex flex-col items-start gap-4">
                  <FeatureItem icon={f.icon} label={f.label} sub={f.sub} />
                  <div className="h-px w-full bg-gradient-to-r from-border/60 via-border/20 to-transparent mt-6" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Decorative Overlays */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full border border-border bg-card animate-pulse" />
            <span className="animate-pulse font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-foreground/20">
              Initializing
            </span>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
