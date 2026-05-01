# Troubleshooting

Common issues and direct checks.

## Bot is online but commands fail

- Verify command permissions in server/channel.
- Confirm bot can send messages in the channel.
- Check for safe-send related handling in logs.

## Dashboard saves but behavior does not change

- Confirm setting exists in `config.json`.
- Confirm key is present in `src/api/utils/configAllowlist.js` and `SAFE_CONFIG_KEYS`.
- Confirm runtime reads guild-scoped config.

## Dashboard hot reload loops locally

- Verify `web/next.config.mjs` keeps `allowedDevOrigins` including `127.0.0.1`.

## Recharts warning spam about negative width/height

- Use stable responsive wrapper component instead of raw `ResponsiveContainer`.

## SQL or data-layer errors

- Verify all queries are parameterized.
- Ensure migrations are current.
- Re-run tests targeting failing module first, then repo-level tests.

## Last-step fallback

If an issue is still unresolved:

1. Capture exact error + timestamp.
2. Capture command/user/guild context.
3. Record latest deploy hash.
4. Open an issue with reproduction steps and expected vs actual behavior.
