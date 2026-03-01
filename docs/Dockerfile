# Mintlify Docs Deployment
FROM node:20-alpine

WORKDIR /app

# Install mintlify globally (pin to v4 for mint.json support)
RUN npm install -g mintlify@4

# Copy docs content
COPY . .

# Create docs.json from mint.json if needed (Mintlify v4+ compatibility)
RUN if [ -f mint.json ] && [ ! -f docs.json ]; then ln -s mint.json docs.json; fi

# Expose port (Railway sets $PORT)
EXPOSE 3000

# Start mintlify dev server on Railway's PORT
CMD ["sh", "-c", "mintlify dev --port ${PORT:-3000}"]
