# Mintlify Docs Deployment
FROM node:20-alpine

WORKDIR /app

# Install latest mintlify
RUN npm install -g mintlify@latest

# Copy docs content
COPY . .

# Expose port (Railway sets $PORT)
EXPOSE 3000

# Start mintlify dev server on Railway's PORT
CMD ["sh", "-c", "mintlify dev --port ${PORT:-3000}"]
