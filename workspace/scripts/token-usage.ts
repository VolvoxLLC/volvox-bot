#!/usr/bin/env npx tsx
/**
 * Token Usage Analyzer
 * Parses OpenClaw session transcripts to show token usage breakdown.
 *
 * Usage:
 *   npx tsx scripts/token-usage.ts [--agent main|build] [--hours 24] [--top 20]
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface SessionStats {
  id: string;
  kind: string; // hook, cron, main, heartbeat
  hookName?: string;
  taskId?: string;
  tokensIn: number;
  tokensOut: number;
  tokensTotal: number;
  model?: string;
  startTime?: string;
  endTime?: string;
  runtimeMs?: number;
  messageCount: number;
}

const args = process.argv.slice(2);
const agentId = getArg('--agent') || 'main';
const hours = parseInt(getArg('--hours') || '24');
const top = parseInt(getArg('--top') || '20');
const sessionsDir = `/home/bill/.openclaw/agents/${agentId}/sessions`;

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function classifySession(id: string, firstLine: any, messages: any[]): string {
  // Check session key patterns from messages
  for (const msg of messages) {
    const content = JSON.stringify(msg);
    if (content.includes('hook:veritas')) return 'hook:veritas';
    if (content.includes('hook:gmail')) return 'hook:gmail';
    if (content.includes('hook:sendblue')) return 'hook:sendblue';
    if (content.includes('HEARTBEAT')) return 'heartbeat';
  }

  // Check first user message content
  for (const msg of messages) {
    if (msg.message?.role === 'user') {
      const text = JSON.stringify(msg.message.content || '');
      if (text.includes('heartbeat') || text.includes('HEARTBEAT')) return 'heartbeat';
      if (text.includes('hook:')) return 'hook:unknown';
      if (text.includes('Veritas') || text.includes('veritas')) return 'hook:veritas';
      if (text.includes('Gmail') || text.includes('gmail') || text.includes('New email from'))
        return 'hook:gmail';
      if (text.includes('iMessage')) return 'hook:sendblue';
      if (text.includes('cron job')) return 'cron';
    }
  }

  return 'main';
}

function extractTokens(messages: any[]): { tokensIn: number; tokensOut: number } {
  let tokensIn = 0;
  let tokensOut = 0;

  for (const msg of messages) {
    // Check usage field (Anthropic style)
    if (msg.usage) {
      tokensIn = Math.max(tokensIn, msg.usage.input_tokens || 0);
      tokensOut += msg.usage.output_tokens || 0;
    }
    // Check message-level usage
    if (msg.message?.usage) {
      tokensIn = Math.max(tokensIn, msg.message.usage.input_tokens || 0);
      tokensOut += msg.message.usage.output_tokens || 0;
    }
    // Check for response metadata with usage
    if (msg.type === 'response' && msg.usage) {
      tokensIn = Math.max(tokensIn, msg.usage.input_tokens || 0);
      tokensOut += msg.usage.output_tokens || 0;
    }
  }

  // Fallback: estimate from message sizes if no usage data
  if (tokensIn === 0 && tokensOut === 0) {
    for (const msg of messages) {
      const content = JSON.stringify(msg.message?.content || '');
      const estimated = Math.ceil(content.length / 4); // rough char-to-token ratio
      if (msg.message?.role === 'user' || msg.message?.role === 'system') {
        tokensIn += estimated;
      } else if (msg.message?.role === 'assistant') {
        tokensOut += estimated;
      }
    }
  }

  return { tokensIn, tokensOut };
}

async function main() {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const files = await readdir(sessionsDir);
  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

  console.log(`\n📊 Token Usage Report — agent:${agentId}, last ${hours}h`);
  console.log(`   Scanning ${jsonlFiles.length} session files...\n`);

  const sessions: SessionStats[] = [];

  for (const file of jsonlFiles) {
    try {
      const content = await readFile(join(sessionsDir, file), 'utf-8');
      const lines = content.trim().split('\n');
      const messages = lines
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      if (messages.length === 0) continue;

      const first = messages[0];
      const last = messages[messages.length - 1];

      // Check timestamp is within window
      const startTime = first.timestamp || first.ts;
      if (startTime && new Date(startTime).getTime() < cutoff) continue;

      const endTime = last.timestamp || last.ts;
      const runtimeMs =
        startTime && endTime
          ? new Date(endTime).getTime() - new Date(startTime).getTime()
          : undefined;

      const kind = classifySession(file.replace('.jsonl', ''), first, messages.slice(0, 5));
      const { tokensIn, tokensOut } = extractTokens(messages);

      // Try to find model
      let model: string | undefined;
      for (const msg of messages) {
        if (msg.model) {
          model = msg.model;
          break;
        }
        if (msg.message?.model) {
          model = msg.message.model;
          break;
        }
      }

      sessions.push({
        id: file.replace('.jsonl', '').slice(0, 8),
        kind,
        tokensIn,
        tokensOut,
        tokensTotal: tokensIn + tokensOut,
        model,
        startTime,
        endTime,
        runtimeMs,
        messageCount: messages.length,
      });
    } catch {
      // skip corrupted files
    }
  }

  // Sort by total tokens descending
  sessions.sort((a, b) => b.tokensTotal - a.tokensTotal);

  // Summary by kind
  const byKind = new Map<string, { count: number; tokensIn: number; tokensOut: number }>();
  for (const s of sessions) {
    const existing = byKind.get(s.kind) || { count: 0, tokensIn: 0, tokensOut: 0 };
    existing.count++;
    existing.tokensIn += s.tokensIn;
    existing.tokensOut += s.tokensOut;
    byKind.set(s.kind, existing);
  }

  const totalIn = sessions.reduce((a, s) => a + s.tokensIn, 0);
  const totalOut = sessions.reduce((a, s) => a + s.tokensOut, 0);
  const totalAll = totalIn + totalOut;

  console.log(`═══ Summary ═══`);
  console.log(`  Sessions: ${sessions.length}`);
  console.log(
    `  Total tokens: ${totalAll.toLocaleString()} (${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out)\n`
  );

  console.log(`═══ By Category ═══`);
  const sortedKinds = [...byKind.entries()].sort(
    (a, b) => b[1].tokensIn + b[1].tokensOut - (a[1].tokensIn + a[1].tokensOut)
  );
  for (const [kind, stats] of sortedKinds) {
    const total = stats.tokensIn + stats.tokensOut;
    const pct = totalAll > 0 ? ((total / totalAll) * 100).toFixed(1) : '0';
    console.log(
      `  ${kind.padEnd(20)} ${stats.count.toString().padStart(4)} sessions  ${total.toLocaleString().padStart(12)} tokens  (${pct}%)`
    );
  }

  console.log(`\n═══ Top ${top} Sessions ═══`);
  for (const s of sessions.slice(0, top)) {
    const runtime = s.runtimeMs ? `${Math.round(s.runtimeMs / 1000)}s` : '?';
    const time = s.startTime
      ? new Date(s.startTime).toLocaleTimeString('en-US', {
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
        })
      : '?';
    console.log(
      `  ${s.id}  ${s.kind.padEnd(18)} ${s.tokensTotal.toLocaleString().padStart(10)} tokens  ${s.messageCount.toString().padStart(4)} msgs  ${runtime.padStart(6)}  ${time}`
    );
  }

  console.log('');
}

main().catch(console.error);
