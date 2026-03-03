'use client';

import { motion } from 'framer-motion';
import { Bot, MessageSquare, Shield, Sparkles, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import { Hero } from '@/components/landing/Hero';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getBotInviteUrl } from '@/lib/discord';

const features = [
  {
    icon: MessageSquare,
    title: 'AI Chat',
    description:
      'Powered by Claude via the Anthropic Agent SDK — natural conversations, context-aware responses, and intelligent triage-based model selection.',
  },
  {
    icon: Shield,
    title: 'Moderation',
    description:
      'Comprehensive moderation toolkit — warns, kicks, bans, timeouts, tempbans with full case tracking and mod logs.',
  },
  {
    icon: Users,
    title: 'Welcome Messages',
    description: 'Dynamic, AI-generated welcome messages that make every new member feel special.',
  },
  {
    icon: Zap,
    title: 'Spam Detection',
    description: 'Automatic spam and scam detection to keep your community safe.',
  },
  {
    icon: Sparkles,
    title: 'Runtime Config',
    description:
      'Configure everything on the fly — no restarts needed. Database-backed config with slash command management.',
  },
  {
    icon: Bot,
    title: 'Web Dashboard',
    description:
      'This dashboard — manage your bot settings, view mod logs, and configure your server from any device.',
  },
];

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
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-discord text-white font-bold text-sm">
              V
            </div>
            <span className="font-bold text-lg font-mono">volvox-bot</span>
          </div>
          <nav className="flex items-center gap-4">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <InviteButton size="sm" />
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <Hero />

      {/* Features */}
      <section className="container py-16 md:py-24">
        <div className="text-center mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold tracking-tight sm:text-4xl font-mono"
          >
            <span className="text-terminal-green">&gt;</span> Features
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-muted-foreground text-lg"
          >
            A full-featured Discord bot with a modern web dashboard.
          </motion.p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="h-full transition-all hover:border-discord/50 hover:shadow-lg hover:-translate-y-1">
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-discord/10 text-discord">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="mt-4">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/50">
        <div className="container flex flex-col items-center gap-6 py-16 md:py-24 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold tracking-tight font-mono"
          >
            <span className="text-terminal-green">&gt;</span> Ready to get started?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="max-w-[32rem] text-muted-foreground"
          >
            Add Volvox Bot to your Discord server and manage everything from this dashboard.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <InviteButton size="lg" className="gap-2" />
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground font-mono">
            © {new Date().getFullYear()} volvox-bot. Built for the Volvox community.
          </p>
          <nav className="flex gap-4">
            <a
              href="https://github.com/VolvoxLLC/volvox-bot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://discord.gg/volvox"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Discord
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
