/**
 * Log Level Verification Test
 *
 * This script tests that all log levels work correctly and filtering behaves as expected.
 *
 * Expected behavior:
 * - debug level: shows debug, info, warn, error
 * - info level: shows info, warn, error (no debug)
 * - warn level: shows warn, error (no debug, info)
 * - error level: shows only error
 */

import { debug, info, warn, error } from './src/logger.js';

console.log('\n=== Log Level Verification Test ===\n');
console.log(`Current LOG_LEVEL: ${process.env.LOG_LEVEL || 'info (default)'}`);
console.log('Testing all log levels...\n');

// Test all log levels with different types of messages
debug('DEBUG: This is a debug message', { test: 'debug-data', value: 1 });
info('INFO: This is an info message', { test: 'info-data', value: 2 });
warn('WARN: This is a warning message', { test: 'warn-data', value: 3 });
error('ERROR: This is an error message', { test: 'error-data', value: 4 });

// Test with nested metadata
debug('DEBUG: Testing nested metadata', {
  user: 'testUser',
  context: {
    channel: 'test-channel',
    guild: 'test-guild'
  }
});

info('INFO: Testing nested metadata', {
  user: 'testUser',
  context: {
    channel: 'test-channel',
    guild: 'test-guild'
  }
});

warn('WARN: Testing nested metadata', {
  user: 'testUser',
  context: {
    channel: 'test-channel',
    guild: 'test-guild'
  }
});

error('ERROR: Testing nested metadata', {
  user: 'testUser',
  context: {
    channel: 'test-channel',
    guild: 'test-guild'
  }
});

console.log('\n=== Test Complete ===');
console.log('\nExpected output based on LOG_LEVEL:');
console.log('- debug: All 8 log messages (4 simple + 4 with nested metadata)');
console.log('- info:  6 messages (info, warn, error × 2)');
console.log('- warn:  4 messages (warn, error × 2)');
console.log('- error: 2 messages (error × 2)');
console.log('\n');
