#!/bin/bash
# Regenerate web/pnpm-lock.yaml from web/package.json
# Run this after any dependency change in web/
cd "$(dirname "$0")/../web"
rm -f pnpm-lock.yaml
pnpm install --lockfile-only
echo "✅ web/pnpm-lock.yaml synced"
