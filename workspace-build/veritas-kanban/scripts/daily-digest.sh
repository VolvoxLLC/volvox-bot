#!/usr/bin/env bash
#
# Daily Digest Script for Veritas Kanban
# Fetches the daily digest and sends it to Teams if there's activity
#
# Usage:
#   ./scripts/daily-digest.sh [--dry-run] [--channel CHANNEL_ID]
#
# Environment:
#   VERITAS_API_URL - API base URL (default: http://localhost:3001)
#   TEAMS_CHANNEL   - Teams channel ID (default: Tasks channel)
#
# Scheduling (via Clawdbot):
#   clawdbot cron add "0 8 * * *" "cd ~/Projects/veritas-kanban && ./scripts/daily-digest.sh" --name daily-digest
#

set -euo pipefail

# Configuration
VERITAS_API_URL="${VERITAS_API_URL:-http://localhost:3001}"
TASKS_CHANNEL="19:abdf236ec5424dbcb57676ba630c8434@thread.tacv2"
TEAMS_CHANNEL="${TEAMS_CHANNEL:-$TASKS_CHANNEL}"

# Parse arguments
DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --channel)
      TEAMS_CHANNEL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Fetch the digest
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fetching daily digest..."

RESPONSE=$(curl -s "${VERITAS_API_URL}/api/digest/daily?format=teams")

# Check if empty
IS_EMPTY=$(echo "$RESPONSE" | jq -r '.isEmpty // false')

if [[ "$IS_EMPTY" == "true" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] No activity in the last 24 hours - skipping digest"
  exit 0
fi

# Get the markdown content
MARKDOWN=$(echo "$RESPONSE" | jq -r '.markdown')

if [[ -z "$MARKDOWN" || "$MARKDOWN" == "null" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Error: Could not extract markdown from response"
  echo "Response: $RESPONSE"
  exit 1
fi

# Dry run mode - just print
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] DRY RUN - Would send to channel: $TEAMS_CHANNEL"
  echo "----------------------------------------"
  echo "$MARKDOWN"
  echo "----------------------------------------"
  exit 0
fi

# Send to Teams via Clawdbot
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sending digest to Teams..."

# Use clawdbot message send (assumes clawdbot is in PATH)
if command -v clawdbot &> /dev/null; then
  clawdbot message send --channel msteams --target "$TEAMS_CHANNEL" --message "$MARKDOWN"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Digest sent successfully!"
else
  # Fallback: output the message for manual handling
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Warning: clawdbot not found. Message content:"
  echo "----------------------------------------"
  echo "$MARKDOWN"
  echo "----------------------------------------"
  echo ""
  echo "Channel: $TEAMS_CHANNEL"
  exit 1
fi
