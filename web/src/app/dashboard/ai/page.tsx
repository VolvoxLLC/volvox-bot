'use client';

{
  /* AI Dashboard Coming Soon Screen
     Handles redirection to /dashboard/conversations after a 5s countdown
     Features cinematic motion and glassmorphism styling
  */
}

import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bot, Sparkles, ArrowRight } from 'lucide-react';

/**
 * Renders a client-side "Coming Soon" page that shows a 5-second countdown and then navigates to /dashboard/conversations.
 *
 * Displays an animated card with the remaining seconds, a linear 5s progress bar, and a "Skip countdown" control that immediately navigates to the same destination.
 *
 * @returns The page's React element tree for the countdown and redirect UI.
 */
export default function DashboardAiRedirectPage() {
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
      {/* Background ambient glows */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-primary/10 blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-secondary/10 blur-[100px] animate-pulse delay-700" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="group relative overflow-hidden rounded-[32px] border border-border/40 bg-card/40 p-8 backdrop-blur-3xl shadow-2xl">
          {/* Subtle top light effect */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          
          <div className="flex flex-col items-center text-center space-y-8">
            {/* Animated Icon Container */}
            <motion.div 
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-[0_0_20px_rgba(var(--primary),0.2)]"
            >
              <Bot className="h-10 w-10" />
              <Sparkles className="absolute -top-2 -right-2 h-5 w-5 text-secondary animate-bounce" />
            </motion.div>

            <div className="space-y-3">
              <h1 className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/50">
                Coming Soon
              </h1>
              <p className="text-sm font-medium text-muted-foreground/60 uppercase tracking-[0.2em]">
                Neural Command Center
              </p>
            </div>

            <div className="w-full h-px bg-border/20" />

            <div className="space-y-6 w-full">
              <p className="text-sm text-muted-foreground/80 leading-relaxed max-w-xs mx-auto">
                We're fine-tuning the AI experience. Redirecting you to the active workspace.
              </p>

              <div className="relative flex items-center justify-center gap-4">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={countdown}
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 1.2 }}
                    className="text-6xl font-black text-primary tabular-nums drop-shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                  >
                    {countdown}
                  </motion.span>
                </AnimatePresence>
                
                <div className="flex flex-col items-start text-left">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40">seconds until</span>
                  <span className="text-sm font-bold text-foreground/80 flex items-center gap-2">
                    Auto-Redirect <ArrowRight className="h-3 w-3 animate-bounce-x" />
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 5, ease: "linear" }}
                  className="h-full bg-primary/60"
                />
              </div>
            </div>

            <button
              onClick={() => router.push('/dashboard/conversations')}
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 hover:text-primary transition-colors hover:underline underline-offset-4"
            >
              Skip countdown
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
