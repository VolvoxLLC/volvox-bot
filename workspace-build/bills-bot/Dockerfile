# syntax=docker/dockerfile:1

# --- Dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

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

USER botuser

CMD ["node", "src/index.js"]
