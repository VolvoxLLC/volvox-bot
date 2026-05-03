# Volvox.Bot Changelog

Weekly release summaries for Volvox.Bot. For full day-by-day details, see the
[Mintlify changelog](https://volvox.bot/changelog).

---

## Week 2026-W18 (April 27 – May 1, 2026)

A big week for AI and dashboard polish.

- **AI Auto-Moderation** — Active Sentry now scores messages across toxicity, spam, harassment, hate speech, sexual content, violence, and self-harm, with per-category thresholds and configurable response actions (delete, flag, warn, timeout, kick, or ban).
- **Configurable AI models** — Pick which provider/model powers `/tldr` summaries and AI moderation right from the dashboard. MiniMax M2.7 is the new default for `/tldr`.
- **MiniMax provider** — MiniMax joins the lineup as a first-class provider for AI automation and TL;DR.
- **Welcome panel publishing** — Publish, update, and remove welcome and rules panels straight from the dashboard under Onboarding & Growth, with channel-change cleanup and clearer publish feedback.
- **Dedicated role menu channel** — Self-serve role menus can now live in their own channel, separate from rules and welcome.
- **Audit trail for AI triage** — AI moderation decisions now appear in the audit log alongside classic mod actions, and budget alerts are throttled to cut noise.
- **Branded 404 page** — Missing pages on volvox.bot now show an on-brand 404 with quick links back into the dashboard and docs.
- **Cleaner dashboard** — Provider/model pickers hide unavailable models, the AI cost tile was removed from the overview to keep it focused on activity and health, and the activity chart now plots dates correctly.
- **Fixes** — Flag embeds show the global actions that ran, the "Documentation" link in the profile dropdown works again, and welcome publish edge cases are handled more gracefully.
