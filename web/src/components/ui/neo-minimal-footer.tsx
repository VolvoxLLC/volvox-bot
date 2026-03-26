import { ArrowRight } from 'lucide-react';
import { siDiscord, siX } from 'simple-icons';
import { GithubIcon } from '@/components/ui/github-icon';

/** Inline SVG helper for simple-icons. */
function SimpleIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

interface FooterLink {
  label: string;
  href: string;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

interface NeoMinimalFooterProps {
  sections?: FooterSection[];
}

const defaultSections: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Dashboard', href: '/login' },
      { label: 'Self-Host', href: 'https://docs.volvox.bot' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: 'https://docs.volvox.bot' },
      { label: 'GitHub', href: 'https://github.com/VolvoxLLC/volvox-bot' },
      { label: 'Support Server', href: 'https://discord.gg/8ahXACdamN' },
    ],
  },
  {
    title: 'Company',
    links: [{ label: 'Open Source', href: 'https://github.com/VolvoxLLC' }],
  },
];

/**
 * Neo-minimal footer with grid pattern background, newsletter input,
 * link columns, social icons, and a system status indicator.
 */
export function NeoMinimalFooter({ sections = defaultSections }: NeoMinimalFooterProps) {
  return (
    <footer className="max-w-7xl mx-auto bg-card/10 border-t rounded-t-lg border-card/10 flex flex-wrap pt-16 pb-8 relative overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--foreground)/0.02)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground)/0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(circle_at_center,black,transparent_80%)]" />

      <div className="max-w-6xl mx-auto px-6 relative z-10 w-full">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8 mb-16">
          {/* Brand column */}
          <div className="col-span-1 md:col-span-5 flex flex-col gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm font-[family-name:var(--font-mono)]">
                V
              </div>
              <span className="text-2xl font-bold tracking-tighter text-foreground font-[family-name:var(--font-mono)]">
                Volvox
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              Open-source Discord bot with AI chat, moderation, and a dashboard that actually works.
              Built for speed. Free forever.
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
                href="https://github.com/VolvoxLLC/volvox-bot"
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
                href="https://x.com/volvoxbot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label="X (Twitter)"
              >
                <SimpleIcon path={siX.path} className="w-[18px] h-[18px]" />
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
