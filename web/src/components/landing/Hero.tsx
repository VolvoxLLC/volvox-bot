'use client';

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Activity, Bot, Shield, Sparkles, Terminal } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { GetStartedButton } from '@/components/ui/get-started-button';
import { getBotInviteUrl } from '@/lib/discord';

// ─── 3D Floating Widget Wrapper ──────────────────────────────────────────────

interface FloatingWidgetProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  depth?: number;
  floatDuration?: number;
  floatAmount?: number;
}

function FloatingWidget({
  children,
  className = '',
  delay = 0,
  depth = 1,
  floatDuration = 6,
  floatAmount = 15,
}: FloatingWidgetProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Subtle rotation to avoid "messed up" look
  const rotateX = useTransform(y, [-500, 500], [8 * depth, -8 * depth]);
  const rotateY = useTransform(x, [-500, 500], [-8 * depth, 8 * depth]);

  const springConfig = { damping: 30, stiffness: 100, mass: 0.5 };
  const springRotateX = useSpring(rotateX, springConfig);
  const springRotateY = useSpring(rotateY, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      x.set(e.clientX - window.innerWidth / 2);
      y.set(e.clientY - window.innerHeight / 2);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [x, y]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 30 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -floatAmount, 0],
      }}
      transition={{
        opacity: { duration: 0.8, delay },
        scale: { duration: 0.8, delay },
        y: {
          duration: floatDuration,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: delay * 0.5,
        },
      }}
      style={{
        rotateX: springRotateX,
        rotateY: springRotateY,
        transformStyle: 'preserve-3d',
      }}
      className={`absolute z-20 perspective-1000 ${className}`}
    >
      <div className="glass-morphism-premium rounded-3xl p-5 md:p-6 relative overflow-visible group border-white/5 shadow-2xl preserve-3d">
        <div className="glass-reflection group-hover:translate-x-full transition-transform duration-1000 ease-in-out opacity-30" />
        <div className="relative z-10 preserve-3d">{children}</div>
      </div>
    </motion.div>
  );
}

// ─── Sub-Widgets ─────────────────────────────────────────────────────────────

function ChatWidget() {
  return (
    <div className="w-60 md:w-72 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--primary))] shadow-[0_0_10px_hsla(var(--primary),0.5)] animate-pulse" />
        <span className="text-[11px] font-black uppercase tracking-[0.15em] text-[hsl(var(--primary))]/90">
          Neural Engine
        </span>
      </div>
      <div className="space-y-3">
        <div className="flex gap-3 items-start">
          <div className="w-8 h-8 rounded-xl bg-[hsl(var(--secondary))]/20 flex items-center justify-center shrink-0 border border-[hsl(var(--secondary))]/10">
            <Sparkles className="w-4 h-4 text-[hsl(var(--secondary))]" />
          </div>
          <div className="bg-[hsl(var(--card))]/50 rounded-2xl rounded-tl-none p-3 text-[12px] leading-relaxed text-[hsl(var(--foreground))]/70 border border-[hsl(var(--border))]/30 backdrop-blur-sm">
            Summarize the raid attempt that happened tonight.
          </div>
        </div>
        <div className="flex gap-3 items-start justify-end">
          <div className="bg-[hsl(var(--primary))]/10 rounded-2xl rounded-tr-none p-3 text-[12px] leading-relaxed text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/20 backdrop-blur-sm">
            I've identified 14 accounts involved in spamming. All have been quarantined.
          </div>
          <div className="w-8 h-8 rounded-xl bg-[hsl(var(--primary))]/20 flex items-center justify-center shrink-0 border border-[hsl(var(--primary))]/10">
            <Bot className="w-4 h-4 text-[hsl(var(--primary))]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModWidget() {
  return (
    <div className="w-64 md:w-80 space-y-4">
      <div className="flex items-center justify-between border-b border-border/30 pb-3">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-foreground" />
          <span className="text-sm font-black tracking-tight text-foreground/90 font-[family-name:var(--font-mono)]">
            SENTRY AUTO-MOD
          </span>
        </div>
        <div className="px-2 py-1 text-foreground rounded-lg bg-accent/10 border border-accent/20 text-[10px] text-accent tracking-tighter">
          ACTIVE
        </div>
      </div>
      <div className="space-y-2.5">
        {[
          { user: 'SpamBot#1234', action: 'Banned', time: '2m ago' },
          { user: 'ToxicUser#99', action: 'Muted', time: '12m ago' },
        ].map((log) => (
          <div
            key={log.user}
            className="flex items-center justify-between bg-card/60 rounded-xl px-3 py-2.5 border border-border/40 hover:border-primary/30 transition-colors"
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-foreground">{log.user}</span>
              <span className="text-[9px] text-foreground font-medium">{log.time}</span>
            </div>
            <span className="text-[10px] text-primary uppercase tracking-widest">{log.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsWidget() {
  return (
    <div className="w-52 md:w-64">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="w-5 h-5 text-[hsl(var(--primary))]" />
        <span className="text-sm font-black tracking-tight text-[hsl(var(--foreground))]/90">
          LIVE METRICS
        </span>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-1">
          <div className="text-[9px] text-[hsl(var(--muted-foreground))] font-black uppercase tracking-widest">
            Global Reach
          </div>
          <div className="text-2xl font-black text-[hsl(var(--foreground))] tracking-tighter">
            8.2M+
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[9px] text-[hsl(var(--muted-foreground))] font-black uppercase tracking-widest">
            Latency
          </div>
          <div className="text-2xl font-black text-[hsl(var(--primary))] tracking-tighter">
            14ms
          </div>
        </div>
      </div>
      <div className="mt-6 h-1.5 w-full bg-[hsl(var(--muted))]/30 rounded-full overflow-hidden border border-[hsl(var(--border))]/20">
        <motion.div
          className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--secondary))]"
          initial={{ width: 0 }}
          animate={{ width: '88%' }}
          transition={{ duration: 2.5, delay: 1, ease: 'circOut' }}
        />
      </div>
    </div>
  );
}

// ─── Main Hero ───────────────────────────────────────────────────────────────

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion() ?? false;
  const botInviteUrl = getBotInviteUrl();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.4], [1, 0.9]);
  const y = useTransform(scrollYProgress, [0, 0.4], [0, -100]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-[110vh] pt-32 md:pt-48 flex flex-col items-center overflow-hidden perspective-1000 bg-[var(--background)]"
    >
      {/* Immersive Background Atmosphere */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[140vw] h-[100vh] hero-glow opacity-60 blur-[120px]" />
        <div className="absolute inset-0 noise opacity-[0.04]" />

        {/* Animated Orbs */}
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{
            x: [0, -120, 0],
            y: [0, 80, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[120px]"
        />
      </div>

      <motion.div
        style={{ opacity, scale, y }}
        className="w-full max-w-7xl mx-auto px-4 relative z-10 flex flex-col items-center flex-1"
      >
        {/* Central Content */}
        <div className="text-center mb-16 relative z-30 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center py-2 px-5 rounded-full bg-white/[0.03] text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-10 border border-white/10 backdrop-blur-xl shadow-xl"
          >
            Autonomous Community Intelligence
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-[clamp(4rem,12vw,10rem)] leading-[0.82] font-black tracking-[-0.06em] mb-12 text-foreground"
          >
            <span className="block italic opacity-20 mix-blend-overlay">THE BRAIN</span>
            <span className="text-aurora block drop-shadow-[0_0_30px_rgba(var(--primary),0.2)]">
              OF DISCORD.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ duration: 1.2, delay: 0.8 }}
            className="text-[clamp(1.1rem,1.8vw,1.4rem)] text-foreground/80 leading-relaxed mb-14 max-w-2xl mx-auto font-medium balance pointer-events-auto"
          >
            Volvox is an AI-powered command center for modern communities. Moderation, intelligence,
            and growth — synthesized into one beautiful interface.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="flex flex-col sm:flex-row gap-5 items-center justify-center pointer-events-auto"
          >
            {botInviteUrl && (
              <GetStartedButton
                variant="discord"
                label="Add to Server"
                href={botInviteUrl}
                className="rounded-full h-16 px-14 font-black text-xs tracking-[0.2em] uppercase shadow-[0_20px_50px_rgba(var(--primary),0.3)] border border-primary/20 hover:scale-105 transition-transform"
              />
            )}
            <GetStartedButton
              variant="outline"
              icon={Terminal}
              label="Explore Features"
              href="/#features"
              internal
              className="rounded-full h-16 px-10 font-black text-xs tracking-[0.2em] uppercase text-foreground/50 border-white/10 hover:bg-white/5 hover:text-foreground hover:border-white/20 transition-all"
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Spatial Bento Widgets */}
      {!shouldReduceMotion && (
        <div className="absolute inset-0 pointer-events-none overflow-visible z-20">
          {/* AI Widget - Floating top right */}
          <FloatingWidget
            delay={0.4}
            depth={1.2}
            floatAmount={20}
            floatDuration={7}
            className="hidden xl:block top-[12%] right-[2%]"
          >
            <div className="pointer-events-auto">
              <ChatWidget />
            </div>
          </FloatingWidget>

          {/* Mod Widget - Floating middle left */}
          <FloatingWidget
            delay={0.6}
            depth={0.8}
            floatAmount={15}
            floatDuration={8}
            className="hidden xl:block top-[48%] left-[2%]"
          >
            <div className="pointer-events-auto">
              <ModWidget />
            </div>
          </FloatingWidget>

          {/* Stats Widget - Floating bottom right */}
          <FloatingWidget
            delay={0.8}
            depth={1.5}
            floatAmount={25}
            floatDuration={6}
            className="hidden xl:block bottom-[10%] right-[5%]"
          >
            <div className="pointer-events-auto">
              <StatsWidget />
            </div>
          </FloatingWidget>

          {/* Mobile/Small Tablet Widget - Bottom Centered */}
          <FloatingWidget delay={1} className="lg:hidden bottom-24 left-1/2 -translate-x-1/2">
            <div className="pointer-events-auto scale-[0.75] origin-bottom">
              <StatsWidget />
            </div>
          </FloatingWidget>
        </div>
      )}

      {/* Deep Atmosphere Transition to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-[40vh] bg-gradient-to-t from-[var(--background)] to-transparent pointer-events-none z-40" />
    </section>
  );
}
