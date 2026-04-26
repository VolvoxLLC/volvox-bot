export interface ModerationItem {
  readonly severity: 'red' | 'amber' | 'green';
  readonly text: string;
}

export interface AIChatItem {
  readonly question: string;
  readonly answer: string;
}

export interface ConversationItem {
  readonly initial: string;
  readonly question: string;
  readonly avatarColor: 'purple' | 'green' | 'orange';
}

/** Pick a single random item from an array. */
export function pickRandom<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error('pickRandom called with empty array');
  return items[Math.floor(Math.random() * items.length)];
}

/** Shuffle a copy of the array and return the first `count` items. */
export function shuffleAndPick<T>(items: readonly T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

/** Generate 7 chart heights between 30-95 with a slight uptrend bias. */
export function generateChartHeights(): number[] {
  return Array.from({ length: 7 }, (_, i) => {
    const base = 30 + Math.random() * 55;
    const trend = i * 2;
    return Math.min(95, Math.max(30, base + trend));
  });
}

export const MODERATION_POOL: readonly ModerationItem[] = [
  { severity: 'red', text: 'Spam removed in #general' },
  { severity: 'red', text: 'Phishing link blocked in #links' },
  { severity: 'red', text: 'Mass-mention blocked' },
  { severity: 'red', text: 'Invite spam removed in #welcome' },
  { severity: 'amber', text: 'Toxicity warning issued' },
  { severity: 'amber', text: 'User warned for caps spam' },
  { severity: 'amber', text: 'Slow mode triggered in #general' },
  { severity: 'amber', text: 'Suspicious account flagged' },
  { severity: 'green', text: 'Raid blocked — 12 accounts' },
  { severity: 'green', text: 'Auto-ban: known spam account' },
  { severity: 'green', text: 'Link scan passed' },
];

export const AI_CHAT_POOL: readonly AIChatItem[] = [
  {
    question: 'How do I set up auto-roles?',
    answer: 'Head to Dashboard → Settings → Auto Roles. Pick the role and trigger condition.',
  },
  {
    question: 'What are the moderation commands?',
    answer: 'Use /warn, /mute, /ban, or /kick. Each logs to the audit trail automatically.',
  },
  {
    question: 'How do I set up webhooks?',
    answer:
      'Go to Server Settings → Integrations → Webhooks. Click "New Webhook" and copy the URL.',
  },
  {
    question: 'Can I customize the AI personality?',
    answer: 'Yes! Dashboard → AI Settings → System Prompt. Write your own or pick a preset.',
  },
  {
    question: 'How does the XP system work?',
    answer:
      'Members earn XP per message with a cooldown. Configure rates in Dashboard → Settings → Onboarding & Growth → Reputation.',
  },
  {
    question: 'How do I enable starboard?',
    answer:
      'Dashboard → Settings → Community Tools → Starboard. Set the emoji, threshold, and target channel.',
  },
];

export const CONVERSATION_POOL: readonly ConversationItem[] = [
  { initial: 'M', question: 'How to configure webhooks?', avatarColor: 'purple' },
  { initial: 'S', question: 'Explain the XP system', avatarColor: 'green' },
  { initial: 'J', question: 'Ban appeal process?', avatarColor: 'orange' },
  { initial: 'A', question: 'Set up welcome messages', avatarColor: 'purple' },
  { initial: 'R', question: 'Custom bot prefix?', avatarColor: 'green' },
  { initial: 'K', question: 'Role hierarchy help', avatarColor: 'orange' },
  { initial: 'D', question: 'Auto-mod settings', avatarColor: 'purple' },
  { initial: 'L', question: 'Channel permissions', avatarColor: 'green' },
];

export const TIMESTAMP_POOL: readonly string[] = [
  'just now',
  '2m',
  '5m',
  '8m',
  '12m',
  '23m',
  '45m',
  '1h',
];

export interface DailyActivityPoint {
  readonly date: string;
  readonly messages: number;
  readonly aiRequests: number;
}
