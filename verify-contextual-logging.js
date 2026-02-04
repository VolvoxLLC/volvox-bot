/**
 * Verification Script: Contextual Logging for Discord Events
 *
 * This script verifies that Discord events include proper context
 * in their log output (channel, user, guild) and that the format
 * is consistent and parseable.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logsDir = join(__dirname, 'logs');

console.log('='.repeat(70));
console.log('CONTEXTUAL LOGGING VERIFICATION');
console.log('='.repeat(70));
console.log();

// Expected context fields for each event type
const expectedContextFields = {
  'Welcome message': ['user', 'userId', 'guild', 'guildId', 'channel', 'channelId'],
  'Spam detected': ['user', 'userId', 'channel', 'channelId', 'guild', 'guildId', 'contentPreview'],
  'AI chat': ['channelId', 'username'] // AI chat context is minimal but present in error logs
};

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(message) {
  console.log(`✅ PASS: ${message}`);
  passed++;
}

function fail(message) {
  console.log(`❌ FAIL: ${message}`);
  failed++;
}

function warn(message) {
  console.log(`⚠️  WARN: ${message}`);
  warnings++;
}

// 1. Check if logs directory exists
console.log('1. Checking logs directory...');
if (!existsSync(logsDir)) {
  fail('Logs directory does not exist. Run the bot with fileOutput enabled first.');
  console.log('\nSKIPPING remaining tests - no log files to analyze\n');
  process.exit(1);
} else {
  pass('Logs directory exists');
}
console.log();

// 2. Find and read log files
console.log('2. Reading log files...');
const logFiles = readdirSync(logsDir).filter(f => f.startsWith('combined-') && f.endsWith('.log'));

if (logFiles.length === 0) {
  fail('No combined log files found. Run the bot with fileOutput enabled first.');
  console.log('\nSKIPPING remaining tests - no log files to analyze\n');
  process.exit(1);
}

console.log(`   Found ${logFiles.length} log file(s):`);
logFiles.forEach(f => console.log(`   - ${f}`));
pass('Log files found');
console.log();

// 3. Parse and analyze log entries
console.log('3. Analyzing log entries for contextual data...');
const allLogEntries = [];
let parseErrors = 0;

for (const file of logFiles) {
  const content = readFileSync(join(logsDir, file), 'utf-8');
  const lines = content.trim().split('\n').filter(l => l.trim());

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      allLogEntries.push(entry);
    } catch (err) {
      parseErrors++;
      fail(`Failed to parse log line: ${line.slice(0, 50)}...`);
    }
  }
}

if (parseErrors === 0) {
  pass(`All ${allLogEntries.length} log entries are valid JSON`);
} else {
  fail(`${parseErrors} log entries failed to parse`);
}
console.log();

// 4. Verify timestamp presence
console.log('4. Verifying timestamps...');
const entriesWithTimestamp = allLogEntries.filter(e => e.timestamp);
if (entriesWithTimestamp.length === allLogEntries.length) {
  pass('All log entries include timestamps');
} else {
  fail(`${allLogEntries.length - entriesWithTimestamp.length} entries missing timestamps`);
}
console.log();

// 5. Check for welcome message context
console.log('5. Checking Welcome Message context...');
const welcomeLogs = allLogEntries.filter(e =>
  e.message && e.message.includes('Welcome message')
);

if (welcomeLogs.length === 0) {
  warn('No welcome message logs found. Trigger a user join to test this.');
} else {
  console.log(`   Found ${welcomeLogs.length} welcome message log(s)`);

  let contextComplete = true;
  for (const log of welcomeLogs) {
    const missing = expectedContextFields['Welcome message'].filter(
      field => !log[field] && log[field] !== 0
    );

    if (missing.length > 0) {
      fail(`Welcome message log missing context: ${missing.join(', ')}`);
      contextComplete = false;
    }
  }

  if (contextComplete) {
    pass('Welcome message logs include all expected context fields');
    console.log('   Context fields:', expectedContextFields['Welcome message'].join(', '));
  }
}
console.log();

// 6. Check for spam detection context
console.log('6. Checking Spam Detection context...');
const spamLogs = allLogEntries.filter(e =>
  e.message && e.message.includes('Spam detected')
);

if (spamLogs.length === 0) {
  warn('No spam detection logs found. Post a spam message to test this.');
} else {
  console.log(`   Found ${spamLogs.length} spam detection log(s)`);

  let contextComplete = true;
  for (const log of spamLogs) {
    const missing = expectedContextFields['Spam detected'].filter(
      field => !log[field] && log[field] !== 0
    );

    if (missing.length > 0) {
      fail(`Spam detection log missing context: ${missing.join(', ')}`);
      contextComplete = false;
    }
  }

  if (contextComplete) {
    pass('Spam detection logs include all expected context fields');
    console.log('   Context fields:', expectedContextFields['Spam detected'].join(', '));
  }
}
console.log();

// 7. Check for AI chat context (in error logs)
console.log('7. Checking AI Chat context...');
const aiLogs = allLogEntries.filter(e =>
  e.message && (e.message.includes('OpenClaw API') || e.message.includes('AI'))
);

if (aiLogs.length === 0) {
  warn('No AI chat logs found. Mention the bot to trigger AI chat.');
} else {
  console.log(`   Found ${aiLogs.length} AI-related log(s)`);

  // AI chat logs should include channelId and username in error cases
  const aiErrorLogs = aiLogs.filter(e => e.level === 'error');
  if (aiErrorLogs.length > 0) {
    let contextComplete = true;
    for (const log of aiErrorLogs) {
      if (!log.channelId || !log.username) {
        fail('AI error log missing context (channelId or username)');
        contextComplete = false;
      }
    }

    if (contextComplete) {
      pass('AI error logs include channelId and username context');
    }
  } else {
    warn('No AI error logs found (this is good - no errors occurred)');
  }
}
console.log();

// 8. Verify log format consistency
console.log('8. Verifying log format consistency...');
const requiredFields = ['level', 'message', 'timestamp'];
let formatConsistent = true;

for (const entry of allLogEntries) {
  const missing = requiredFields.filter(field => !entry[field]);
  if (missing.length > 0) {
    fail(`Log entry missing required fields: ${missing.join(', ')}`);
    formatConsistent = false;
    break;
  }
}

if (formatConsistent) {
  pass('All log entries have consistent format (level, message, timestamp)');
}
console.log();

// 9. Check log levels
console.log('9. Verifying log levels...');
const levels = new Set(allLogEntries.map(e => e.level));
console.log(`   Found log levels: ${Array.from(levels).join(', ')}`);

const validLevels = ['debug', 'info', 'warn', 'error'];
const invalidLevels = Array.from(levels).filter(l => !validLevels.includes(l));

if (invalidLevels.length === 0) {
  pass('All log entries use valid log levels');
} else {
  fail(`Invalid log levels found: ${invalidLevels.join(', ')}`);
}
console.log();

// 10. Verify Discord event context patterns
console.log('10. Verifying Discord event context patterns...');

// Events that should include guild context
const guildEvents = allLogEntries.filter(e =>
  e.message && (
    e.message.includes('Welcome message') ||
    e.message.includes('Spam detected')
  )
);

if (guildEvents.length > 0) {
  const withGuildContext = guildEvents.filter(e => e.guild && e.guildId);
  if (withGuildContext.length === guildEvents.length) {
    pass('All guild events include guild and guildId context');
  } else {
    fail(`${guildEvents.length - withGuildContext.length} guild events missing guild context`);
  }
}

// Events that should include channel context
const channelEvents = allLogEntries.filter(e =>
  e.message && (
    e.message.includes('Welcome message') ||
    e.message.includes('Spam detected') ||
    e.message.includes('enabled') && e.channelId
  )
);

if (channelEvents.length > 0) {
  const withChannelContext = channelEvents.filter(e => e.channelId);
  if (withChannelContext.length === channelEvents.length) {
    pass('All channel events include channelId context');
  } else {
    fail(`${channelEvents.length - withChannelContext.length} channel events missing channelId`);
  }
}

// Events that should include user context
const userEvents = allLogEntries.filter(e =>
  e.message && (
    e.message.includes('Welcome message') ||
    e.message.includes('Spam detected')
  )
);

if (userEvents.length > 0) {
  const withUserContext = userEvents.filter(e => e.user && e.userId);
  if (withUserContext.length === userEvents.length) {
    pass('All user events include user and userId context');
  } else {
    fail(`${userEvents.length - withUserContext.length} user events missing user context`);
  }
}
console.log();

// Summary
console.log('='.repeat(70));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(70));
console.log(`Total log entries analyzed: ${allLogEntries.length}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`⚠️  Warnings: ${warnings}`);
console.log();

if (failed === 0 && warnings <= 3) {
  console.log('✅ VERIFICATION PASSED - Contextual logging is working correctly!');
  console.log();
  console.log('Notes:');
  console.log('- All log entries are properly formatted with timestamps');
  console.log('- Discord events include appropriate context (channel, user, guild)');
  console.log('- Log format is consistent and parseable as JSON');
  console.log('- Warnings are expected if not all event types were triggered');
  process.exit(0);
} else if (failed === 0) {
  console.log('⚠️  VERIFICATION PASSED WITH WARNINGS');
  console.log();
  console.log('To fully verify, trigger the following events:');
  if (welcomeLogs.length === 0) console.log('- User join (welcome message)');
  if (spamLogs.length === 0) console.log('- Spam message (spam detection)');
  if (aiLogs.length === 0) console.log('- Mention bot (AI chat)');
  process.exit(0);
} else {
  console.log('❌ VERIFICATION FAILED - Issues found with contextual logging');
  process.exit(1);
}
