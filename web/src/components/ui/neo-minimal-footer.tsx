import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { siDiscord, siX } from 'simple-icons';
import { GithubIcon } from '@/components/ui/github-icon';
import { SimpleIcon } from '@/components/ui/simple-icon';

interface FooterLink {
  label: string;
  href: string;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

type NeoMinimalFooterProps = Readonly<{
  sections?: FooterSection[];
}>;

const defaultSections: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Dashboard', href: '/login' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: 'https://docs.volvox.bot' },
      { label: 'GitHub', href: 'https://github.com/VolvoxLLC' },
      { label: 'Support Server', href: 'https://discord.gg/8ahXACdamN' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: 'https://volvox.dev' },
      { label: 'LinkedIn', href: 'https://www.linkedin.com/company/volvoxllc/' },
    ],
  },
];

/**
 * Neo-minimal footer with grid pattern background, newsletter input,
 * link columns, social icons, and a system status indicator.
 */
export function NeoMinimalFooter({ sections = defaultSections }: NeoMinimalFooterProps) {
  return (
    <footer className="max-w-7xl mx-auto border-t rounded-t-lg border-card/10 flex flex-wrap pt-16 pb-8 relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/20">
      {/* Inline keyframes for glow-pulse (avoids touching globals.css) */}
      <style>{`
        @keyframes footer-glow-pulse {
          0%, 100% { opacity: 0.3; transform: scaleX(0.5); }
          50% { opacity: 1; transform: scaleX(1); }
        }
      `}</style>

      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-primary/[0.02]" />

      {/* Animated shimmer sweep */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/[0.04] to-transparent animate-[shimmer_8s_ease-in-out_infinite] [animation-delay:2s]" />
      </div>

      {/* Background grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--foreground)/0.02)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground)/0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(circle_at_center,black,transparent_80%)]" />

      {/* Animated top border glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-[footer-glow-pulse_4s_ease-in-out_infinite]" />

      <div className="max-w-6xl mx-auto px-6 relative z-10 w-full">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8 mb-16">
          {/* Brand column */}
          <div className="col-span-1 md:col-span-5 flex flex-col gap-6">
            <div className="flex items-center gap-2.5">
              <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-white/10 shadow-md">
                <Image
                  src="/icon-192.png"
                  alt="Volvox Logo"
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              </div>
              <span className="text-2xl font-black tracking-tighter text-foreground font-[family-name:var(--font-mono)]">
                Volvox
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              AI-powered Discord bot with smart moderation, analytics, and a dashboard that actually
              works. Built for speed.
            </p>

            {/* Newsletter input */}
            <div className="flex items-center gap-2 mt-2 group">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="email"
                  placeholder="Enter your email..."
                  aria-label="Email address for newsletter"
                  className="w-full bg-foreground/5 border border-border/40 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <button
                type="button"
                disabled
                aria-label="Subscribe to newsletter (coming soon)"
                className="p-2.5 bg-primary rounded-lg text-primary-foreground opacity-50 cursor-not-allowed transition-colors"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>

          {/* Link columns */}
          {sections.map((section) => (
            <div key={section.title} className="col-span-1 md:col-span-2 flex flex-col gap-4">
              <h4 className="text-xs font-[family-name:var(--font-mono)] font-semibold text-foreground/70 uppercase tracking-widest">
                {section.title}
              </h4>
              <ul className="flex flex-col gap-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm font-[family-name:var(--font-mono)] text-muted-foreground hover:text-primary transition-colors flex items-center group w-fit relative pl-5"
                    >
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-muted/90 group-hover:bg-primary group-hover:w-4 transition-all duration-200" />
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8 border-t border-border/20">
          <p className="text-xs text-muted-foreground/60 font-[family-name:var(--font-mono)]">
            &copy; {new Date().getFullYear()} Volvox LLC. Not affiliated with Discord.
          </p>

          <div className="flex items-center gap-6">
            {/* Socials */}
            <div className="flex gap-4 border-r border-border/20 pr-6 mr-2">
              <a
                href="https://github.com/VolvoxLLC"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <GithubIcon className="w-[18px] h-[18px]" />
              </a>
              <a
                href="https://discord.gg/8ahXACdamN"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label="Discord"
              >
                <SimpleIcon path={siDiscord.path} className="w-[18px] h-[18px]" />
              </a>
              <a
                href="https://x.com/volvoxdev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label="X (Twitter)"
              >
                <SimpleIcon path={siX.path} className="w-[18px] h-[18px]" />
              </a>
              <a
                href="https://www.linkedin.com/company/volvoxllc/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label="LinkedIn"
              >
                <span className="sr-only">LinkedIn</span>
                <svg
                  className="w-[18px] h-[18px]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>

            {/* Status */}
            <a
              href="https://status.volvox.bot"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] uppercase font-medium text-primary/80 tracking-wider">
                Status
              </span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
