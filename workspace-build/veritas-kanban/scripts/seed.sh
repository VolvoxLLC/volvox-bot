#!/usr/bin/env bash
# seed.sh — Populate the board with example tasks for first-time users.
# Usage: pnpm seed  (or: bash scripts/seed.sh)
#
# Copies example tasks into tasks/active/ so new users see a populated board.
# Safe to re-run — skips if active tasks already exist.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ACTIVE_DIR="$PROJECT_ROOT/tasks/active"
EXAMPLES_DIR="$PROJECT_ROOT/tasks/examples"

# Ensure directories exist
mkdir -p "$ACTIVE_DIR"

# Count existing active tasks (excluding .gitkeep)
EXISTING=$(find "$ACTIVE_DIR" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$EXISTING" -gt 0 ]; then
  echo "ℹ️  Board already has $EXISTING active task(s). Skipping seed."
  echo "   To force: rm tasks/active/*.md && pnpm seed"
  exit 0
fi

if [ ! -d "$EXAMPLES_DIR" ] || [ -z "$(ls "$EXAMPLES_DIR"/*.md 2>/dev/null)" ]; then
  echo "⚠️  No example tasks found in tasks/examples/. Nothing to seed."
  exit 1
fi

# Copy examples into active
COPIED=0
for f in "$EXAMPLES_DIR"/*.md; do
  cp "$f" "$ACTIVE_DIR/"
  COPIED=$((COPIED + 1))
done

echo "✅ Seeded $COPIED example task(s) into tasks/active/"
echo "   Start the server with: pnpm dev"
echo "   Clear them anytime:    rm tasks/active/task_example_*.md"
