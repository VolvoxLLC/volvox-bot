# syntax=docker/dockerfile:1

# --- Base ---
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

# --- Pruner: extract only what web needs from the monorepo ---
FROM base AS pruner
RUN pnpm add -g turbo
COPY . .
RUN turbo prune volvox-bot-web --docker

# --- Dependencies: install from pruned lockfile ---
FROM base AS deps
# Copy pruned package.json files and lockfile
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# --- Builder ---
FROM base AS builder
# Copy installed deps
COPY --from=deps /app/ .
# Copy pruned source code
COPY --from=pruner /app/out/full/ .

WORKDIR /app/web

ARG NEXT_PUBLIC_DISCORD_CLIENT_ID
ENV NEXT_PUBLIC_DISCORD_CLIENT_ID=$NEXT_PUBLIC_DISCORD_CLIENT_ID
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm build

# Flatten standalone output if nested
RUN if [ -f .next/standalone/server.js ]; then \
      echo "server.js at root"; \
    elif [ -f .next/standalone/web/server.js ]; then \
      echo "server.js nested under web/, flattening..."; \
      cp -a .next/standalone/web/* .next/standalone/; \
      rm -rf .next/standalone/web; \
    else \
      echo "ERROR: server.js not found in standalone output"; \
      find .next/standalone -name server.js; \
      exit 1; \
    fi

# --- Runner ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/web/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
