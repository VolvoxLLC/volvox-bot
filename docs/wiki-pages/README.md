# Wiki Pages Source

These files are the source content for the GitHub wiki.

## Included pages

- `Home.md`
- `Quick-Start.md`
- `Configuration-Reference.md`
- `Operations-Runbook.md`
- `Troubleshooting.md`

## Publish workflow

Use GitHub's standard wiki clone flow:

```bash
git clone https://github.com/<owner>/<repo>.wiki.git
cp docs/wiki-pages/*.md <repo>.wiki/
cd <repo>.wiki
git add *.md
git commit -m "docs: update wiki pages"
git push origin master
```

For this project specifically:

```bash
git clone https://github.com/VolvoxLLC/volvox-bot.wiki.git
cp docs/wiki-pages/*.md volvox-bot.wiki/
```
