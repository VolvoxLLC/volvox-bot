#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <owner/repo> [branch]"
  echo "Example: $0 VolvoxLLC/volvox-bot"
  exit 1
fi

REPO_SLUG="$1"
BRANCH="${2:-master}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/docs/wiki-pages"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Missing source wiki pages at $SOURCE_DIR"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

WIKI_URL="https://github.com/${REPO_SLUG}.wiki.git"

echo "Cloning wiki from $WIKI_URL"
git clone "$WIKI_URL" "$TMP_DIR/wiki"
cd "$TMP_DIR/wiki"

git checkout "$BRANCH" 2>/dev/null || true

cp -f "$SOURCE_DIR"/*.md .

git add *.md
if git diff --cached --quiet; then
  echo "No wiki changes to commit."
  exit 0
fi

git commit -m "docs: sync wiki pages from repo"

echo "Wiki commit created locally at: $TMP_DIR/wiki"
echo "Run: cd $TMP_DIR/wiki && git push origin $BRANCH"
