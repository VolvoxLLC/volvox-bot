'use client';

import Link from 'next/link';
import { FeatureGrid, Footer, Hero, InviteButton, Pricing, Stats } from '@/components/landing';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
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
          <nav className="flex items-center gap-4">
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
        </div>
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
