#!/bin/bash
# Check for recent unread emails and output formatted text
ACCOUNT="$1"
MINUTES="${2:-5}"

if [ -z "$ACCOUNT" ]; then
  echo "Usage: check-gmail.sh <email> [minutes]"
  exit 1
fi

# Search for unread emails newer than N minutes
RESULT=$(gog gmail search "is:unread newer_than:${MINUTES}m" --account "$ACCOUNT" --json --max 5 2>/dev/null)

# Check if there are any threads
THREADS=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); t=d.get('threads') or []; print(len(t))" 2>/dev/null)

if [ "$THREADS" = "0" ] || [ -z "$THREADS" ]; then
  echo "NO_NEW_MAIL"
  exit 0
fi

# Get details for each thread
echo "$RESULT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
threads = d.get('threads') or []
for t in threads:
    msgs = t.get('messages', [])
    if msgs:
        m = msgs[-1]
        headers = {h['name']: h['value'] for h in m.get('payload', {}).get('headers', [])}
        fr = headers.get('From', 'unknown')
        subj = headers.get('Subject', '(no subject)')
        snippet = m.get('snippet', '')
        print(f'📧 Email from {fr}')
        print(f'Subject: {subj}')
        print(f'{snippet}')
        print('---')
" 2>/dev/null
