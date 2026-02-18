#!/usr/bin/env bash
# squad-event.sh — Post system events to VK Squad Chat
# These show as divider lines in the UI (not regular messages)
#
# Usage:
#   squad-event.sh [--model MODEL] spawned <agent> <task-title>
#   squad-event.sh [--model MODEL] completed <agent> <task-title> [duration]
#   squad-event.sh [--model MODEL] failed <agent> <task-title> [duration]
#   squad-event.sh [--model MODEL] status <agent> <task-title>
#
# Examples:
#   squad-event.sh spawned TARS "YouTube Script Draft"
#   squad-event.sh --model claude-sonnet-4.5 completed TARS "YouTube Script Draft" "2m35s"
#   squad-event.sh failed K-2SO "Security Review" "45s"
#   squad-event.sh status Ava "Performance Review"
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

ACTION="${1:?Usage: squad-event.sh [--model MODEL] <spawned|completed|failed|status> <agent> <task-title> [duration]}"
AGENT="${2:?Usage: squad-event.sh [--model MODEL] <spawned|completed|failed|status> <agent> <task-title> [duration]}"
TASK_TITLE="${3:?Usage: squad-event.sh [--model MODEL] <spawned|completed|failed|status> <agent> <task-title> [duration]}"
DURATION="${4:-}"

# Map action to event type
case "$ACTION" in
  spawned)   EVENT="agent.spawned" ;;
  completed) EVENT="agent.completed" ;;
  failed)    EVENT="agent.failed" ;;
  status)    EVENT="agent.status" ;;
  *)
    echo "✗ Unknown action: $ACTION (use spawned|completed|failed|status)" >&2
    exit 1
    ;;
esac

# Build a human-readable message for the system event
case "$ACTION" in
  spawned)   MSG="${AGENT} assigned to: ${TASK_TITLE}" ;;
  completed) MSG="${AGENT} completed: ${TASK_TITLE}${DURATION:+ (${DURATION})}" ;;
  failed)    MSG="${AGENT} failed: ${TASK_TITLE}${DURATION:+ (${DURATION})}" ;;
  status)    MSG="${AGENT} working on: ${TASK_TITLE}" ;;
esac

HOST="${VK_HOST:-localhost}"
PORT="${VK_PORT:-3001}"

# Build JSON with jq (safe escaping)
if [ -n "$MODEL" ]; then
  JSON=$(jq -n \
    --arg agent "$AGENT" \
    --arg message "$MSG" \
    --arg event "$EVENT" \
    --arg taskTitle "$TASK_TITLE" \
    --arg duration "$DURATION" \
    --arg model "$MODEL" \
    '{
      agent: $agent,
      message: $message,
      system: true,
      event: $event,
      taskTitle: $taskTitle,
      model: $model
    } + (if $duration != "" then {duration: $duration} else {} end)')
else
  JSON=$(jq -n \
    --arg agent "$AGENT" \
    --arg message "$MSG" \
    --arg event "$EVENT" \
    --arg taskTitle "$TASK_TITLE" \
    --arg duration "$DURATION" \
    '{
      agent: $agent,
      message: $message,
      system: true,
      event: $event,
      taskTitle: $taskTitle
    } + (if $duration != "" then {duration: $duration} else {} end)')
fi

if ! curl -sf -o /dev/null -X POST "http://${HOST}:${PORT}/api/chat/squad" \
  -H 'Content-Type: application/json' \
  -d "$JSON"; then
  echo "✗ Failed to post system event (is VK running on ${HOST}:${PORT}?)" >&2
  exit 1
fi

# Visual feedback with emoji matching the UI
case "$ACTION" in
  spawned)   echo "🚀 ${MSG}" ;;
  completed) echo "✅ ${MSG}" ;;
  failed)    echo "❌ ${MSG}" ;;
  status)    echo "⏳ ${MSG}" ;;
esac
