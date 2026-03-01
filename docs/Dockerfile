FROM node:20-alpine
WORKDIR /app
RUN npm install -g mintlify@latest
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "mintlify dev --port ${PORT:-3000}"]
