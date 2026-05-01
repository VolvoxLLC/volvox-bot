# Configuration Reference

Use this as a practical map of where config lives and how it flows.

## Config layers

1. **Global defaults** in `config.json`.
2. **Guild overrides** persisted in DB.
3. Runtime reads config using guild-aware access (`getConfig(guildId)`).

## Adding a new configurable feature

A feature is not complete unless all of the following ship together:

- Runtime behavior
- API/dashboard wiring
- Tests (runtime + wiring)
- `config.json` default keys
- `src/api/utils/configAllowlist.js` updates, including `SAFE_CONFIG_KEYS`

If the key is not allowlisted, dashboard save operations will fail even if backend logic exists.

## Safety requirements

- Use parameterized SQL for persisted config operations.
- Keep community-facing features behind `config.<feature>.enabled`.
- Moderation commands are the exception to enabled-gate requirement.

## Recommended validation before merge

```bash
pnpm mono:lint
pnpm mono:typecheck
pnpm mono:test
```
