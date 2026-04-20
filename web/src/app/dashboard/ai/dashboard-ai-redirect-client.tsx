'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bot, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardAiRedirectClient() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown <= 0) {
      router.push('/dashboard/conversations');
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, router]);

  return (
    <div className="relative flex min-h-[80vh] items-center justify-center overflow-hidden p-6">
      <div className="absolute inset-0 z-0">
        <div className="absolute left-1/4 top-1/4 h-64 w-64 animate-pulse rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 h-64 w-64 animate-pulse rounded-full bg-secondary/10 blur-[100px] delay-700" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="group relative overflow-hidden rounded-[32px] border border-border/40 bg-card/40 p-8 shadow-2xl backdrop-blur-3xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

          <div className="flex flex-col items-center space-y-8 text-center">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
              className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[0_0_20px_rgba(var(--primary),0.2)] ring-1 ring-primary/20"
            >
              <Bot className="h-10 w-10" />
              <Sparkles className="absolute -right-2 -top-2 h-5 w-5 animate-bounce text-secondary" />
            </motion.div>

            <div className="space-y-3">
              <h1 className="bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-4xl font-black tracking-tighter text-transparent">
                Coming Soon
              </h1>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
                Neural Command Center
              </p>
            </div>

            <div className="h-px w-full bg-border/20" />

            <div className="w-full space-y-6">
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground/80">
                We're fine-tuning the AI experience. Redirecting you to the active workspace.
              </p>

              <div className="relative flex items-center justify-center gap-4">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={countdown}
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 1.2 }}
                    className="text-6xl font-black tabular-nums text-primary drop-shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                  >
                    {countdown}
                  </motion.span>
                </AnimatePresence>

                <div className="flex flex-col items-start text-left">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40">
                    seconds until
                  </span>
                  <span className="flex items-center gap-2 text-sm font-bold text-foreground/80">
                    Auto-Redirect <ArrowRight className="h-3 w-3 animate-bounce-x" />
                  </span>
                </div>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 5, ease: 'linear' }}
                  className="h-full bg-primary/60"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push('/dashboard/conversations')}
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 transition-colors hover:text-primary hover:underline underline-offset-4"
            >
              Skip countdown
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
