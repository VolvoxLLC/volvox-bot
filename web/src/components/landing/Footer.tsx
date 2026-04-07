'use client';

import { useGSAP } from '@gsap/react';
import { motion } from 'framer-motion'; // Kept only for simple hover/tap interactions
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Activity, ArrowRight, ChevronRight, Cpu, Terminal, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { siDiscord, siX } from 'simple-icons';
import { GithubIcon } from '@/components/ui/github-icon';
import { SimpleIcon } from '@/components/ui/simple-icon';
import { getBotInviteUrl } from '@/lib/discord';

gsap.registerPlugin(ScrollTrigger);

// ─── Footer Links Config ─────────────────────────────────
const footerLinks = [
  {
    title: 'SYSTEM_CORE',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Dashboard', href: '/login' },
    ],
  },
  {
    title: 'RESOURCES',
    links: [
      { label: 'Documentation', href: 'https://docs.volvox.bot' },
      { label: 'Source Code', href: 'https://github.com/VolvoxLLC' },
      { label: 'Support Node', href: 'https://discord.gg/8ahXACdamN' },
    ],
  },
  {
    title: 'LEGAL_PROTOCOL',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'About Volvox', href: 'https://volvox.dev' },
    ],
  },
];

// ─── Background Elements ───
function FooterBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Tactical Background Grid */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Prismatic Orbs - Fixed positioning for GSAP targeting */}
      <div className="footer-orb-1 absolute -bottom-40 -left-20 w-[60vw] h-[60vw] bg-primary/10 dark:bg-primary/5 blur-[120px] rounded-full" />
      <div className="footer-orb-2 absolute top-0 -right-20 w-[50vw] h-[50vw] bg-secondary/10 dark:bg-secondary/5 blur-[120px] rounded-full" />

      {/* Tactical dots */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1.5px, transparent 1.5px)',
          backgroundSize: '32px 32px',
        }}
      />
    </div>
  );
}

export function Footer() {
  const containerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const botInviteUrl = getBotInviteUrl();

  useGSAP(
    () => {
      // 1. Reveal Animation for Main Content
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, y: 100, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1.5,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top 85%', // Trigger slightly before it enters the viewport
            toggleActions: 'play none none none',
          },
        },
      );

      // 2. Parallax Background Effects
      gsap.to('.footer-orb-1', {
        y: -150,
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
        },
      });

      gsap.to('.footer-orb-2', {
        y: -250,
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.5,
        },
      });

      // 3. Staggered Entrance for Footer Links
      gsap.from('.footer-link-col', {
        opacity: 0,
        y: 20,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '.footer-nav-grid',
          start: 'top 90%',
        },
      });

      // 4. Status Bar Subtle Pulse
      gsap.to('.status-indicator', {
        opacity: 0.6,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    },
    { scope: containerRef },
  );

  return (
    <footer
      ref={containerRef}
      id="footer"
      className="relative w-full bg-background pt-24 pb-12 overflow-hidden border-t border-border/40"
    >
      <FooterBackground />

      <div ref={contentRef} className="relative z-10 max-w-7xl mx-auto px-6 opacity-0">
        {/* ─── CTA MODULE ─── */}
        <div className="mb-32">
          <div className="glass-morphism-premium group relative overflow-hidden rounded-[3rem] p-10 md:p-24 border-border/60 shadow-2xl">
            {/* Interior Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 opacity-30 pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center">
              {/* Tactical Badge */}
              <div className="flex items-center gap-4 mb-8">
                <div className="h-[1px] w-8 bg-primary/30" />
                <span className="text-[10px] font-mono font-black uppercase tracking-[0.5em] text-primary">
                  [SYSTEM_READY]
                </span>
                <div className="h-[1px] w-8 bg-primary/30" />
              </div>

              <h2 className="text-4xl md:text-7xl lg:text-8xl font-black tracking-tighter text-foreground mb-8 leading-[1]">
                Your community, <br />
                <span className="text-aurora">re-engineered.</span>
              </h2>

              <p className="text-base md:text-xl text-muted-foreground max-w-2xl font-medium leading-relaxed mb-12">
                Deploy the absolute synthesis of AI intelligence and community governance.
                Experience the next generation of Discord management.
              </p>

              {/* Action Node */}
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {botInviteUrl ? (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Link
                      href={botInviteUrl}
                      target="_blank"
                      className="group/btn relative px-10 py-5 rounded-2xl bg-foreground text-background font-black uppercase tracking-widest text-xs shadow-xl flex items-center gap-3 transition-colors"
                    >
                      <Zap className="w-4 h-4 fill-current" />
                      <span>Initialize Bot</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                    </Link>
                  </motion.div>
                ) : (
                  <div className="px-10 py-5 rounded-2xl bg-muted border border-border text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
                    [OVERSIGHT_LOCKED]
                  </div>
                )}

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Link
                    href="/login"
                    className="group/secondary px-10 py-5 rounded-2xl border border-border bg-card/50 backdrop-blur-xl text-foreground font-black uppercase tracking-widest text-xs transition-all hover:bg-card hover:border-primary/40 flex items-center gap-3"
                  >
                    <Terminal className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                </motion.div>
              </div>
            </div>

            {/* Tactical ID */}
            <div className="absolute bottom-6 right-10 text-[9px] font-mono text-muted-foreground/30 tracking-[0.2em] hidden md:block">
              BUILD_REF: VOLVOX_2.4.0_STABLE
            </div>
          </div>
        </div>

        {/* ─── NAVIGATION GRID ─── */}
        <div className="footer-nav-grid grid grid-cols-1 lg:grid-cols-12 gap-16 pb-20 border-b border-border/20">
          {/* Brand Info */}
          <div className="footer-link-col lg:col-span-5 space-y-8">
            <Link href="/" className="flex items-center gap-4 group w-fit">
              <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-border shadow-xl transition-transform group-hover:rotate-12">
                <Image src="/icon-192.png" alt="Volvox" fill className="object-cover" />
              </div>
              <div>
                <span className="text-2xl font-black tracking-tighter uppercase block leading-none">
                  Volvox
                </span>
                <span className="text-[9px] font-mono font-bold tracking-[0.3em] text-primary uppercase">
                  Neural Network
                </span>
              </div>
            </Link>

            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs font-medium">
              Consolidating community architecture through the synthesis of artificial intelligence
              and robust infrastructure.
            </p>

            {/* Social Nodes */}
            <div className="flex items-center gap-4">
              {[
                { icon: GithubIcon, href: 'https://github.com/VolvoxLLC' },
                {
                  icon: (props: { className?: string }) => (
                    <SimpleIcon path={siDiscord.path} {...props} />
                  ),
                  href: 'https://discord.gg/8ahXACdamN',
                },
                {
                  icon: (props: { className?: string }) => (
                    <SimpleIcon path={siX.path} {...props} />
                  ),
                  href: 'https://x.com/volvoxdev',
                },
              ].map((social) => (
                <Link
                  key={social.href}
                  href={social.href}
                  target="_blank"
                  className="w-11 h-11 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all shadow-sm group/social"
                >
                  <social.icon className="w-5 h-5 transition-transform group-hover/social:scale-110" />
                </Link>
              ))}
            </div>
          </div>

          {/* Link Columns */}
          <div className="lg:col-span-7 grid grid-cols-2 md:grid-cols-3 gap-12">
            {footerLinks.map((col) => (
              <div key={col.title} className="footer-link-col space-y-8">
                <h4 className="text-[10px] font-mono font-black tracking-[0.4em] text-primary uppercase">
                  [{col.title}]
                </h4>
                <ul className="space-y-4">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[15px] font-medium text-muted-foreground hover:text-foreground transition-all flex items-center gap-2 group"
                      >
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all text-primary" />
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ─── STATUS & LEGAL ─── */}
        <div className="pt-12 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">
              &copy; {new Date().getFullYear()} Volvox LLC
            </span>
            <div className="h-[1px] w-6 bg-border/40" />
            <div className="status-indicator flex items-center gap-3 px-4 py-1.5 rounded-xl bg-primary/5 border border-primary/20">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
              <span className="text-[9px] font-mono font-black text-primary uppercase tracking-widest">
                Status: Nominal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 opacity-40 hover:opacity-100 transition-opacity">
              <Cpu className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold">
                Node_v2.4
              </span>
            </div>
            <div className="flex items-center gap-3 opacity-40 hover:opacity-100 transition-opacity">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold">
                Latency: 12ms
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grain/Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background via-background/60 to-transparent z-20 pointer-events-none" />
    </footer>
  );
}
