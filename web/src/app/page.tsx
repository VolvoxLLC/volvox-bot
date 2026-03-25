'use client';

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FeatureGrid, Footer, Hero, InviteButton, Pricing } from '@/components/landing';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

// Below-fold sections lazy-loaded for performance
const DashboardShowcase = dynamic(
  () =>
    import('@/components/landing/DashboardShowcase').then((m) => ({
      default: m.DashboardShowcase,
    })),
  { ssr: false },
);
const ComparisonTable = dynamic(
  () =>
    import('@/components/landing/ComparisonTable').then((m) => ({ default: m.ComparisonTable })),
  { ssr: false },
);
const Stats = dynamic(
  () => import('@/components/landing/Stats').then((m) => ({ default: m.Stats })),
  { ssr: false },
);

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const shouldReduceMotion = useReducedMotion() ?? false;
  const { scrollY, scrollYProgress } = useScroll();
  const progressScaleX = useSpring(scrollYProgress, {
    damping: 32,
    mass: 0.22,
    stiffness: 180,
  });
  const progressOpacity = useTransform(scrollY, [0, 120], [0, 1]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /** Smooth-scroll to a section with offset for the fixed navbar. */
  const scrollToSection = useCallback(
    (id: string) => {
      const element = document.getElementById(id);
      if (!element) return;
      const navbarHeight = 100;
      const top = element.getBoundingClientRect().top + window.scrollY - navbarHeight;
      window.scrollTo({ top, behavior: shouldReduceMotion ? 'auto' : 'smooth' });
    },
    [shouldReduceMotion],
  );

  return (
    <div className="flex min-h-screen flex-col">
      {!shouldReduceMotion && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] bg-foreground/10"
        >
          <motion.div
            className="h-full origin-left bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_12px_hsl(var(--secondary)/0.35)]"
            style={{ opacity: progressOpacity, scaleX: progressScaleX }}
          />
        </div>
      )}

      {/* Noise overlay */}
      <div className="noise" />

      {/* Floating Island Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4">
        <div
          className={`flex items-center justify-between transition-all duration-500 ${
            scrolled
              ? 'nav-island mt-4 w-[90%] max-w-[850px] py-3 px-5'
              : 'w-full max-w-full py-5 px-8 bg-transparent border-b border-transparent'
          }`}
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm font-[family-name:var(--font-mono)]">
              V
            </div>
            <span className="font-bold text-lg font-[family-name:var(--font-mono)] text-[var(--text-primary)]">
              Volvox
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center">
            <div className={`flex items-center ${scrolled ? 'nav-links-pill' : 'gap-1'}`}>
              <button
                type="button"
                onClick={() => scrollToSection('features')}
                className="text-[0.9rem] font-medium text-[var(--text-primary)] opacity-60 hover:opacity-100 rounded-full px-4 py-2 hover:bg-[hsl(var(--foreground)/0.05)] transition-all"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('pricing')}
                className="text-[0.9rem] font-medium text-[var(--text-primary)] opacity-60 hover:opacity-100 rounded-full px-4 py-2 hover:bg-[hsl(var(--foreground)/0.05)] transition-all"
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('dashboard')}
                className="text-[0.9rem] font-medium text-[var(--text-primary)] opacity-60 hover:opacity-100 rounded-full px-4 py-2 hover:bg-[hsl(var(--foreground)/0.05)] transition-all"
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('compare')}
                className="text-[0.9rem] font-medium text-[var(--text-primary)] opacity-60 hover:opacity-100 rounded-full px-4 py-2 hover:bg-[hsl(var(--foreground)/0.05)] transition-all"
              >
                Compare
              </button>
            </div>
          </nav>

          {/* Right actions */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-secondary/25 text-secondary font-semibold hover:bg-secondary hover:text-secondary-foreground hover:border-secondary hover:shadow-[0_0_12px_-3px] hover:shadow-secondary/25 transition-all"
              asChild
            >
              <Link href="/login">Sign In</Link>
            </Button>
            <InviteButton size="sm" />
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
          >
            {mobileMenuOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <title>Close menu</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <title>Open menu</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div
            id="mobile-nav"
            className="md:hidden fixed inset-x-4 top-20 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-default)] shadow-xl backdrop-blur-lg z-50"
          >
            <nav className="p-4 flex flex-col gap-1">
              <button
                type="button"
                className="text-left text-sm font-medium text-[var(--text-primary)] opacity-70 hover:opacity-100 rounded-xl px-4 py-3 hover:bg-muted transition-all"
                onClick={() => {
                  setMobileMenuOpen(false);
                  scrollToSection('features');
                }}
              >
                Features
              </button>
              <button
                type="button"
                className="text-left text-sm font-medium text-[var(--text-primary)] opacity-70 hover:opacity-100 rounded-xl px-4 py-3 hover:bg-muted transition-all"
                onClick={() => {
                  setMobileMenuOpen(false);
                  scrollToSection('pricing');
                }}
              >
                Pricing
              </button>
              <button
                type="button"
                className="text-left text-sm font-medium text-[var(--text-primary)] opacity-70 hover:opacity-100 rounded-xl px-4 py-3 hover:bg-muted transition-all"
                onClick={() => {
                  setMobileMenuOpen(false);
                  scrollToSection('dashboard');
                }}
              >
                Dashboard
              </button>
              <button
                type="button"
                className="text-left text-sm font-medium text-[var(--text-primary)] opacity-70 hover:opacity-100 rounded-xl px-4 py-3 hover:bg-muted transition-all"
                onClick={() => {
                  setMobileMenuOpen(false);
                  scrollToSection('compare');
                }}
              >
                Compare
              </button>
              <div className="flex items-center gap-3 pt-3 mt-2 border-t border-[var(--border-default)]">
                <ThemeToggle />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-secondary/25 text-secondary font-semibold hover:bg-secondary hover:text-secondary-foreground hover:border-secondary hover:shadow-[0_0_12px_-3px] hover:shadow-secondary/25 transition-all"
                  asChild
                >
                  <Link href="/login">Sign In</Link>
                </Button>
                <InviteButton size="sm" />
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Page Flow: Hero → Dashboard Preview → Comparison → Features → Pricing → Stats → Footer */}

      {/* Hero Section */}
      <Hero />

      {/* Dashboard Showcase */}
      <DashboardShowcase />

      {/* Competitor Comparison */}
      <div id="compare">
        <ComparisonTable />
      </div>

      {/* Features Section */}
      <div id="features">
        <FeatureGrid />
      </div>

      {/* Pricing Section */}
      <div id="pricing">
        <Pricing />
      </div>

      {/* Stats / Testimonials Section */}
      <Stats />

      {/* Footer CTA */}
      <Footer />
    </div>
  );
}
