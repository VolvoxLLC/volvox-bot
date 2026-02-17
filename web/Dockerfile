# syntax=docker/dockerfile:1

# --- Dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

# Build context: Must be the monorepo root (not web/). The Dockerfile expects
# pnpm-workspace.yaml, pnpm-lock.yaml, and package.json at the root level,
# plus web/package.json for the dashboard package.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile --filter bills-bot-web

# --- Builder ---
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY . .

# Build args for env vars needed at build time
ARG NEXT_PUBLIC_DISCORD_CLIENT_ID
ENV NEXT_PUBLIC_DISCORD_CLIENT_ID=$NEXT_PUBLIC_DISCORD_CLIENT_ID

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/web
RUN pnpm build && \
    # Verify standalone output path — pnpm workspaces nest under the package dir
    test -f .next/standalone/web/server.js || \
      (echo "ERROR: Expected .next/standalone/web/server.js not found. Check Next.js standalone output." && exit 1)

# --- Runner ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Leverage Next.js standalone output.
# In a pnpm workspace monorepo, standalone output nests the app under its
# package directory (web/), so server.js lives at web/server.js.
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/web/public ./web/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "web/server.js"]
