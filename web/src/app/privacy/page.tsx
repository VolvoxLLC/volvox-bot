import type { Metadata } from 'next';
import Link from 'next/link';
import { createPageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = createPageMetadata(
  'Privacy Policy',
  'Read the Volvox.Bot Privacy Policy covering Discord data, AI processing, retention periods, third-party services, and user privacy controls.',
);

const sectionHeadingClassName = 'text-xl font-semibold text-foreground';
const subheadingClassName = 'text-sm font-medium text-muted-foreground/60';
const bodyClassName = 'text-sm leading-7 text-muted-foreground';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto flex max-w-4xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-20">
        <header className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground/60">Effective: April 18, 2026</p>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              This Privacy Policy explains how Volvox LLC collects, uses, stores, and shares
              information when you use Volvox.Bot, the Volvox.Bot dashboard, and related support
              services. It also explains the choices available to server owners, moderators, and end
              users.
            </p>
          </div>
        </header>

        <section className="space-y-4">
          <h2 className={sectionHeadingClassName}>Information We Collect</h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Discord and account data</h3>
              <p className={bodyClassName}>
                We collect information needed to operate the bot and dashboard, including Discord
                user IDs, usernames, guild IDs, channel IDs, and message content processed through
                Volvox.Bot features. When voice features are enabled, we may also record session
                timestamps and duration.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Moderation and community records</h3>
              <p className={bodyClassName}>
                We store moderation case records, warnings, temporary role actions, user tags,
                moderator identity, ticket transcripts, showcases, reviews, poll votes, command
                usage, and engagement data such as XP or reputation where those features are used.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className={subheadingClassName}>AI interaction data</h3>
              <p className={bodyClassName}>
                If AI features are enabled, prompts and related context may be sent to supported AI
                providers, including Anthropic (Claude) and MiniMax. These prompts can include
                message content, usage metrics, and feedback submitted through the service.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Technical and security data</h3>
              <p className={bodyClassName}>
                We collect technical information needed to secure and operate the service, including
                IP addresses in audit logs, session tokens, and error or diagnostic data sent to
                Sentry.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className={sectionHeadingClassName}>How We Use Information</h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Operate the service</h3>
              <p className={bodyClassName}>
                We use collected information to provide bot commands, moderation tooling, AI
                features, dashboards, ticket workflows, community engagement systems, analytics, and
                account access to authorized users.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Safety, abuse prevention, and enforcement</h3>
              <p className={bodyClassName}>
                We use moderation records, audit data, and technical logs to investigate abuse,
                protect communities, enforce our{' '}
                <Link
                  href="/terms"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  acceptable use
                </Link>{' '}
                rules, and maintain the integrity of the service.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Improve and support Volvox.Bot</h3>
              <p className={bodyClassName}>
                We may use usage metrics, feedback, and error reports to diagnose issues, improve
                reliability, evaluate feature adoption, and support customers and server staff.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className={sectionHeadingClassName}>Third Parties</h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Service providers and integrations</h3>
              <p className={bodyClassName}>
                We share data with third parties only as needed to provide the service. This may
                include Discord for bot and account functionality, Anthropic and MiniMax for AI
                processing, Sentry for error monitoring, and guild-configured webhooks or
                integrations enabled by server administrators.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Administrator-controlled destinations</h3>
              <p className={bodyClassName}>
                Server administrators may configure Volvox.Bot to post content, moderation events,
                or transcripts to channels, dashboards, or webhooks they control. Those destinations
                are governed by the administrator&apos;s own settings and policies.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className={sectionHeadingClassName}>Data Retention</h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Retention periods</h3>
              <p className={bodyClassName}>
                We retain audit log entries for 90 days, AI conversation data for up to 30 days, and
                moderation records on a persistent basis unless deletion is required by law or
                approved by the relevant administrator workflow. Other operational records may be
                retained for as long as needed to provide the service, resolve disputes, or comply
                with legal obligations.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Backups and legal requirements</h3>
              <p className={bodyClassName}>
                Deleted or expired data may remain in backups for a limited period or be preserved
                where necessary for security, fraud prevention, legal compliance, or defense of
                claims.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className={sectionHeadingClassName}>Your Rights</h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Controls in the product</h3>
              <p className={bodyClassName}>
                Where supported, users can control certain privacy settings directly. For example,
                memory-related AI opt-outs may be managed through <code>memory_optouts</code>, and
                public leaderboard visibility may be limited using the <code>public_profile</code>{' '}
                setting.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className={subheadingClassName}>Access, correction, and deletion requests</h3>
              <p className={bodyClassName}>
                Depending on your location and role, you may request access to, correction of, or
                deletion of certain personal information. Some records, such as moderation history
                or security logs, may be retained where necessary to protect communities, enforce
                policies, or comply with law.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className={sectionHeadingClassName}>Children&apos;s Privacy</h2>
          <div className="space-y-2">
            <h3 className={subheadingClassName}>Discord platform age requirements</h3>
            <p className={bodyClassName}>
              Volvox.Bot is intended for users who are old enough to use Discord under
              Discord&apos;s rules, which generally means age 13 or older, subject to local law. We
              do not knowingly design the service for children below that age threshold.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className={sectionHeadingClassName}>Security</h2>
          <div className="space-y-2">
            <h3 className={subheadingClassName}>Protection measures</h3>
            <p className={bodyClassName}>
              We use reasonable technical and organizational measures to protect information,
              including access controls, authentication, logging, and monitoring. No system is
              perfectly secure, and we cannot guarantee absolute security.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className={sectionHeadingClassName}>Changes</h2>
          <div className="space-y-2">
            <h3 className={subheadingClassName}>Policy updates</h3>
            <p className={bodyClassName}>
              We may update this Privacy Policy from time to time. If we make material changes, we
              will revise the effective date above and may provide additional notice through the
              website, dashboard, or other reasonable channels.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className={sectionHeadingClassName}>Contact</h2>
          <div className="space-y-2">
            <h3 className={subheadingClassName}>Questions and requests</h3>
            <p className={bodyClassName}>
              Volvox LLC
              <br />
              <a
                className="font-medium text-primary underline-offset-4 hover:underline"
                href="mailto:support@volvox.bot"
              >
                support@volvox.bot
              </a>
            </p>
          </div>
        </section>

        <footer className="rounded-2xl border border-border/60 bg-muted/30 p-4">
          <p className="text-sm leading-7 text-muted-foreground">
            Note: This Privacy Policy was generated with AI assistance and should be reviewed by
            legal counsel before production use.
          </p>
        </footer>
      </div>
    </main>
  );
}
