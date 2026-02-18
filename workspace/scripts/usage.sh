#!/bin/bash
# Combined usage report for Claude and Codex

set -e

WORKSPACE="/home/bill/.openclaw/workspace"

echo "=== CLAUDE USAGE ==="
node "$WORKSPACE/scripts/check-claude-usage.cjs" 2>/dev/null || echo '{"error": "Failed to check Claude usage"}'

echo ""
echo "=== CODEX USAGE ==="
node "$WORKSPACE/scripts/check-codex-usage.cjs" 2>/dev/null || echo '{"error": "Failed to check Codex usage"}'
