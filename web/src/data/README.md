# Web data snapshots

The web Docker/Railway build context is `web/`, so browser code cannot import backend
catalogs directly. Keep web-local copies here and cover each copy with a sync test.

- `providers.json` is a generated snapshot of `../../../src/data/providers.json`.
- `ai-automod-catalog.ts` mirrors the backend AI auto-mod category keys, default
  thresholds/actions, and selectable action catalog from `../../../src/modules/aiAutoMod.js`.

Keep the backend provider catalog as the source of truth and run:

```bash
pnpm providers:sync
pnpm providers:check
```

CI runs checks so drift between backend catalogs and web snapshots fails fast.
