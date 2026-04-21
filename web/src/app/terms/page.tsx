import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | Volvox.Bot',
  description:
    'Terms governing use of Volvox.Bot, including its Discord bot, moderation tools, AI features, dashboard, and related services.',
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-24">
      <h1 className="text-4xl font-black tracking-tight text-foreground">Terms of Service</h1>
      <p className="text-sm font-medium text-muted-foreground/60">Effective: April 18, 2026</p>
      <p className="text-muted-foreground">
        These Terms of Service govern your access to and use of Volvox.Bot, including our Discord
        bot, website, dashboard, moderation features, webhook integrations, and related services
        (collectively, the &ldquo;Service&rdquo;). By using the Service, you agree to these Terms.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Acceptance of Terms</h2>
        <p className="text-muted-foreground">
          By inviting Volvox.Bot to a Discord server, signing in through our website, accessing the
          dashboard, or otherwise using the Service, you represent that you have the authority to
          accept these Terms for yourself and, where applicable, for the server, organization, or
          community you manage. If you do not agree to these Terms, do not use the Service.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Description of Service</h2>
        <p className="text-muted-foreground">
          Volvox.Bot is an AI-powered Discord bot and management platform that may provide features
          such as moderation automation, AI chat, dynamic welcome flows, spam detection, server
          management controls, a web dashboard, and configurable notification webhooks. Features may
          change over time, may vary by plan or server configuration, and may be modified,
          suspended, or discontinued at any time.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">User Accounts (Discord OAuth)</h2>
        <p className="text-muted-foreground">
          Access to certain parts of the Service, including the dashboard, requires authentication
          through Discord OAuth, currently implemented via next-auth. You are responsible for
          maintaining the security of your Discord account and for all activity that occurs through
          your authenticated session. You may only connect accounts and servers that you are
          authorized to manage.
        </p>
        <p className="text-muted-foreground">
          The dashboard is intended for server administrators and other authorized personnel. Our
          use of account information and related service data is described in our{' '}
          <Link className="text-foreground underline underline-offset-4" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">
          Responsibilities &amp; Prohibited Conduct
        </h2>
        <p className="text-muted-foreground">You agree not to use the Service to:</p>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>Violate any law, regulation, or third-party right.</li>
          <li>Harass, abuse, threaten, defame, or exploit other users or communities.</li>
          <li>Interfere with the normal operation, security, or integrity of the Service.</li>
          <li>
            Attempt to reverse engineer, scrape, overload, or circumvent usage limits or safeguards.
          </li>
          <li>
            Use the Service to send malware, phishing content, spam, or unauthorized automated
            messages.
          </li>
          <li>
            Configure moderation rules, webhooks, or automations in a way that is deceptive,
            unlawful, or harmful to others.
          </li>
          <li>
            Use the Service in a way that violates Discord&apos;s rules or the rights of server
            members.
          </li>
        </ul>
        <p className="text-muted-foreground">
          You are responsible for your server settings, moderation policies, webhook destinations,
          and the consequences of actions initiated through your configuration.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">AI-Generated Content Disclaimer</h2>
        <p className="text-muted-foreground">
          Some features of Volvox.Bot generate responses or recommendations using third-party AI
          models, including services provided by Anthropic (Claude) and MiniMax. AI-generated output
          may be inaccurate, incomplete, biased, outdated, or otherwise inappropriate for your use
          case.
        </p>
        <p className="text-muted-foreground">
          AI responses are provided for general informational and operational purposes only. They
          are not professional, legal, medical, financial, mental health, compliance, or safety
          advice, and they should not be relied upon as a substitute for qualified human review.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Moderation &amp; Enforcement</h2>
        <p className="text-muted-foreground">
          Volvox.Bot may perform moderation actions based on server configuration, such as issuing
          warnings, muting users, banning users, filtering content, detecting spam, or triggering
          other automated enforcement workflows. These actions may be based on automated logic,
          administrator-defined rules, or AI-assisted systems.
        </p>
        <p className="text-muted-foreground">
          You acknowledge that moderation outcomes may not always be perfect and that you are
          responsible for reviewing, supervising, and calibrating the rules you enable. We are not
          responsible for decisions made by server administrators or for actions taken pursuant to a
          server&apos;s chosen configuration.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Intellectual Property</h2>
        <p className="text-muted-foreground">
          The Service, including its software, design, branding, interfaces, and related content, is
          owned by Volvox LLC or its licensors and is protected by applicable intellectual property
          laws. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable,
          revocable right to use the Service for its intended purposes.
        </p>
        <p className="text-muted-foreground">
          Except as expressly permitted by law or these Terms, you may not copy, distribute, modify,
          create derivative works from, sell, lease, sublicense, or otherwise exploit the Service.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Third-Party Services</h2>
        <h3 className="text-sm font-medium text-muted-foreground/60">
          Discord and external providers
        </h3>
        <p className="text-muted-foreground">
          Use of Volvox.Bot requires compliance with applicable third-party terms, including
          Discord&apos;s Terms of Service, Community Guidelines, platform policies, and developer
          rules. If your use of Discord is suspended, limited, or terminated, your use of the
          Service may be affected as well.
        </p>
        <p className="text-muted-foreground">
          The Service may also rely on third-party infrastructure, AI providers, hosting services,
          analytics, authentication providers, or webhook destinations that we do not control. We
          are not responsible for third-party services, their availability, or their policies.
          Volvox.Bot is an independent product and is not affiliated with, endorsed by, or sponsored
          by Discord.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">
          Disclaimers &amp; Limitation of Liability
        </h2>
        <p className="text-muted-foreground">
          THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS. TO
          THE MAXIMUM EXTENT PERMITTED BY LAW, VOLVOX LLC DISCLAIMS ALL WARRANTIES, EXPRESS OR
          IMPLIED, INCLUDING ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          TITLE, NON-INFRINGEMENT, ACCURACY, OR RELIABILITY.
        </p>
        <p className="text-muted-foreground">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, VOLVOX LLC WILL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF
          PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR RELATED TO
          YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </p>
        <p className="text-muted-foreground">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE TOTAL LIABILITY OF VOLVOX LLC FOR ANY CLAIMS
          ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID TO VOLVOX
          LLC FOR THE SERVICE IN THE TWELVE MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR
          ONE HUNDRED U.S. DOLLARS (USD $100), WHICHEVER IS GREATER.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Indemnification</h2>
        <p className="text-muted-foreground">
          You agree to defend, indemnify, and hold harmless Volvox LLC and its affiliates, officers,
          employees, contractors, and licensors from and against any claims, liabilities, damages,
          losses, and expenses, including reasonable attorneys&apos; fees, arising out of or related
          to your use of the Service, your server configurations, your webhook integrations, your
          content, or your violation of these Terms or applicable law.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Termination</h2>
        <p className="text-muted-foreground">
          We may suspend or terminate your access to the Service at any time, with or without
          notice, if we believe you have violated these Terms, created risk for the Service or
          others, or if continued access is no longer commercially, technically, or legally
          feasible. You may stop using the Service at any time by removing the bot, disconnecting
          your account, and ceasing use of the dashboard.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Changes</h2>
        <p className="text-muted-foreground">
          We may update these Terms from time to time. When we do, we will update the effective date
          above and may provide additional notice where required or appropriate. Your continued use
          of the Service after updated Terms become effective constitutes acceptance of the revised
          Terms.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Governing Law</h2>
        <p className="text-muted-foreground">
          These Terms are governed by the laws applicable in the jurisdiction where Volvox LLC is
          organized, without regard to conflict-of-law rules, except where applicable law requires
          otherwise.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Contact</h2>
        <p className="text-muted-foreground">
          If you have questions about these Terms, please contact Volvox LLC at{' '}
          <a
            className="text-foreground underline underline-offset-4"
            href="mailto:support@volvox.bot"
          >
            support@volvox.bot
          </a>
          .
        </p>
      </section>
    </main>
  );
}
