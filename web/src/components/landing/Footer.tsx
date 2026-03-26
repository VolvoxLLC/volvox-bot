'use client';

import { motion } from 'framer-motion';
import { GetStartedButton } from '@/components/ui/get-started-button';
import { NeoMinimalFooter } from '@/components/ui/neo-minimal-footer';
import { getBotInviteUrl } from '@/lib/discord';
import { ScrollStage } from './ScrollStage';

export function Footer() {
  const botInviteUrl = getBotInviteUrl();

  return (
    <section aria-label="Footer" className="relative overflow-hidden">
      {/* CTA Section */}
      <div className="py-24 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60vw] h-[300px] hero-glow pointer-events-none" />

        <ScrollStage className="max-w-4xl mx-auto text-center relative" enterOffset={30}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground mb-6">
              Ready to <span className="text-aurora">upgrade</span>?
            </h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Your community deserves smarter moderation, AI-powered chat, and a dashboard that
              actually works.
            </p>
            {botInviteUrl ? (
              <GetStartedButton
                variant="discord"
                href={botInviteUrl}
                className="rounded-full h-14 px-12 font-bold text-sm tracking-widest uppercase shadow-lg shadow-[var(--color-discord)]/20"
              />
            ) : (
              <GetStartedButton
                variant="discord"
                label="Coming Soon"
                disabled
                className="rounded-full h-14 px-12 font-bold text-sm tracking-widest uppercase opacity-50"
              />
            )}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-muted-foreground font-[family-name:var(--font-mono)] text-sm mb-12"
          >
            Open source. Self-hostable. Free forever.
          </motion.p>
        </ScrollStage>
      </div>

      {/* Neo-minimal footer */}
      <NeoMinimalFooter />
    </section>
  );
}
