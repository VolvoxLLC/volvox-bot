/**
 * OpenAPI / Swagger Configuration
 * Generates the OpenAPI 3.1 spec from JSDoc annotations across route files.
 */

import { createRequire } from 'node:module';
import swaggerJsdoc from 'swagger-jsdoc';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Volvox Bot API',
      version,
      description:
        'REST API for the Volvox Discord bot — guild management, moderation, analytics, AI conversations, and more.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-secret',
          description: 'Shared API secret configured via BOT_API_SECRET environment variable.',
        },
        CookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'JWT session cookie set after Discord OAuth2 login.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Human-readable error message' },
          },
          required: ['error'],
        },
        ValidationError: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: {
              type: 'array',
              items: { type: 'string' },
              description: 'Individual validation failure messages',
            },
          },
          required: ['error'],
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: 'Total number of items' },
            page: { type: 'integer', description: 'Current page number' },
            limit: { type: 'integer', description: 'Items per page' },
          },
        },
      },
      headers: {
        'X-RateLimit-Limit': {
          description: 'Maximum number of requests allowed in the window',
          schema: { type: 'integer' },
        },
        'X-RateLimit-Remaining': {
          description: 'Number of requests remaining in the current window',
          schema: { type: 'integer' },
        },
        'X-RateLimit-Reset': {
          description: 'Unix timestamp (seconds) when the rate limit window resets',
          schema: { type: 'number' },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid authentication',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        RateLimited: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
          headers: {
            'X-RateLimit-Limit': { $ref: '#/components/headers/X-RateLimit-Limit' },
            'X-RateLimit-Remaining': { $ref: '#/components/headers/X-RateLimit-Remaining' },
            'X-RateLimit-Reset': { $ref: '#/components/headers/X-RateLimit-Reset' },
          },
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        ServiceUnavailable: {
          description: 'Database or external service unavailable',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
  },
  apis: ['./src/api/routes/*.js'],
};

/** Generated OpenAPI specification object */
export const swaggerSpec = swaggerJsdoc(options);
