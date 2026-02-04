/**
 * Configuration Module
 * Handles loading and exporting bot configuration
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', '..', 'config.json');

/**
 * Load configuration from config.json
 * @returns {Object} Configuration object
 */
export function loadConfig() {
  try {
    if (!existsSync(configPath)) {
      console.error('❌ config.json not found!');
      process.exit(1);
    }
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    console.log('✅ Loaded config.json');
    return config;
  } catch (err) {
    console.error('❌ Failed to load config.json:', err.message);
    process.exit(1);
  }
}
