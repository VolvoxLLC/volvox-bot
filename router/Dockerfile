FROM node:22-alpine
RUN npm install -g @musistudio/claude-code-router@1.0.73

RUN addgroup --system --gid 1001 routergroup && \
    adduser --system --uid 1001 routeruser

RUN mkdir -p /home/routeruser/.claude-code-router && \
    chown routeruser:routergroup /home/routeruser/.claude-code-router

COPY --chown=routeruser:routergroup config.json /home/routeruser/.claude-code-router/config.json

USER routeruser

EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1:3456 || exit 1

CMD ["ccr", "start"]
