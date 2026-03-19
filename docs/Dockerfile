# syntax=docker/dockerfile:1

FROM node:22-alpine

WORKDIR /app

RUN npm install -g mintlify@4.2.437

RUN addgroup --system --gid 1001 docsgroup && \
    adduser --system --uid 1001 docsuser

COPY --chown=docsuser:docsgroup . .

USER docsuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000} || exit 1

CMD ["sh", "-c", "mintlify dev --port ${PORT:-3000}"]
