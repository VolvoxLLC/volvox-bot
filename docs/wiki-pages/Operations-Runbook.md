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
- Test both dark/light if style tokens changed.

## Incident quick triage

1. Check bot process logs for gateway/auth errors.
2. Check DB connectivity and migration state.
3. Check Redis connectivity.
4. Validate Discord API permissions in affected guild.
5. Reproduce with a single command and collect timestamps.

## Recovery patterns

- **Auth/session failures**: rotate session secret and verify callback URLs.
- **Config not applying**: verify allowlist key + guild override retrieval path.
- **Dashboard UI regressions**: verify page-title wiring and provider usage patterns.
