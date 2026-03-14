'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FeatureGrid, Footer, Hero, InviteButton, Pricing, Stats } from '@/components/landing';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
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
              <a
                href="#features"
                className="text-[0.9rem] font-medium text-[var(--text-primary)] opacity-60 hover:opacity-100 rounded-full px-4 py-2 hover:bg-[hsl(var(--foreground)/0.05)] transition-all"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="text-[0.9rem] font-medium text-[var(--text-primary)] opacity-60 hover:opacity-100 rounded-full px-4 py-2 hover:bg-[hsl(var(--foreground)/0.05)] transition-all"
              >
                Pricing
              </a>
              <a
                href="https://docs.volvox.bot"
                className="text-[0.9rem] font-medium text-[var(--text-primary)] opacity-60 hover:opacity-100 rounded-full px-4 py-2 hover:bg-[hsl(var(--foreground)/0.05)] transition-all"
              >
                Docs
              </a>
              <a
                href="https://github.com/VolvoxLLC/volvox-bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.9rem] font-medium text-[var(--text-primary)] opacity-60 hover:opacity-100 rounded-full px-4 py-2 hover:bg-[hsl(var(--foreground)/0.05)] transition-all"
              >
                GitHub
              </a>
            </div>
          </nav>

          {/* Right actions */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" size="sm" className="rounded-full" asChild>
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
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Features
              </button>
              <button
                type="button"
                className="text-left text-sm font-medium text-[var(--text-primary)] opacity-70 hover:opacity-100 rounded-xl px-4 py-3 hover:bg-muted transition-all"
                onClick={() => {
                  setMobileMenuOpen(false);
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Pricing
              </button>
              <a
                href="https://docs.volvox.dev"
                className="text-sm font-medium text-[var(--text-primary)] opacity-70 hover:opacity-100 rounded-xl px-4 py-3 hover:bg-muted transition-all"
              >
                Docs
              </a>
              <a
                href="https://github.com/VolvoxLLC/volvox-bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[var(--text-primary)] opacity-70 hover:opacity-100 rounded-xl px-4 py-3 hover:bg-muted transition-all"
              >
                GitHub
              </a>
              <div className="flex items-center gap-3 pt-3 mt-2 border-t border-[var(--border-default)]">
                <ThemeToggle />
                <Button variant="outline" size="sm" className="rounded-full" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
                <InviteButton size="sm" />
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <Hero />

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
