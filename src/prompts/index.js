/**
 * Prompt Loader
 * Reads prompt templates from co-located markdown files and interpolates
 * {{variable}} placeholders at call time. Files are read once and cached.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, string>} */
const cache = new Map();

/**
 * Load a prompt template by name and interpolate variables.
 * @param {string} name - Prompt file name (without .md extension)
 * @param {Record<string, string>} [vars={}] - Variables to interpolate ({{key}} → value)
 * @returns {string} The interpolated prompt
 */
export function loadPrompt(name, vars = {}) {
  if (!cache.has(name)) {
    const filePath = join(__dirname, `${name}.md`);
    cache.set(name, readFileSync(filePath, 'utf-8').trim());
  }
  let template = cache.get(name);
  for (const [key, value] of Object.entries(vars)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }
  return template;
}

/**
 * Return the absolute file path to a prompt .md file.
 * Useful for CLI flags that accept a file path (e.g. --system-prompt-file).
 * @param {string} name - Prompt file name (without .md extension)
 * @returns {string} Absolute path to the prompt file
 */
export function promptPath(name) {
  return join(__dirname, `${name}.md`);
}

/**
 * Clear the prompt cache. Useful for testing or hot-reloading.
 */
export function clearPromptCache() {
  cache.clear();
}
