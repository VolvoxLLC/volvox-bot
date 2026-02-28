import { writeFileSync } from 'node:fs';
import { swaggerSpec } from '../src/api/swagger.js';

writeFileSync('docs/openapi.json', JSON.stringify(swaggerSpec, null, 2));
console.log('OpenAPI spec written to docs/openapi.json');
