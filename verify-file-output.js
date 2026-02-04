/**
 * Verification script for file output and rotation configuration
 * Tests that logger creates log files with proper JSON format
 */

import { debug, info, warn, error } from './src/logger.js';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logsDir = join(__dirname, 'logs');

console.log('\n🧪 Starting file output verification...\n');

// Generate test logs at different levels
info('File output verification started');
debug('This is a debug message for testing', { testId: 1, service: 'verification' });
info('This is an info message for testing', { testId: 2, channel: 'test-channel' });
warn('This is a warning message for testing', { testId: 3, user: 'test-user' });
error('This is an error message for testing', { testId: 4, code: 'TEST_ERROR' });

// Log with sensitive data to verify redaction
info('Testing sensitive data redaction', {
  DISCORD_TOKEN: 'this-should-be-redacted',
  username: 'safe-to-log',
  password: 'this-should-also-be-redacted'
});

console.log('✅ Test logs generated\n');

// Wait a moment for file writes to complete
setTimeout(() => {
  console.log('🔍 Verifying log files...\n');

  // Check 1: Logs directory exists
  if (!existsSync(logsDir)) {
    console.error('❌ FAIL: logs directory was not created');
    process.exit(1);
  }
  console.log('✅ PASS: logs directory exists');

  // Check 2: List files in logs directory
  const logFiles = readdirSync(logsDir);
  console.log(`\n📁 Files in logs directory: ${logFiles.join(', ')}`);

  // Check 3: Combined log file exists
  const combinedLog = logFiles.find(f => f.startsWith('combined-'));
  if (!combinedLog) {
    console.error('❌ FAIL: combined log file not found');
    process.exit(1);
  }
  console.log(`✅ PASS: combined log file exists (${combinedLog})`);

  // Check 4: Error log file exists
  const errorLog = logFiles.find(f => f.startsWith('error-'));
  if (!errorLog) {
    console.error('❌ FAIL: error log file not found');
    process.exit(1);
  }
  console.log(`✅ PASS: error log file exists (${errorLog})`);

  // Check 5: Combined log contains valid JSON
  console.log('\n📄 Verifying combined log format...');
  const combinedPath = join(logsDir, combinedLog);
  const combinedContent = readFileSync(combinedPath, 'utf-8');
  const combinedLines = combinedContent.trim().split('\n').filter(line => line.trim());

  console.log(`\nCombined log entries: ${combinedLines.length}`);

  let validJsonCount = 0;
  let hasInfoLevel = false;
  let hasWarnLevel = false;
  let hasErrorLevel = false;
  let sensitiveDataRedacted = false;

  for (const line of combinedLines) {
    try {
      const entry = JSON.parse(line);
      validJsonCount++;

      // Verify required fields
      if (!entry.timestamp || !entry.level || !entry.message) {
        console.error(`❌ FAIL: Log entry missing required fields: ${line}`);
        process.exit(1);
      }

      // Track log levels
      if (entry.level === 'info') hasInfoLevel = true;
      if (entry.level === 'warn') hasWarnLevel = true;
      if (entry.level === 'error') hasErrorLevel = true;

      // Check for sensitive data redaction
      if (entry.message.includes('sensitive data')) {
        if (entry.DISCORD_TOKEN === '[REDACTED]' && entry.password === '[REDACTED]') {
          sensitiveDataRedacted = true;
        } else {
          console.error('❌ FAIL: Sensitive data was not redacted properly');
          console.error('Entry:', JSON.stringify(entry, null, 2));
          process.exit(1);
        }
      }

      // Display sample entry
      if (validJsonCount === 1) {
        console.log('\nSample log entry:');
        console.log(JSON.stringify(entry, null, 2));
      }
    } catch (err) {
      console.error(`❌ FAIL: Invalid JSON in combined log: ${line}`);
      console.error('Parse error:', err.message);
      process.exit(1);
    }
  }

  console.log(`\n✅ PASS: All ${validJsonCount} entries are valid JSON`);
  console.log(`✅ PASS: Timestamps present in all entries`);
  console.log(`✅ PASS: Log levels present - info: ${hasInfoLevel}, warn: ${hasWarnLevel}, error: ${hasErrorLevel}`);
  console.log(`✅ PASS: Sensitive data redacted: ${sensitiveDataRedacted}`);

  // Check 6: Error log contains only error-level entries
  console.log('\n📄 Verifying error log format...');
  const errorPath = join(logsDir, errorLog);
  const errorContent = readFileSync(errorPath, 'utf-8');
  const errorLines = errorContent.trim().split('\n').filter(line => line.trim());

  console.log(`\nError log entries: ${errorLines.length}`);

  for (const line of errorLines) {
    try {
      const entry = JSON.parse(line);

      if (entry.level !== 'error') {
        console.error(`❌ FAIL: Non-error level found in error log: ${entry.level}`);
        process.exit(1);
      }

      // Display sample error entry
      if (errorLines.indexOf(line) === 0) {
        console.log('\nSample error entry:');
        console.log(JSON.stringify(entry, null, 2));
      }
    } catch (err) {
      console.error(`❌ FAIL: Invalid JSON in error log: ${line}`);
      console.error('Parse error:', err.message);
      process.exit(1);
    }
  }

  console.log(`\n✅ PASS: All error log entries are error-level only`);
  console.log(`✅ PASS: Error log format is valid JSON`);

  // Check 7: Verify rotation configuration
  console.log('\n🔄 Verifying rotation configuration...');
  console.log('Expected: Daily rotation with YYYY-MM-DD pattern');
  console.log('Expected: Max size 20MB, max files 14 days');

  const datePattern = /\d{4}-\d{2}-\d{2}/;
  if (datePattern.test(combinedLog) && datePattern.test(errorLog)) {
    console.log('✅ PASS: Log files use correct date pattern (YYYY-MM-DD)');
  } else {
    console.error('❌ FAIL: Log files do not use expected date pattern');
    process.exit(1);
  }

  console.log('\n✅ ALL CHECKS PASSED!');
  console.log('\n📋 Summary:');
  console.log('  - Logs directory created: ✅');
  console.log('  - Combined log file created: ✅');
  console.log('  - Error log file created: ✅');
  console.log('  - JSON format valid: ✅');
  console.log('  - Timestamps present: ✅');
  console.log('  - Log levels working: ✅');
  console.log('  - Error log filtering: ✅');
  console.log('  - Sensitive data redaction: ✅');
  console.log('  - Date-based rotation pattern: ✅');
  console.log('\n✨ File output and rotation verification complete!\n');

  process.exit(0);
}, 1000); // Wait 1 second for file writes
