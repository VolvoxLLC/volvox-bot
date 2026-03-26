'use client';

import { motion } from 'framer-motion';
import { GetStartedButton } from '@/components/ui/get-started-button';
import { NeoMinimalFooter } from '@/components/ui/neo-minimal-footer';
import { getBotInviteUrl } from '@/lib/discord';
import { ScrollStage } from './ScrollStage';

export function Footer() {
  const botInviteUrl = getBotInviteUrl();

  return (
    <section aria-label="Footer" className="relative overflow-hidden bg-[var(--background)]">
      {/* Cinematic CTA Section */}
      <div className="py-32 px-4 sm:px-6 lg:px-8 relative">
        {/* Immersive Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[100vw] h-[100%] bg-gradient-to-b from-[hsl(var(--primary))]/5 via-transparent to-transparent blur-[120px] pointer-events-none" />

        <ScrollStage className="max-w-5xl mx-auto text-center relative z-10" enterOffset={40}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mb-16"
          >
            <div className="inline-flex items-center py-2 px-5 rounded-full bg-white/[0.03] text-[hsl(var(--primary))] text-[10px] font-black uppercase tracking-[0.3em] mb-10 border border-white/10 backdrop-blur-xl">
              Ready for the future?
            </div>

            <h2 className="text-5xl md:text-8xl font-black tracking-tight text-[hsl(var(--foreground))] mb-8 leading-[0.9]">
              Elevate your <br />
              <span className="text-aurora">community.</span>
            </h2>

            <p className="text-xl text-[hsl(var(--foreground))]/40 mb-14 max-w-2xl mx-auto font-medium leading-relaxed balance">
              Experience the synthesis of AI intelligence and community management. Modern,
              autonomous, and breathtakingly beautiful.
            </p>

            <div className="flex flex-col sm:flex-row gap-6 items-center justify-center">
              {botInviteUrl ? (
                <GetStartedButton
                  variant="discord"
                  label="Add to Discord"
                  href={botInviteUrl}
                  className="rounded-full h-16 px-14 font-black text-xs tracking-[0.2em] uppercase shadow-[0_20px_50px_hsla(var(--primary),0.3)] border border-[hsl(var(--primary))]/20 hover:scale-105 transition-transform"
                />
              ) : (
                <GetStartedButton
                  variant="discord"
                  label="Coming Soon"
                  disabled
                  className="rounded-full h-16 px-14 font-black text-xs tracking-[0.2em] uppercase opacity-40 grayscale"
                />
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.3 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.4 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-[hsl(var(--foreground))]/20 to-transparent" />
            <p className="text-[hsl(var(--foreground))] font-black tracking-[0.4em] uppercase text-[10px]">
              Synthesis of Intelligence
            </p>
          </motion.div>
        </ScrollStage>
      </div>

      {/* Standard Footer Links with premium touch */}
      <div className="border-t border-white/5 bg-black/20 backdrop-blur-md">
        <NeoMinimalFooter />
      </div>
    </section>
  );
}
