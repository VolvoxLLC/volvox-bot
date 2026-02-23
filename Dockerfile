# syntax=docker/dockerfile:1

# --- Dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# --- Production ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 botgroup && \
    adduser --system --uid 1001 botuser

# Copy production dependencies
COPY --from=deps --chown=botuser:botgroup /app/node_modules ./node_modules

# Copy application source and config
COPY --chown=botuser:botgroup package.json ./
COPY --chown=botuser:botgroup config.json ./
COPY --chown=botuser:botgroup src/ ./src/

# Create data directory for state persistence
RUN mkdir -p data && chown botuser:botgroup data

# Pre-seed Claude Code config with cached GrowthBook feature flags so the CLI
# does not attempt a slow/hanging network fetch on first invocation inside Docker.
# The userID and firstStartTime are placeholders; the CLI updates them at runtime.
RUN mkdir -p /home/botuser/.claude && \
    printf '{\n  "cachedGrowthBookFeatures": {\n    "tengu_mcp_tool_search": false,\n    "tengu_scratch": false,\n    "tengu_disable_bypass_permissions_mode": false,\n    "tengu_1p_event_batch_config": {"scheduledDelayMillis": 5000, "maxExportBatchSize": 200, "maxQueueSize": 8192},\n    "tengu_claudeai_mcp_connectors": true,\n    "tengu_event_sampling_config": {},\n    "tengu_log_segment_events": false,\n    "tengu_log_datadog_events": true,\n    "tengu_marble_anvil": true,\n    "tengu_tool_pear": false,\n    "tengu_scarf_coffee": false,\n    "tengu_keybinding_customization_release": true,\n    "tengu_penguins_enabled": true,\n    "tengu_thinkback": false,\n    "tengu_oboe": true,\n    "tengu_chomp_inflection": true,\n    "tengu_copper_lantern": false,\n    "tengu_marble_lantern_disabled": false,\n    "tengu_vinteuil_phrase": true,\n    "tengu_system_prompt_global_cache": false,\n    "enhanced_telemetry_beta": false,\n    "tengu_cache_plum_violet": false,\n    "tengu_streaming_tool_execution2": true,\n    "tengu_tool_search_unsupported_models": ["haiku"],\n    "tengu_plan_mode_interview_phase": false,\n    "tengu_fgts": false,\n    "tengu_attribution_header": false,\n    "tengu_prompt_cache_1h_config": {"allowlist": ["repl_main_thread*", "sdk"]},\n    "tengu_tst_names_in_messages": false,\n    "tengu_mulberry_fog": false,\n    "tengu_coral_fern": false,\n    "tengu_bergotte_lantern": false,\n    "tengu_moth_copse": false\n  },\n  "opusProMigrationComplete": true,\n  "sonnet1m45MigrationComplete": true,\n  "cachedExtraUsageDisabledReason": null\n}\n' > /home/botuser/.claude.json && \
    chown -R botuser:botgroup /home/botuser/.claude /home/botuser/.claude.json && \
    chmod 600 /home/botuser/.claude.json

USER botuser

CMD ["node", "src/index.js"]
