'use client';

import { motion } from 'framer-motion';
import { BookOpen, Github, Heart, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBotInviteUrl } from '@/lib/discord';

export function Footer() {
  return (
    <footer className="py-20 px-4 sm:px-6 lg:px-8 bg-[var(--bg-primary)] border-t border-[var(--border-default)]">
      <div className="max-w-4xl mx-auto text-center">
        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold font-mono text-[var(--text-primary)] mb-6">
            Ready to upgrade your server?
          </h2>
          <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-2xl mx-auto">
            Join thousands of developers who've switched from MEE6, Dyno, and Carl-bot. Your
            community deserves better.
          </p>
          <Button
            size="lg"
            className="font-mono text-lg px-8 py-6 bg-[var(--accent-success)] hover:bg-[var(--accent-success)]/90 text-white"
            asChild
          >
            <a href={getBotInviteUrl() || '#'} target="_blank" rel="noopener noreferrer">
              Add to Discord — Free
            </a>
          </Button>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-[var(--text-muted)] mb-12 font-mono"
        >
          Open source. Self-hostable. Free forever.
        </motion.p>

        {/* Links */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap justify-center gap-6 mb-12"
        >
          <a
            href="https://docs.volvox.dev"
            className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Documentation
          </a>
          <a
            href="https://github.com/VolvoxLLC/volvox-bot"
            className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
          <a
            href="https://discord.gg/volvox"
            className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
          >
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
          className="pt-8 border-t border-[var(--border-muted)]"
        >
          <p className="text-sm text-[var(--text-muted)] flex items-center justify-center gap-1">
            Made with <Heart className="w-4 h-4 text-red-500 fill-red-500" /> by developers, for
            developers
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            © {new Date().getFullYear()} Volvox. Not affiliated with Discord.
          </p>
        </motion.div>
      </div>
    </footer>
  );
}
