'use client';

import { useGSAP } from '@gsap/react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Bot, Command } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { getBotInviteUrl } from '@/lib/discord';

gsap.registerPlugin(ScrollTrigger);

// ─── BACKGROUND ─────────────────────────────────────────
export function PrismaticBackground() {
  return (
    <div className="absolute inset-0 -z-10 bg-background overflow-hidden">
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
          <title>Noise Texture</title>
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

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,hsl(var(--background))_100%)] pointer-events-none" />
    </div>
  );
}

// ─── DATA THREADS ──────────────────────────────────────
function DataThreads() {
  const threads = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, i) => ({
        id: i,
        left: `${10 + i * 11.5}%`,
        delay: Math.random() * 5,
        duration: 8 + Math.random() * 10,
      })),
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {threads.map((t) => (
        <div
          key={`thread-${t.id}`}
          className="absolute top-0 bottom-0 w-[1px] bg-foreground/[0.03] dark:bg-white/[0.03]"
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
            className="absolute left-1/2 -translate-x-1/2 w-[2px] h-24 bg-gradient-to-b from-transparent via-primary/40 to-transparent blur-[1px]"
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

  const opacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.4], [1, 0.95]);

  useGSAP(
    () => {
      // Entrance Sequence
      const tl = gsap.timeline();

      tl.fromTo(
        '.hero-char',
        { y: 120, opacity: 0, filter: 'blur(20px)' },
        { y: 0, opacity: 1, filter: 'blur(0px)', duration: 1.5, stagger: 0.08, ease: 'expo.out' },
      );

      tl.fromTo(
        '.hero-engine',
        { opacity: 0, letterSpacing: '0.2em' },
        { opacity: 1, letterSpacing: '1.2em', duration: 1.8, ease: 'power2.out' },
        '-=1.2',
      );

      tl.fromTo(
        '.hero-sub',
        { y: 30, opacity: 0 },
        { y: 0, opacity: 0.6, duration: 1.2, ease: 'power3.out' },
        '-=1.4',
      );

      tl.fromTo(
        '.hero-console',
        { scaleX: 0, opacity: 0, filter: 'blur(10px)' },
        { scaleX: 1, opacity: 1, filter: 'blur(0px)', duration: 1, ease: 'expo.inOut' },
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

  const brand = 'VOLVOX';

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[110vh] bg-background overflow-hidden flex flex-col items-center justify-center pt-20"
    >
      <PrismaticBackground />
      <DataThreads />

      {/* Hero Content */}
      <motion.div
        style={{ opacity, scale }}
        className="relative z-20 flex flex-col items-center max-w-7xl px-4 w-full"
      >
        {/* Top Label */}
        <div className="flex items-center gap-4 mb-16 opacity-30 dark:opacity-20">
          <div className="h-[1px] w-8 bg-foreground/40" />
          <span className="text-[9px] font-black uppercase tracking-[0.6em] text-foreground">
            System Architecture v2.4.0
          </span>
          <div className="h-[1px] w-8 bg-foreground/40" />
        </div>

        {/* Main Title Group */}
        <div className="relative mb-8 text-center">
          <h1
            ref={titleRef}
            className="flex flex-wrap justify-center text-[20vw] md:text-[14vw] lg:text-[180px] font-black leading-[0.75] tracking-[-0.07em] text-foreground select-none"
          >
            {brand.split('').map((char, i) => (
              <span key={`char-${i}`} className="hero-char inline-block">
                {char}
              </span>
            ))}
          </h1>
          <div className="hero-engine mt-6 text-[2.5vw] md:text-[1.2vw] lg:text-[14px] font-mono text-primary font-bold uppercase tracking-[1.2em] opacity-0 text-center w-full">
            BOT
          </div>
        </div>

        {/* Subtitle */}
        <p className="hero-sub text-foreground/70 dark:text-white/70 text-base md:text-lg lg:text-xl max-w-xl text-center font-light leading-relaxed mb-20 tracking-tight">
          The absolute synthesis of community intelligence, robust moderation, and dynamic
          architectural scale.
        </p>

        {/* Console CTA */}
        <div className="hero-console w-full max-w-2xl origin-center">
          <div className="group relative p-[1px] rounded-2xl overflow-hidden">
            {/* Border Gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/30 via-secondary/30 to-primary/30 opacity-40 group-hover:opacity-100 transition-opacity duration-700" />

            <div className="relative bg-card/80 dark:bg-[#0A0A0A]/80 backdrop-blur-3xl rounded-[15px] p-2 flex items-center shadow-2xl border border-border/50">
              <div className="flex items-center justify-center w-12 h-12 text-primary/40 group-hover:text-primary transition-colors duration-500">
                <Command className="w-5 h-5" />
              </div>

              <div className="flex-1 font-mono text-lg sm:text-2xl tracking-tighter pl-2 flex items-center overflow-hidden">
                <span className="text-primary font-bold mr-3">/summon</span>
                <span className="text-foreground/60">volvox_</span>
                <motion.div
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="w-[2px] h-6 bg-primary ml-1"
                />
              </div>

              {botInviteUrl && (
                <a
                  href={botInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative group/btn flex items-center gap-2 px-8 h-12 bg-foreground text-background font-black uppercase tracking-widest text-[10px] rounded-xl overflow-hidden transition-all hover:scale-[1.03] active:scale-95 shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(0,0,0,0.2)] dark:hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                >
                  <Bot className="w-4 h-4" />
                  <span className="relative z-10 hidden sm:inline">Add to Server</span>
                  <span className="relative z-10 sm:hidden">Add</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Background Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.3, 0],
              scale: [0, 1.2, 0],
              x: [0, (Math.random() - 0.5) * 600],
              y: [0, (Math.random() - 0.5) * 600],
            }}
            transition={{
              duration: 15 + Math.random() * 15,
              repeat: Infinity,
              delay: Math.random() * 10,
            }}
            className="absolute top-1/2 left-1/2 w-1 h-1 bg-foreground/40 dark:bg-white/40 rounded-full blur-[1px]"
          />
        ))}
      </div>

      {/* Bottom Gradient Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-[35vh] bg-gradient-to-t from-background via-background/80 to-transparent z-30 pointer-events-none" />
    </section>
  );
}
