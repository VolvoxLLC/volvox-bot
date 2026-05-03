# Wiki Pages Source

These files are the source content for the GitHub wiki.

## Included pages

- `Home.md`
- `Quick-Start.md`
- `Configuration-Reference.md`
- `Operations-Runbook.md`
- `Troubleshooting.md`
- `Manual-Test-Plan.md`
- `Changelog.md`

`README.md` is repo-only documentation for maintainers and is intentionally excluded from the published wiki page list.

## Publish workflow

Use GitHub's standard wiki clone flow:

```bash
git clone https://github.com/<owner>/<repo>.wiki.git
cp docs/wiki-pages/{Home,Quick-Start,Configuration-Reference,Operations-Runbook,Troubleshooting,Manual-Test-Plan,Changelog}.md <repo>.wiki/
cd <repo>.wiki
git add *.md
git commit -m "docs: update wiki pages"
git push origin master
```

For this project specifically:

```bash
git clone https://github.com/VolvoxLLC/volvox-bot.wiki.git
cp docs/wiki-pages/{Home,Quick-Start,Configuration-Reference,Operations-Runbook,Troubleshooting,Manual-Test-Plan,Changelog}.md volvox-bot.wiki/
```
