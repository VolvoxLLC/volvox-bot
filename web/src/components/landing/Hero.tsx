'use client';

import { useGSAP } from '@gsap/react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Bot, Command } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { WEB_APP_VERSION } from '@/lib/app-version';
import { getBotInviteUrl } from '@/lib/discord';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// ─── AMBIENT BACKGROUND ──────────────────────────────────
export function PrismaticBackground() {
  return (
    <div className="absolute inset-0 -z-10 bg-background overflow-hidden relative">
      {/* Prismatic Shard */}
      <div className="hero-parallax-deep absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180%] h-[500px] -rotate-12 bg-gradient-to-r from-primary/20 via-secondary/15 to-transparent blur-[120px] opacity-40 dark:opacity-30 pointer-events-none" />

      {/* Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Grain Overlay */}
      <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.08] pointer-events-none mix-blend-overlay">
        <svg
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full opacity-50"
          aria-hidden="true"
        >
          <filter id="noiseFilter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#noiseFilter)" />
        </svg>
      </div>

      {/* Fading Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,hsl(var(--background))_100%)] pointer-events-none" />
    </div>
  );
}

const dataThreadIds = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
] as const;

const brandLetters = [
  { id: 'brand-v-1', char: 'V' },
  { id: 'brand-o-1', char: 'O' },
  { id: 'brand-l-1', char: 'L' },
  { id: 'brand-v-2', char: 'V' },
  { id: 'brand-o-2', char: 'O' },
  { id: 'brand-x-1', char: 'X' },
] as const;

const particleIds = [
  'particle-01',
  'particle-02',
  'particle-03',
  'particle-04',
  'particle-05',
  'particle-06',
  'particle-07',
  'particle-08',
  'particle-09',
  'particle-10',
  'particle-11',
  'particle-12',
  'particle-13',
  'particle-14',
  'particle-15',
  'particle-16',
  'particle-17',
  'particle-18',
  'particle-19',
  'particle-20',
] as const;

// ─── DATA THREADS ──────────────────────────────────────
function DataThreads() {
  const threads = useMemo(
    () =>
      dataThreadIds.map((id, index) => ({
        id,
        left: `${10 + index * 11.5}%`,
        delay: (index * 2927) % 5,
        duration: 8 + ((index * 3511) % 10),
      })),
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {threads.map((t) => (
        <div
          key={`thread-${t.id}`}
          className="absolute top-0 bottom-0 w-[1px] bg-foreground/[0.06] dark:bg-white/[0.02]"
          style={{ left: t.left }}
        >
          <motion.div
            initial={{ top: '-10%' }}
            animate={{ top: '110%' }}
            transition={{
              duration: t.duration,
              repeat: Infinity,
              ease: 'linear',
              delay: t.delay,
            }}
            className="absolute left-1/2 -translate-x-1/2 w-[3px] h-32 bg-gradient-to-b from-transparent via-primary to-transparent blur-[1px]"
          />
        </div>
      ))}
    </div>
  );
}

// ─── MAIN HERO ───────────────────────────────────────────
export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const botInviteUrl = getBotInviteUrl();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.98]);

  useGSAP(
    () => {
      const tl = gsap.timeline();

      tl.fromTo(
        '.hero-char',
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.2, stagger: 0.05, ease: 'power3.out' },
      );

      tl.fromTo(
        '.hero-engine',
        { opacity: 0, letterSpacing: '0em' },
        { opacity: 1, letterSpacing: '0.8em', duration: 1.5, ease: 'power2.out' },
        '-=1.0',
      );

      tl.fromTo(
        '.hero-sub',
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: 'power3.out' },
        '-=1.2',
      );

      tl.fromTo(
        '.hero-console',
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: 'expo.out' },
        '-=0.8',
      );

      // Parallax
      gsap.to('.hero-parallax-deep', {
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
        y: 150,
        rotate: -5,
      });
    },
    { scope: sectionRef },
  );

  const particles = useMemo(
    () =>
      particleIds.map((id, i) => ({
        id,
        // Deterministic positions from index to avoid SSR hydration mismatch
        x: ((i * 7919 + 1234) % 600) - 300,
        y: ((i * 6271 + 5678) % 600) - 300,
        duration: 15 + ((i * 3571) % 15),
        delay: (i * 2909) % 10,
      })),
    [],
  );

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[90vh] bg-background justify-center flex flex-col items-center pt-[10vw] overflow-hidden"
    >
      <PrismaticBackground />
      <DataThreads />

      {/* Hero Content */}
      <motion.div
        style={{ opacity, scale }}
        className="relative z-20 flex flex-col items-center max-w-5xl px-4 w-full mt-10 md:mt-0"
      >
        {/* Top Label */}
        <div className="flex items-center gap-4 mb-12 opacity-50">
          <div className="h-[1px] w-6 bg-foreground" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground font-mono"
            suppressHydrationWarning
          >
            Architecture v{WEB_APP_VERSION}
          </span>
          <div className="h-[1px] w-6 bg-foreground" />
        </div>

        {/* Main Title Group */}
        <div className="relative mb-8 text-center flex flex-col items-center">
          <h1
            ref={titleRef}
            className="flex flex-wrap justify-center text-[18vw] md:text-[14vw] lg:text-[160px] font-black leading-[0.8] tracking-[-0.05em] text-foreground select-none"
          >
            {brandLetters.map((letter) => (
              <span key={letter.id} className="hero-char inline-block">
                {letter.char}
              </span>
            ))}
          </h1>
          <div
            className="hero-engine mt-6 text-[14px] md:text-[14px] lg:text-[16px] font-mono text-primary font-bold uppercase tracking-[1.2em] opacity-0 text-center w-full"
            suppressHydrationWarning
          >
            BOT
          </div>
        </div>

        {/* Subtitle */}
        <p className="hero-sub text-foreground/50 text-base md:text-lg max-w-md text-center font-medium leading-relaxed mb-16 tracking-tight">
          The absolute synthesis of community intelligence, robust moderation, and seamless scale.
        </p>

        {/* Console CTA */}
        <div className="hero-console w-full max-w-xl origin-top px-2 sm:px-0">
          <div className="relative group p-[1px] rounded-[1.5rem] sm:rounded-2xl overflow-hidden bg-border/40 hover:bg-border/80 transition-colors duration-500">
            <div className="relative bg-card rounded-[calc(1.5rem-1px)] sm:rounded-[15px] p-1.5 sm:p-2 flex items-center shadow-sm">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 text-foreground/80 shrink-0">
                <Command className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>

              <div
                className="flex-1 font-mono text-[15px] sm:text-lg tracking-tighter pl-1 sm:pl-2 flex items-center overflow-hidden whitespace-nowrap"
                suppressHydrationWarning
              >
                <span className="text-foreground font-semibold mr-2 sm:mr-3">/summon</span>
                <span className="text-primary">volvox bot</span>
                <motion.div
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="w-[2px] h-4 sm:h-5 bg-foreground/30 ml-1.5 sm:ml-2"
                />
              </div>

              {botInviteUrl && (
                <a
                  href={botInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 sm:px-6 h-10 sm:h-12 bg-foreground text-background font-bold tracking-wide text-[11px] sm:text-[13px] rounded-xl sm:rounded-xl overflow-hidden transition-transform hover:scale-[1.02] active:scale-95 shadow-sm shrink-0"
                >
                  <Bot className="w-3.5 h-3.5 sm:w-4 h-4" />
                  <span className="hidden sm:inline">Add to Server</span>
                  <span className="sm:hidden">Add</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Background Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.3, 0],
              scale: [0, 1.2, 0],
              x: [0, particle.x],
              y: [0, particle.y],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              delay: particle.delay,
            }}
            className="absolute top-1/2 left-1/2 w-1 h-1 bg-foreground/30 dark:bg-white/30 rounded-full blur-[1px]"
          />
        ))}
      </div>

      {/* Bottom Gradient Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-[18vh] bg-gradient-to-t from-background to-transparent z-30 pointer-events-none" />
    </section>
  );
}
