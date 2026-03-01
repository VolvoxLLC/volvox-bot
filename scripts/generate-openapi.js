import { mkdirSync, writeFileSync } from 'node:fs';
import { info } from '../src/logger.js';
import { swaggerSpec } from '../src/api/swagger.js';

mkdirSync('docs', { recursive: true });
writeFileSync('docs/openapi.json', JSON.stringify(swaggerSpec, null, 2));
info('OpenAPI spec written to docs/openapi.json');
