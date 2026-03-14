'use client';

import { motion } from 'framer-motion';
import { BookOpen, Github, Heart, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBotInviteUrl } from '@/lib/discord';

export function Footer() {
  const botInviteUrl = getBotInviteUrl();

  return (
    <footer className="relative py-24 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)] overflow-hidden">
      {/* Decorative blue glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60vw] h-[300px] hero-glow pointer-events-none" />

      <div className="max-w-4xl mx-auto text-center relative">
        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground mb-6">
            Ready to{' '}
            <span className="text-aurora">upgrade</span>
            ?
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Join thousands of developers who&apos;ve switched from MEE6, Dyno, and Carl-bot. Your
            community deserves better.
          </p>
          {botInviteUrl ? (
            <Button
              size="lg"
              className="rounded-full h-14 px-12 font-bold text-sm tracking-widest uppercase hover:scale-105 transition-transform shadow-lg shadow-primary/20"
              asChild
            >
              <a href={botInviteUrl} target="_blank" rel="noopener noreferrer">
                Add to Discord — Free
              </a>
            </Button>
          ) : (
            <Button
              size="lg"
              disabled
              className="rounded-full h-14 px-12 font-bold text-sm tracking-widest uppercase opacity-50"
            >
              Add to Discord — Coming Soon
            </Button>
          )}
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-muted-foreground mb-12 font-[family-name:var(--font-mono)] text-sm"
        >
          Open source. Self-hostable. Free forever.
        </motion.p>

        {/* Links */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap justify-center gap-8 mb-12"
        >
          <a href="https://docs.volvox.dev" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-medium">
            <BookOpen className="w-4 h-4" />
            Documentation
          </a>
          <a href="https://github.com/VolvoxLLC/volvox-bot" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-medium">
            <Github className="w-4 h-4" />
            GitHub
          </a>
          <a href="https://discord.gg/volvox" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-medium">
            <MessageCircle className="w-4 h-4" />
            Support Server
          </a>
        </motion.div>

        {/* Copyright */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="pt-8 border-t border-border"
        >
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
            Made with <Heart className="w-4 h-4 text-red-500 fill-red-500" /> by developers, for developers
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            © {new Date().getFullYear()} Volvox. Not affiliated with Discord.
          </p>
        </motion.div>
      </div>
    </footer>
  );
}
