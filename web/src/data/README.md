# Web provider catalog snapshot

`providers.json` is a generated snapshot of `../../../src/data/providers.json`.

The web Docker/Railway build context is `web/`, so browser code cannot import the
backend catalog directly. Keep the backend catalog as the source of truth and run:

```bash
pnpm providers:sync
pnpm providers:check
```

CI runs the check so drift between the backend catalog and the web snapshot fails fast.
