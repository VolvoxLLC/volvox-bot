# Operations Runbook

Operational checklist for maintainers running Volvox Bot in production.

## Release checklist

1. Run repo-level checks:
   - `pnpm mono:lint`
   - `pnpm mono:typecheck`
   - `pnpm mono:test`
   - `pnpm mono:build`
2. Confirm migrations are applied.
3. Deploy bot and web.
4. Validate startup logs and key commands in a test guild.

## Dashboard-specific checks

- Confirm dashboard can load guild list.
- Validate config save path for at least one setting.
- For visual changes, verify light and dark themes across mobile, tablet, and desktop viewport sizes; capture screenshots for every theme/viewport combination and attach them to the change record.

## Incident quick triage

1. Check bot process logs for gateway/auth errors.
2. Check DB connectivity and migration state.
3. Check Redis connectivity.
4. Validate Discord API permissions in affected guild.
5. Reproduce with a single command and collect timestamps.

## Recovery patterns

- **Auth/session failures**: rotate `SESSION_SECRET`, restart the bot and web dashboard so the new secret is loaded, verify callback URLs, and warn operators that currently active dashboard sessions are invalidated by the rotation.
- **Config not applying**: verify allowlist key + guild override retrieval path.
- **Dashboard UI regressions**: verify page-title wiring and provider usage patterns.
