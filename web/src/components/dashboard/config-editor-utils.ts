import type { FocusEvent } from 'react';
import type { BotConfig, DeepPartial } from '@/types/config';

/** Config sections exposed by the API — all fields optional for partial API responses. */
export type GuildConfig = DeepPartial<BotConfig>;

/** Shared input styling for text inputs and textareas in the config editor. */
export const inputClasses = [
  'w-full rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm',
  'ring-offset-background placeholder:text-muted-foreground/50',
  'transition-all duration-300 focus-visible:border-primary/30 focus-visible:outline-none',
  'focus-visible:ring-1 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'scrollbar-thin scrollbar-thumb-border/20 scrollbar-track-transparent',
  'dark:bg-black/40 dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4),0_1px_1px_rgba(255,255,255,0.05)]',
].join(' ');

const UUID_BYTE_TO_HEX = Array.from({ length: 256 }, (_, index) =>
  index.toString(16).padStart(2, '0'),
);

/**
 * Generate a UUID using browser/Node cryptographic randomness.
 *
 * @returns A UUID v4 string.
 */
export function generateId(): string {
  const browserCrypto = globalThis.crypto;

  if (typeof browserCrypto?.randomUUID === 'function') {
    return browserCrypto.randomUUID();
  }

  if (typeof browserCrypto?.getRandomValues === 'function') {
    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return [
      UUID_BYTE_TO_HEX[bytes[0]],
      UUID_BYTE_TO_HEX[bytes[1]],
      UUID_BYTE_TO_HEX[bytes[2]],
      UUID_BYTE_TO_HEX[bytes[3]],
      '-',
      UUID_BYTE_TO_HEX[bytes[4]],
      UUID_BYTE_TO_HEX[bytes[5]],
      '-',
      UUID_BYTE_TO_HEX[bytes[6]],
      UUID_BYTE_TO_HEX[bytes[7]],
      '-',
      UUID_BYTE_TO_HEX[bytes[8]],
      UUID_BYTE_TO_HEX[bytes[9]],
      '-',
      UUID_BYTE_TO_HEX[bytes[10]],
      UUID_BYTE_TO_HEX[bytes[11]],
      UUID_BYTE_TO_HEX[bytes[12]],
      UUID_BYTE_TO_HEX[bytes[13]],
      UUID_BYTE_TO_HEX[bytes[14]],
      UUID_BYTE_TO_HEX[bytes[15]],
    ].join('');
  }

  throw new Error('Secure random number generation is unavailable.');
}

export const DEFAULT_ACTIVITY_BADGES = [
  { days: 90, label: '👑 Legend' },
  { days: 30, label: '🌳 Veteran' },
  { days: 7, label: '🌿 Regular' },
  { days: 0, label: '🌱 Newcomer' },
] as const;

/**
 * Parse a numeric text input into a number, applying optional minimum/maximum bounds.
 *
 * @param raw - The input string to parse; an empty string yields `undefined`.
 * @param min - Optional lower bound; if the parsed value is less than `min`, `min` is returned.
 * @param max - Optional upper bound; if the parsed value is greater than `max`, `max` is returned.
 * @returns `undefined` if `raw` is empty or cannot be parsed as a finite number, otherwise the parsed number (clamped to `min`/`max` when provided).
 */
export function parseNumberInput(raw: string, min?: number, max?: number): number | undefined {
  if (raw === '') return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num)) return undefined;
  if (min !== undefined && num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
}

export function selectNumericValueOnFocus(event: FocusEvent<HTMLInputElement>) {
  // Number inputs do not expose a better cross-browser text selection API than
  // select(). Keep the current best-effort behavior without changing the control type.
  event.currentTarget.select();
}

/**
 * Type guard that checks whether a value is a guild configuration object returned by the API.
 *
 * @returns `true` if the value is an object containing at least one known top-level section
 *   (`ai`, `welcome`, `spam`, `moderation`, `triage`, `starboard`, `permissions`, `memory`) and each present section is a plain object
 *   (not an array or null). Returns `false` otherwise.
 */
export function isGuildConfig(data: unknown): data is GuildConfig {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  const knownSections = [
    'ai',
    'welcome',
    'spam',
    'moderation',
    'triage',
    'starboard',
    'permissions',
    'memory',
    'help',
    'announce',
    'snippet',
    'poll',
    'showcase',
    'tldr',
    'reputation',
    'afk',
    'engagement',
    'github',
    'review',
    'challenges',
    'tickets',
    'auditLog',
  ] as const;
  const hasKnownSection = knownSections.some((key) => key in obj);
  if (!hasKnownSection) return false;
  for (const key of knownSections) {
    if (key in obj) {
      const val = obj[key];
      if (val !== undefined && (typeof val !== 'object' || val === null || Array.isArray(val))) {
        return false;
      }
    }
  }
  return true;
}
