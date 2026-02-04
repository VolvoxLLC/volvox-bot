#!/usr/bin/env node

/**
 * End-to-end persistence test for JSON storage backend
 * Verifies that JSON file storage also persists correctly
 */

import { StorageFactory } from './src/storage.js';
import fs from 'fs/promises';

const TEST_DATA_DIR = './test-e2e-json-data';
const TEST_CHANNEL_ID = 'test-channel-456';

async function cleanup() {
  try {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    console.log('🧹 Cleaned up test data directory');
  } catch (err) {
    // Directory doesn't exist, that's fine
  }
}

async function runTest() {
  console.log('🧪 Starting JSON backend persistence test\n');

  try {
    await cleanup();

    // ====================================
    // STEP 1: First "session" - add 3 messages
    // ====================================
    console.log('📝 STEP 1: Creating JSON storage and adding 3 messages...');
    let storage = StorageFactory.create('json', { path: TEST_DATA_DIR });

    await storage.addMessage(TEST_CHANNEL_ID, 'user', 'Test message 1');
    await storage.addMessage(TEST_CHANNEL_ID, 'assistant', 'Response 1');
    await storage.addMessage(TEST_CHANNEL_ID, 'user', 'Test message 2');

    console.log('✅ Added 3 messages');

    let history = await storage.getHistory(TEST_CHANNEL_ID);
    console.log(`✅ Verified ${history.length} messages in storage`);

    if (history.length !== 3) {
      throw new Error(`Expected 3 messages, got ${history.length}`);
    }

    // ====================================
    // STEP 2: Close storage (simulate shutdown)
    // ====================================
    console.log('\n🛑 STEP 2: Closing storage (simulating bot shutdown)...');
    await storage.close();
    console.log('✅ Storage closed');

    // ====================================
    // STEP 3: Reopen storage (simulate restart)
    // ====================================
    console.log('\n🔄 STEP 3: Reopening JSON storage (simulating bot restart)...');
    storage = StorageFactory.create('json', { path: TEST_DATA_DIR });
    console.log('✅ Storage reopened');

    // ====================================
    // STEP 4: Verify previous messages persisted
    // ====================================
    console.log('\n🔍 STEP 4: Verifying previous messages persisted...');
    history = await storage.getHistory(TEST_CHANNEL_ID);

    if (history.length !== 3) {
      throw new Error(`❌ JSON PERSISTENCE FAILED: Expected 3 messages after restart, got ${history.length}`);
    }

    console.log('✅ All 3 messages persisted in JSON files!');
    console.log('\nPersisted messages:');
    history.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.role}] ${msg.content}`);
    });

    // ====================================
    // STEP 5: Add 4th message and verify context
    // ====================================
    console.log('\n📝 STEP 5: Adding 4th message and verifying full context...');
    await storage.addMessage(TEST_CHANNEL_ID, 'assistant', 'Response 2');

    history = await storage.getHistory(TEST_CHANNEL_ID);

    if (history.length !== 4) {
      throw new Error(`Expected 4 messages, got ${history.length}`);
    }

    console.log('✅ All 4 messages present in JSON storage!');

    // Clean up
    await storage.close();
    await cleanup();

    console.log('\n' + '='.repeat(50));
    console.log('✅ ✅ ✅  JSON BACKEND TEST PASSED!  ✅ ✅ ✅');
    console.log('='.repeat(50));

    return true;

  } catch (error) {
    console.error('\n❌ JSON TEST FAILED:', error.message);
    console.error(error.stack);
    await cleanup();
    return false;
  }
}

runTest().then(success => {
  process.exit(success ? 0 : 1);
});
