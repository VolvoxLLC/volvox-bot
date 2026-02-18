FROM node:22-alpine
RUN npm install -g @musistudio/claude-code-router
COPY config.json /root/.claude-code-router/config.json
EXPOSE 3456
CMD ["ccr", "start"]
