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

# Copy application source, config, and migrations
COPY --chown=botuser:botgroup package.json ./
COPY --chown=botuser:botgroup config.json ./
COPY --chown=botuser:botgroup src/ ./src/
COPY --chown=botuser:botgroup migrations/ ./migrations/

# Create data directory for state persistence
RUN mkdir -p data && chown botuser:botgroup data

USER botuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider --quiet http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
