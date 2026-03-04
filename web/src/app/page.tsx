'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FeatureGrid, Footer, Hero, InviteButton, Pricing, Stats } from '@/components/landing';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-[var(--border-default)] bg-[var(--bg-primary)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--bg-primary)]/60">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-primary)] text-white font-bold text-sm font-mono">
              V
            </div>
            <span className="font-bold text-lg font-mono text-[var(--text-primary)]">
              volvox-bot
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-4">
            <a
              href="#features"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Pricing
            </a>
            <a
              href="https://docs.volvox.dev"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Docs
            </a>
            <a
              href="https://github.com/VolvoxLLC/volvox-bot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              GitHub
            </a>
            <ThemeToggle />
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <InviteButton size="sm" />
          </nav>

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
          <div id="mobile-nav" className="md:hidden border-t border-[var(--border-default)] bg-[var(--bg-primary)]">
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-3">
              <button
                type="button"
                className="text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2"
                onClick={() => {
                  setMobileMenuOpen(false);
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Features
              </button>
              <button
                type="button"
                className="text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2"
                onClick={() => {
                  setMobileMenuOpen(false);
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Pricing
              </button>
              <a
                href="https://docs.volvox.dev"
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2"
              >
                Docs
              </a>
              <a
                href="https://github.com/VolvoxLLC/volvox-bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2"
              >
                GitHub
              </a>
              <div className="flex items-center gap-3 pt-2 border-t border-[var(--border-default)]">
                <ThemeToggle />
                <Button variant="outline" size="sm" asChild>
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
