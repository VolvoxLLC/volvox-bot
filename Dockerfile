# syntax=docker/dockerfile:1

# --- Dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm config set store-dir /tmp/pnpm-store && \
    pnpm install --frozen-lockfile --prod --ignore-scripts && \
    rm -rf /tmp/pnpm-store

# --- Production ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 botgroup && \
    adduser --system --uid 1001 botuser

# Copy production dependencies
COPY --from=deps --chown=botuser:botgroup /app/node_modules ./node_modules

# Copy application source, config, and migrations
COPY --chown=botuser:botgroup --chmod=0444 package.json ./
COPY --chown=botuser:botgroup --chmod=0444 config.json ./
COPY --chown=botuser:botgroup src/ ./src/
COPY --chown=botuser:botgroup migrations/ ./migrations/

# Keep immutable application files read-only; data remains writable for state persistence.
RUN chmod -R a-w node_modules && \
    find src migrations -type d -exec chmod 0555 {} + && \
    find src migrations -type f -exec chmod 0444 {} + && \
    mkdir -p data && chown botuser:botgroup data && chmod 0700 data

USER botuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider --quiet "http://localhost:${PORT:-3001}/api/v1/health" || exit 1

CMD ["node", "src/index.js"]
