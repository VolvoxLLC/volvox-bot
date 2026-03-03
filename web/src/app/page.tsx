'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import { Hero, FeatureGrid, Pricing, Stats, Footer } from '@/components/landing';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { getBotInviteUrl } from '@/lib/discord';

/** Render an "Add to Server" button — disabled/hidden when CLIENT_ID is unset. */
function InviteButton({ size = 'sm', className }: { size?: 'sm' | 'lg'; className?: string }) {
  const url = getBotInviteUrl();
  if (!url) return null;
  return (
    <Button variant="discord" size={size} className={className} asChild>
      <a href={url} target="_blank" rel="noopener noreferrer">
        {size === 'lg' && <Bot className="mr-2 h-5 w-5" />}
        Add to Server
      </a>
    </Button>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-[var(--border-default)] bg-[var(--bg-primary)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--bg-primary)]/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-primary)] text-white font-bold text-sm font-mono">
              V
            </div>
            <span className="font-bold text-lg font-mono text-[var(--text-primary)]">volvox-bot</span>
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
