#!/bin/bash
# Check Claude usage via OAuth API
# Returns JSON with usage percentages and alert status

set -e

# Read OAuth token from Claude CLI credentials
CREDS_FILE="$HOME/.claude/.credentials.json"

if [[ ! -f "$CREDS_FILE" ]]; then
    echo '{"error": "No credentials file found"}'
    exit 1
fi

ACCESS_TOKEN=$(jq -r '.claudeAiOauth.accessToken' "$CREDS_FILE")

if [[ -z "$ACCESS_TOKEN" || "$ACCESS_TOKEN" == "null" ]]; then
    echo '{"error": "No access token found"}'
    exit 1
fi

# Check if token is expired
EXPIRES_AT=$(jq -r '.claudeAiOauth.expiresAt' "$CREDS_FILE")
NOW_MS=$(($(date +%s) * 1000))

if [[ "$EXPIRES_AT" != "null" && "$NOW_MS" -gt "$EXPIRES_AT" ]]; then
    echo '{"error": "Token expired", "expiresAt": '"$EXPIRES_AT"'}'
    exit 1
fi

# Fetch usage from API
RESPONSE=$(curl -s "https://api.anthropic.com/api/oauth/usage" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "anthropic-beta: oauth-2025-04-20" \
    -H "User-Agent: claude-code/2.1.5" \
    -H "Content-Type: application/json" 2>&1)

if [[ $? -ne 0 ]]; then
    echo '{"error": "API request failed"}'
    exit 1
fi

# Extract usage percentages
FIVE_HOUR=$(echo "$RESPONSE" | jq -r '.five_hour.utilization // 0')
SEVEN_DAY=$(echo "$RESPONSE" | jq -r '.seven_day.utilization // 0')
FIVE_HOUR_RESET=$(echo "$RESPONSE" | jq -r '.five_hour.resets_at // null')
SEVEN_DAY_RESET=$(echo "$RESPONSE" | jq -r '.seven_day.resets_at // null')

# Determine alert level (every 10% after 50%)
ALERT_LEVEL="none"
if (( $(echo "$FIVE_HOUR >= 90" | bc -l) )); then
    ALERT_LEVEL="critical"
elif (( $(echo "$FIVE_HOUR >= 80" | bc -l) )); then
    ALERT_LEVEL="high"
elif (( $(echo "$FIVE_HOUR >= 70" | bc -l) )); then
    ALERT_LEVEL="warning"
elif (( $(echo "$FIVE_HOUR >= 60" | bc -l) )); then
    ALERT_LEVEL="elevated"
elif (( $(echo "$FIVE_HOUR >= 50" | bc -l) )); then
    ALERT_LEVEL="moderate"
fi

# Output JSON
cat <<EOF
{
    "five_hour": {
        "utilization": $FIVE_HOUR,
        "resets_at": "$FIVE_HOUR_RESET"
    },
    "seven_day": {
        "utilization": $SEVEN_DAY,
        "resets_at": "$SEVEN_DAY_RESET"
    },
    "alert_level": "$ALERT_LEVEL",
    "should_alert": $([ "$ALERT_LEVEL" != "none" ] && echo "true" || echo "false"),
    "checked_at": "$(date -Iseconds)"
}
EOF
