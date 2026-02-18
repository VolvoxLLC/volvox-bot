#!/usr/bin/env bash
# squad-post.sh — Post a message to VK Squad Chat
# Usage: squad-post.sh [--model MODEL] <agent-name> <message> [tag1 tag2 ...]
#
# Examples:
#   squad-post.sh TARS "Starting code review for US-42" review code
#   squad-post.sh --model claude-sonnet-4.5 K-2SO "Security review complete — 10/10" review security
#   squad-post.sh VERITAS "Dispatching 3 agents for sprint work" coordination
#
# Environment:
#   VK_HOST  — Server host (default: localhost)
#   VK_PORT  — Server port (default: 3001)

set -euo pipefail

# Parse optional --model flag
MODEL=""
if [ "${1:-}" = "--model" ]; then
  MODEL="${2:?--model requires a value}"
  shift 2
fi

AGENT="${1:?Usage: squad-post.sh [--model MODEL] <agent> <message> [tags...]}"
MESSAGE="${2:?Usage: squad-post.sh [--model MODEL] <agent> <message> [tags...]}"
shift 2

# Build tags array
TAGS="[]"
if [ $# -gt 0 ]; then
  TAGS=$(printf '%s\n' "$@" | jq -R . | jq -s .)
fi

HOST="${VK_HOST:-localhost}"
PORT="${VK_PORT:-3001}"

# Build JSON payload
if [ -n "$MODEL" ]; then
  PAYLOAD=$(jq -n --arg agent "$AGENT" --arg message "$MESSAGE" --argjson tags "$TAGS" --arg model "$MODEL" \
    '{agent: $agent, message: $message, tags: $tags, model: $model}')
else
  PAYLOAD=$(jq -n --arg agent "$AGENT" --arg message "$MESSAGE" --argjson tags "$TAGS" \
    '{agent: $agent, message: $message, tags: $tags}')
fi

if ! curl -sf -o /dev/null -X POST "http://${HOST}:${PORT}/api/chat/squad" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD"; then
  echo "✗ Failed to post to squad chat (is VK running on ${HOST}:${PORT}?)" >&2
  exit 1
fi

echo "✓ Squad: [$AGENT] $MESSAGE"
