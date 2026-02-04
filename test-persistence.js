#!/usr/bin/env node

/**
 * End-to-end persistence test
 * Simulates the manual verification steps:
 * 1. Create storage instance and add 3 messages
 * 2. Close storage (simulating bot shutdown)
 * 3. Reopen storage (simulating bot restart)
 * 4. Add a 4th message
 * 5. Verify all 4 messages are present in history
 */

import { StorageFactory } from './src/storage.js';
import fs from 'fs/promises';
import path from 'path';

const TEST_DB_PATH = './test-e2e-persistence.db';
const TEST_CHANNEL_ID = 'test-channel-123';

async function cleanup() {
  try {
    await fs.unlink(TEST_DB_PATH);
    console.log('🧹 Cleaned up test database');
  } catch (err) {
    // File doesn't exist, that's fine
  }
}

async function runTest() {
  console.log('🧪 Starting end-to-end persistence test\n');

  try {
    // Clean up any previous test data
    await cleanup();

    // ====================================
    // STEP 1: First "session" - add 3 messages
    // ====================================
    console.log('📝 STEP 1: Creating storage and adding 3 messages...');
    let storage = StorageFactory.create('sqlite', { path: TEST_DB_PATH });

    await storage.addMessage(TEST_CHANNEL_ID, 'user', 'Hello, bot!');
    await storage.addMessage(TEST_CHANNEL_ID, 'assistant', 'Hi there! How can I help you?');
    await storage.addMessage(TEST_CHANNEL_ID, 'user', 'What is the weather like?');

    console.log('✅ Added 3 messages');

    // Verify messages were added
    let history = await storage.getHistory(TEST_CHANNEL_ID);
    console.log(`✅ Verified ${history.length} messages in storage`);

    if (history.length !== 3) {
      throw new Error(`Expected 3 messages, got ${history.length}`);
    }

    // ====================================
    // STEP 2: Close storage (simulate bot shutdown)
    // ====================================
    console.log('\n🛑 STEP 2: Closing storage (simulating bot shutdown)...');
    await storage.close();
    console.log('✅ Storage closed');

    // ====================================
    // STEP 3: Reopen storage (simulate bot restart)
    // ====================================
    console.log('\n🔄 STEP 3: Reopening storage (simulating bot restart)...');
    storage = StorageFactory.create('sqlite', { path: TEST_DB_PATH });
    console.log('✅ Storage reopened');

    // ====================================
    // STEP 4: Verify previous messages persisted
    // ====================================
    console.log('\n🔍 STEP 4: Verifying previous messages persisted...');
    history = await storage.getHistory(TEST_CHANNEL_ID);

    if (history.length !== 3) {
      throw new Error(`❌ PERSISTENCE FAILED: Expected 3 messages after restart, got ${history.length}`);
    }

    console.log('✅ All 3 messages persisted across restart!');
    console.log('\nPersisted messages:');
    history.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.role}] ${msg.content}`);
    });

    // ====================================
    // STEP 5: Add 4th message and verify context
    // ====================================
    console.log('\n📝 STEP 5: Adding 4th message and verifying full context...');
    await storage.addMessage(TEST_CHANNEL_ID, 'assistant', 'I can help with weather information!');

    history = await storage.getHistory(TEST_CHANNEL_ID);

    if (history.length !== 4) {
      throw new Error(`Expected 4 messages, got ${history.length}`);
    }

    console.log('✅ All 4 messages present in history!');
    console.log('\nFull conversation history:');
    history.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.role}] ${msg.content}`);
    });

    // ====================================
    // STEP 6: Test with maxHistory limit
    // ====================================
    console.log('\n📝 STEP 6: Testing maxHistory limit (get only last 2 messages)...');
    const limitedHistory = await storage.getHistory(TEST_CHANNEL_ID, 2);

    if (limitedHistory.length !== 2) {
      throw new Error(`Expected 2 messages with limit, got ${limitedHistory.length}`);
    }

    console.log('✅ maxHistory limit works correctly!');
    console.log('Last 2 messages:');
    limitedHistory.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.role}] ${msg.content}`);
    });

    // Clean up
    await storage.close();
    await cleanup();

    console.log('\n' + '='.repeat(50));
    console.log('✅ ✅ ✅  ALL TESTS PASSED!  ✅ ✅ ✅');
    console.log('='.repeat(50));
    console.log('\nPersistence verification complete:');
    console.log('  ✓ Messages persist across storage close/reopen');
    console.log('  ✓ Conversation context is maintained');
    console.log('  ✓ New messages can be added after restart');
    console.log('  ✓ maxHistory limit works correctly');

    return true;

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);

    // Clean up on error
    await cleanup();

    return false;
  }
}

// Run the test
runTest().then(success => {
  process.exit(success ? 0 : 1);
});
