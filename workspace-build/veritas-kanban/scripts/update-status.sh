#!/bin/bash
# update-status.sh - Agent status reporting for Veritas Kanban
# Usage:
#   update-status.sh working [taskId] [taskTitle]
#   update-status.sh thinking
#   update-status.sh sub-agent [count]
#   update-status.sh idle
#   update-status.sh error [message]

set -e

API_URL="${VERITAS_API_URL:-http://localhost:3001}/api/agent/status"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

status="${1:-idle}"
shift 2>/dev/null || true

build_payload() {
    local json="{\"status\":\"$status\",\"timestamp\":\"$TIMESTAMP\""
    
    case "$status" in
        working)
            if [[ -n "$1" ]]; then
                json+=",\"taskId\":\"$1\""
            fi
            if [[ -n "$2" ]]; then
                json+=",\"taskTitle\":\"$2\""
            fi
            ;;
        sub-agent)
            if [[ -n "$1" ]]; then
                json+=",\"count\":$1"
            fi
            ;;
        error)
            if [[ -n "$1" ]]; then
                # Escape double quotes in message
                local escaped_msg="${1//\"/\\\"}"
                json+=",\"message\":\"$escaped_msg\""
            fi
            ;;
    esac
    
    json+="}"
    echo "$json"
}

payload=$(build_payload "$@")

# POST to API, fail silently (don't block workflow if status update fails)
curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --connect-timeout 2 \
    --max-time 5 \
    >/dev/null 2>&1 || true

exit 0
