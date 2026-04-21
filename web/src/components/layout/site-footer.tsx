import Link from 'next/link';
import { GithubIcon } from '@/components/ui/github-icon';

const footerLinks = [
  {
    label: 'Source Code',
    href: 'https://github.com/VolvoxLLC',
    external: true,
  },
  {
    label: 'About Volvox.Bot',
    href: 'https://volvox.bot',
    external: true,
  },
  {
    label: 'Documentation',
    href: 'https://docs.volvox.bot',
    external: true,
  },
  {
    label: 'Privacy Policy',
    href: '/privacy',
    external: false,
  },
  {
    label: 'Terms of Service',
    href: '/terms',
    external: false,
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-border/30 bg-background/50">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-6 py-8">
        {/* Links */}
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {footerLinks.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

        {/* Brand + social */}
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/40">
            © {new Date().getFullYear()} Volvox LLC
          </span>
          <a
            href="https://github.com/VolvoxLLC"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-muted-foreground/40 transition-colors hover:text-foreground"
          >
            <GithubIcon className="h-4 w-4" />
          </a>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/30">
          Volvox.Bot is not affiliated with Discord Inc.
        </p>
      </div>
    </footer>
  );
}
