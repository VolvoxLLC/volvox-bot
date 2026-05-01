# Wiki Pages Source

These files are the source content for the GitHub wiki.

## Included pages

- `Home.md`
- `Quick-Start.md`
- `Configuration-Reference.md`
- `Operations-Runbook.md`
- `Troubleshooting.md`

## Publish workflow

From the repo root:

```bash
pnpm wiki:publish
```

Or run the script directly for another repo slug:

```bash
./scripts/publish-wiki.sh <owner/repo>
```

This clones `<owner>/<repo>.wiki.git`, copies all `*.md` files from this directory, and creates a local commit ready to push.
