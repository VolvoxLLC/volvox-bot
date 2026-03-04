# Task: Refactor events.js

## Goal
Split src/modules/events.js into smaller modules.

## CRITICAL RULES
1. Read the source file FIRST before doing anything
2. Create ONE file at a time
3. COMMIT after EVERY file you create
4. DO NOT try to do everything at once

## Step-by-Step

### Step 1: Read and Understand
Read src/modules/events.js completely. Identify all the handler functions.

### Step 2: Create Directory
```bash
mkdir -p src/modules/events
```
COMMIT: `git add src/modules/events && git commit -m "refactor(events): create events directory"`

### Step 3: Extract ready.js
Create src/modules/events/ready.js with the registerReadyHandler function.
Keep exports simple: `export function registerReadyHandler(client, config, healthMonitor) { ... }`
COMMIT immediately after creating the file.

### Step 4: Extract messageCreate.js
Create src/modules/events/messageCreate.js with the messageCreate handler.
Export: `export function handleMessageCreate(message, client) { ... }`
COMMIT immediately.

### Step 5: Extract interactionCreate.js
Create src/modules/events/interactionCreate.js with all interaction handlers.
Export: `export function handleInteractionCreate(interaction) { ... }`
COMMIT immediately.

### Step 6: Update events.js
Modify src/modules/events.js to import from the new files instead of having inline handlers.
Keep the same public exports for backward compatibility.
Run `pnpm lint` and fix any issues.
Run `pnpm test` and ensure tests pass.
COMMIT: `git commit -m "refactor(events): update main events.js to use extracted modules"`

## Standards
- ESM imports/exports
- Single quotes
- 2-space indent
- Semicolons required
