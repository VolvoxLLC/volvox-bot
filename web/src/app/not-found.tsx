import { ArrowLeft, Gauge, Home, Radio, Search, ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: '404 - Page Not Found',
  description: 'The requested Volvox.Bot page could not be found.',
};

const diagnostics = [
  ['ROUTE_PACKET', 'NULL_DESTINATION'],
  ['BOT_CONFIDENCE', 'ABSOLUTELY GUESSING'],
  ['LAST_SEEN', '#probably-somewhere'],
];

/**
 * Renders the 404 "Page not found" interface for a missing channel, including navigation actions and a diagnostic inspector.
 *
 * @returns The React element for the not-found page layout.
 */
export default function NotFoundPage() {
  return (
    <main
      aria-label="Page not found"
      className="relative isolate flex min-h-screen overflow-hidden bg-background text-foreground"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[linear-gradient(to_right,hsl(var(--border)/0.26)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.18)_1px,transparent_1px)] bg-[size:44px_44px]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.14),transparent_46%),linear-gradient(135deg,transparent_0_24%,hsl(var(--primary)/0.08)_24%_25%,transparent_25%_52%,hsl(var(--foreground)/0.05)_52%_53%,transparent_53%)]"
      />
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 -z-10 h-full w-px bg-gradient-to-b from-transparent via-primary/35 to-transparent"
      />

      <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <div className="max-w-3xl">
          <Link
            href="/"
            className="mb-10 inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/50 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground shadow-sm backdrop-blur-xl transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            Volvox.Bot
          </Link>

          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-primary">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Channel missing
          </div>

          <h1 className="font-mono text-[clamp(5rem,22vw,15rem)] font-black leading-[0.78] tracking-normal text-foreground">
            404
          </h1>

          <div className="mt-7 max-w-2xl space-y-4">
            <p className="text-2xl font-black tracking-normal text-foreground sm:text-4xl">
              This channel does not exist.
            </p>
            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              The bot checked #general, #logs, and one suspiciously confident TODO. Nothing.
              Probably not your fault. Probably.
            </p>
          </div>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/">
                <Home className="h-4 w-4" aria-hidden="true" />
                Return home
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link href="/dashboard">
                <Gauge className="h-4 w-4" aria-hidden="true" />
                Open dashboard
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute -inset-6 -z-10 rotate-2 rounded-[2rem] border border-primary/15 bg-primary/5 blur-2xl"
          />
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/70 shadow-2xl shadow-foreground/5 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--neon-orange))]/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                dead-end inspector
              </span>
            </div>

            <div className="p-5 sm:p-7">
              <div className="rounded-[22px] border border-border/70 bg-background/70 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Search className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-primary">
                      trace complete
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Request entered the routing matrix, tripped over a missing slug, and is now
                      pretending that was always the plan.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {diagnostics.map(([label, value]) => (
                  <div
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/45 px-4 py-3"
                    key={label}
                  >
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                      {label}
                    </span>
                    <span className="text-right font-mono text-xs font-bold text-foreground">
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[22px] border border-primary/20 bg-primary/10 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                    suggested command
                  </span>
                  <ArrowLeft className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <code className="block overflow-x-auto rounded-2xl border border-border/60 bg-background/80 px-4 py-3 font-mono text-sm text-foreground">
                  /summon volvox --somewhere-real
                </code>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
