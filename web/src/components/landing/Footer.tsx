'use client';

import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Activity, ArrowRight, ChevronRight, Cpu, Terminal, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { siDiscord, siX } from 'simple-icons';
import { SimpleIcon } from '@/components/ui/simple-icon';
import { WEB_APP_VERSION } from '@/lib/app-version';
import { getBotInviteUrl } from '@/lib/discord';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

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
      {/* Prismatic Shard */}
      <div className="absolute -bottom-32 -left-32 w-[160%] h-[500px] -rotate-6 bg-gradient-to-r from-primary/12 via-secondary/8 to-transparent blur-[120px] opacity-50 dark:opacity-40" />

      {/* Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.01]"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Radial Mask */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_center,transparent_0%,hsl(var(--background))_100%)] opacity-60" />
    </div>
  );
}

export function Footer() {
  const containerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const botInviteUrl = getBotInviteUrl();

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set('.cta-label', { opacity: 1 });
        gsap.set('.cta-card', { opacity: 1, scale: 1 });
        gsap.set('.cta-buttons', { opacity: 1 });
        if (contentRef.current) {
          gsap.set(contentRef.current, { opacity: 1, y: 0 });
        }
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: '.cta-module',
          start: 'top 80%',
          toggleActions: 'play none none none',
        },
      });

      tl.fromTo(
        '.cta-label',
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' },
      );

      tl.fromTo(
        '.cta-card',
        { opacity: 0, scale: 0.98, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.8, ease: 'expo.out' },
        '-=0.4',
      );

      tl.fromTo(
        '.cta-buttons',
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' },
        '-=0.4',
      );

      gsap.fromTo(
        contentRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
        },
      );

      gsap.from('.footer-link-col', {
        opacity: 0,
        y: 10,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '.footer-nav-grid',
          start: 'top 95%',
        },
      });

      gsap.to('.status-indicator', {
        opacity: 0.5,
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
      className="relative w-full bg-background pt-24 pb-12 overflow-hidden"
    >
      <FooterBackground />

      <div ref={contentRef} className="relative z-10 max-w-6xl mx-auto px-6 opacity-0">
        {/* ─── CTA MODULE ─── */}
        <div className="cta-module mb-32 relative">
          {/* Prismatic Background for CTA */}
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-[2rem]">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[300px] -rotate-12 bg-gradient-to-r from-primary/15 via-secondary/10 to-transparent blur-[100px] opacity-50 dark:opacity-40 pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,hsl(var(--background))_100%)] pointer-events-none" />
          </div>

          {/* Glassmorphic Card */}
          <div className="cta-card relative group p-[1px] rounded-[1.5rem] overflow-hidden bg-border/20 hover:bg-border/40 transition-colors duration-500">
            <div className="relative bg-card/60 backdrop-blur-xl rounded-[calc(1.5rem-1px)] p-8 md:p-12">
              {/* Top Label */}
              <div className="cta-label flex items-center justify-center gap-4 mb-8">
                <div className="h-[1px] w-6 bg-foreground" />
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.3em] text-foreground font-mono"
                  suppressHydrationWarning
                >
                  System Ready v{WEB_APP_VERSION}
                </span>
                <div className="h-[1px] w-6 bg-foreground" />
              </div>

              {/* Heading */}
              <div className="text-center mb-8">
                <h2 className="text-4xl md:text-5xl font-black tracking-tight text-foreground mb-3 leading-tight">
                  Your community, <span className="text-foreground/25">re-engineered.</span>
                </h2>
                <p className="text-sm text-foreground/40 max-w-md mx-auto font-medium leading-relaxed">
                  Deploy the absolute synthesis of AI intelligence and community governance.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="cta-buttons flex flex-col sm:flex-row items-center justify-center gap-4">
                {botInviteUrl ? (
                  <Link
                    href={botInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex items-center gap-3 px-8 py-4 rounded-2xl bg-foreground text-background font-black tracking-tight text-sm overflow-hidden transition-all hover:scale-[1.02] active:scale-95 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)]"
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Initialize Bot</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 opacity-50" />
                  </Link>
                ) : (
                  <div className="px-8 py-4 rounded-2xl bg-muted border border-border text-foreground/40 font-mono text-[11px] tracking-widest uppercase">
                    [Locked]
                  </div>
                )}

                <Link
                  href="/login"
                  className="cta-dashboard flex items-center gap-3 px-8 py-4 rounded-2xl border border-border/40 bg-card text-foreground font-black tracking-tight text-sm transition-all hover:bg-muted/40 hover:scale-[1.02] active:scale-95 shadow-[inset_0_1px_1px_hsl(var(--background)/0.08),0_12px_24px_-8px_rgba(0,0,0,0.1)]"
                >
                  <Terminal className="w-4 h-4 opacity-40" />
                  <span>Dashboard</span>
                </Link>
              </div>

              {/* Decorative Element */}
              <div className="cta-decor absolute bottom-4 right-4 md:bottom-6 md:right-6 opacity-20 group-hover:opacity-40 transition-opacity">
                <span
                  className="text-[9px] font-mono text-foreground tracking-[0.15em]"
                  suppressHydrationWarning
                >
                  VOLVOX_{WEB_APP_VERSION}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── NAVIGATION GRID ─── */}
        <div className="footer-nav-grid grid grid-cols-1 lg:grid-cols-12 gap-16 pb-16">
          {/* Brand Info */}
          <div className="footer-link-col lg:col-span-4 space-y-6">
            <Link href="/" className="flex items-center gap-4 group w-fit">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-border/80 shadow-sm transition-transform group-hover:rotate-6 bg-card">
                <Image
                  src="/icon-192.png"
                  alt="Volvox.Bot"
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
              <div>
                <span className="text-xl font-black tracking-tight uppercase block leading-none text-foreground">
                  Volvox<span className="text-primary">.Bot</span>
                </span>
              </div>
            </Link>

            <p className="text-foreground/50 text-sm leading-relaxed max-w-xs font-medium">
              Consolidating community architecture through the synthesis of artificial intelligence
              and robust infrastructure.
            </p>

            {/* Social Nodes */}
            <div className="flex items-center gap-3 pt-2">
              {[
                {
                  label: 'Discord',
                  icon: (props: { className?: string }) => (
                    <SimpleIcon path={siDiscord.path} {...props} />
                  ),
                  href: 'https://discord.gg/8ahXACdamN',
                },
                {
                  label: 'X',
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
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="w-10 h-10 rounded-lg bg-background border border-border/60 flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-card transition-colors shadow-sm"
                >
                  <social.icon className="w-[18px] h-[18px]" />
                </Link>
              ))}
            </div>
          </div>

          {/* Link Columns */}
          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-12">
            {footerLinks.map((col) => (
              <div key={col.title} className="footer-link-col space-y-6">
                <h4 className="text-[11px] font-bold text-foreground/40 uppercase tracking-widest">
                  {col.title.replace('_', ' ')}
                </h4>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[14px] font-medium text-foreground/60 hover:text-foreground transition-colors flex items-center gap-1.5 group"
                      >
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 -ml-5 group-hover:opacity-40 group-hover:ml-0 transition-all" />
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
        <div className="pt-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-5">
            <span className="text-[11px] font-medium text-foreground/40 uppercase tracking-widest">
              &copy; {new Date().getFullYear()} Volvox LLC
            </span>
            <div className="h-[1px] w-6 bg-border/40" />
            <div className="status-indicator flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
              <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">
                Status: Nominal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
              <Cpu className="w-3.5 h-3.5 text-foreground" />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                Node_v{WEB_APP_VERSION}
              </span>
            </div>
            <div className="flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
              <Activity className="w-3.5 h-3.5 text-foreground" />
              <span className="text-[10px] uppercase tracking-widest font-bold">Latency: 12ms</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
