'use client';

import { useGSAP } from '@gsap/react';
import { motion } from 'framer-motion';
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
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)
          `,
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
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
      className="relative w-full bg-background pt-24 pb-12 overflow-hidden border-t border-border/50"
    >
      <FooterBackground />

      <div ref={contentRef} className="relative z-10 max-w-6xl mx-auto px-6 opacity-0">
        {/* ─── CTA MODULE ─── */}
        <div className="mb-32">
          <div className="bg-card border border-border/80 relative overflow-hidden rounded-[2.5rem] p-10 md:p-20 shadow-sm flex flex-col items-center text-center">
            
            {/* Tactical Badge */}
            <div className="flex items-center gap-4 mb-8">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-foreground/40">
                [SYSTEM_READY]
              </span>
            </div>

            <h2 className="text-4xl md:text-6xl font-black tracking-tight text-foreground mb-6 leading-tight">
              Your community, <br />
              <span className="text-foreground/40">re-engineered.</span>
            </h2>

            <p className="text-base text-foreground/50 max-w-xl font-medium leading-relaxed mb-12">
              Deploy the absolute synthesis of AI intelligence and community governance.
              Experience the next generation of Discord management.
            </p>

            {/* Action Node */}
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              {botInviteUrl ? (
                <Link
                  href={botInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative px-8 py-4 w-full sm:w-auto rounded-xl bg-foreground text-background font-bold tracking-wide text-sm flex items-center justify-center gap-3 transition-transform hover:scale-[1.02] active:scale-95 shadow-sm"
                >
                  <Zap className="w-4 h-4 fill-current opacity-80" />
                  <span>Initialize Bot</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 opacity-70" />
                </Link>
              ) : (
                <div className="px-8 py-4 rounded-xl bg-muted border border-border text-foreground/40 font-mono text-[11px] tracking-widest uppercase inline-block">
                  [OVERSIGHT_LOCKED]
                </div>
              )}

              <Link
                href="/login"
                className="px-8 py-4 w-full sm:w-auto rounded-xl border border-border/60 bg-background text-foreground font-bold tracking-wide text-sm flex items-center justify-center gap-3 transition-colors hover:bg-muted"
              >
                <Terminal className="w-4 h-4 opacity-70" />
                <span>Dashboard</span>
              </Link>
            </div>

            {/* Tactical ID */}
            <div className="absolute bottom-6 right-8 text-[9px] font-mono text-foreground/20 tracking-[0.2em] hidden md:block">
              BUILD_REF: VOLVOX_2.4.0_STABLE
            </div>
          </div>
        </div>

        {/* ─── NAVIGATION GRID ─── */}
        <div className="footer-nav-grid grid grid-cols-1 lg:grid-cols-12 gap-16 pb-16 border-b border-border/30">
          {/* Brand Info */}
          <div className="footer-link-col lg:col-span-4 space-y-6">
            <Link href="/" className="flex items-center gap-4 group w-fit">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-border/80 shadow-sm transition-transform group-hover:rotate-6 bg-card">
                <Image
                  src="/icon-192.png"
                  alt="Volvox"
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
              <div>
                <span className="text-xl font-black tracking-tight uppercase block leading-none text-foreground">
                  Volvox
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
                  rel="noopener noreferrer"
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
                Node_v2.4
              </span>
            </div>
            <div className="flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
              <Activity className="w-3.5 h-3.5 text-foreground" />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                Latency: 12ms
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
