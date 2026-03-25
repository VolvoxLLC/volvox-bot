# Product Section Bento Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing page's tabbed DashboardPreview with an animated 7-cell bento grid using live stats and randomized mock data.

**Architecture:** New `DashboardShowcase` section component fetches `/api/stats` and renders a CSS grid of 7 bento cells. Three KPI cells show live data via `AnimatedCounter`. Four mock cells (chart, moderation, AI chat, conversations) use `useMemo`-seeded random data. All cells animate on scroll via Framer Motion.

**Tech Stack:** React 18, Next.js (App Router), Tailwind CSS, Framer Motion, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-25-product-section-redesign.md`

---

## File Map

```
web/src/components/landing/
├── DashboardShowcase.tsx              # NEW — section wrapper, fetches /api/stats, CSS grid
├── bento/
│   ├── bento-data.ts                  # NEW — mock data pools, randomization helpers
│   ├── BentoChart.tsx                 # NEW — SVG area chart with path draw animation
│   ├── BentoKpi.tsx                   # NEW — reusable KPI cell (counter + label + badge)
│   ├── BentoModeration.tsx            # NEW — moderation feed with random picks
│   ├── BentoAIChat.tsx                # NEW — AI chat with typing animation
│   └── BentoConversations.tsx         # NEW — conversation list with random picks
├── index.ts                           # MODIFY — swap DashboardPreview → DashboardShowcase
├── DashboardPreview.tsx               # DELETE
├── DashboardOverviewTab.tsx           # DELETE
├── DashboardModerationTab.tsx         # DELETE
├── DashboardAIChatTab.tsx             # DELETE
└── DashboardSettingsTab.tsx           # DELETE

web/src/app/page.tsx                   # MODIFY — swap dynamic import

web/tests/components/landing/
├── bento-data.test.ts                 # NEW — tests for randomization helpers
├── dashboard-showcase.test.tsx        # NEW — replaces dashboard-preview.test.tsx
├── dashboard-preview.test.tsx         # DELETE

web/tests/app/landing.test.tsx         # MODIFY — update assertions
```

---

### Task 1: Mock Data Pools & Randomization Helpers

**Files:**
- Create: `web/src/components/landing/bento/bento-data.ts`
- Test: `web/tests/components/landing/bento-data.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// web/tests/components/landing/bento-data.test.ts
import { describe, expect, it } from 'vitest';
import {
  pickRandom,
  shuffleAndPick,
  generateChartHeights,
  MODERATION_POOL,
  CONVERSATION_POOL,
  AI_CHAT_POOL,
  TIMESTAMP_POOL,
} from '@/components/landing/bento/bento-data';

describe('bento-data', () => {
  describe('pickRandom', () => {
    it('should return an item from the array', () => {
      const items = ['a', 'b', 'c'];
      const result = pickRandom(items);
      expect(items).toContain(result);
    });
  });

  describe('shuffleAndPick', () => {
    it('should return the requested number of items', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = shuffleAndPick(items, 3);
      expect(result).toHaveLength(3);
    });

    it('should return items from the original array', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = shuffleAndPick(items, 3);
      for (const item of result) {
        expect(items).toContain(item);
      }
    });

    it('should not return duplicates', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = shuffleAndPick(items, 4);
      expect(new Set(result).size).toBe(4);
    });
  });

  describe('generateChartHeights', () => {
    it('should return 7 values', () => {
      const heights = generateChartHeights();
      expect(heights).toHaveLength(7);
    });

    it('should return values between 30 and 95', () => {
      const heights = generateChartHeights();
      for (const h of heights) {
        expect(h).toBeGreaterThanOrEqual(30);
        expect(h).toBeLessThanOrEqual(95);
      }
    });
  });

  describe('data pools', () => {
    it('should have at least 10 moderation templates', () => {
      expect(MODERATION_POOL.length).toBeGreaterThanOrEqual(10);
    });

    it('should have at least 6 AI chat conversations', () => {
      expect(AI_CHAT_POOL.length).toBeGreaterThanOrEqual(6);
    });

    it('should have at least 8 conversation previews', () => {
      expect(CONVERSATION_POOL.length).toBeGreaterThanOrEqual(8);
    });

    it('should have at least 6 timestamps', () => {
      expect(TIMESTAMP_POOL.length).toBeGreaterThanOrEqual(6);
    });

    it('moderation items should have severity and text', () => {
      for (const item of MODERATION_POOL) {
        expect(['red', 'amber', 'green']).toContain(item.severity);
        expect(item.text.length).toBeGreaterThan(0);
      }
    });

    it('AI chat items should have question and answer', () => {
      for (const item of AI_CHAT_POOL) {
        expect(item.question.length).toBeGreaterThan(0);
        expect(item.answer.length).toBeGreaterThan(0);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && rtk pnpm vitest run tests/components/landing/bento-data.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// web/src/components/landing/bento/bento-data.ts

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
  readonly avatarColor: string;
}

/** Pick a single random item from an array. */
export function pickRandom<T>(items: readonly T[]): T {
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
  { question: 'How do I set up auto-roles?', answer: 'Head to Dashboard → Settings → Auto Roles. Pick the role and trigger condition.' },
  { question: 'What are the moderation commands?', answer: 'Use /warn, /mute, /ban, or /kick. Each logs to the audit trail automatically.' },
  { question: 'How do I set up webhooks?', answer: 'Go to Server Settings → Integrations → Webhooks. Click "New Webhook" and copy the URL.' },
  { question: 'Can I customize the AI personality?', answer: 'Yes! Dashboard → AI Settings → System Prompt. Write your own or pick a preset.' },
  { question: 'How does the XP system work?', answer: 'Members earn XP per message with a cooldown. Configure rates in Dashboard → Features → XP.' },
  { question: 'How do I enable starboard?', answer: 'Dashboard → Features → Starboard. Set the emoji, threshold, and target channel.' },
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
  'just now', '2m', '5m', '8m', '12m', '23m', '45m', '1h',
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && rtk pnpm vitest run tests/components/landing/bento-data.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/components/landing/bento/bento-data.ts web/tests/components/landing/bento-data.test.ts
rtk git commit -m "feat(landing): add bento grid mock data pools and randomization helpers"
```

---

### Task 2: BentoKpi Component

**Files:**
- Create: `web/src/components/landing/bento/BentoKpi.tsx`
- Test: `web/tests/components/landing/bento-kpi.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/tests/components/landing/bento-kpi.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseInView } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(({ ...props }: any, ref: any) =>
      React.createElement(tag, { ...props, ref }, props.children)
    );
  return {
    motion: { div: createComponent('div'), span: createComponent('span') },
    useInView: (...args: unknown[]) => mockUseInView(...args),
    useReducedMotion: () => false,
  };
});

import { BentoKpi } from '@/components/landing/bento/BentoKpi';

describe('BentoKpi', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;
  let nextHandle = 1;
  let lastTimestamp = 0;
  let cancelledHandles: Set<number>;

  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    nextHandle = 1;
    lastTimestamp = 0;
    cancelledHandles = new Set();
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      queueMicrotask(() => { if (!cancelledHandles.has(handle)) { lastTimestamp += 2000; cb(lastTimestamp); } });
      return handle;
    });
    globalThis.cancelAnimationFrame = vi.fn((h: number) => { cancelledHandles.add(h); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
  });

  it('should render loading skeleton when loading', () => {
    const { container } = render(<BentoKpi value={null} label="Members" loading={true} color="primary" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('should render dash on error (value=null, not loading)', () => {
    render(<BentoKpi value={null} label="Members" loading={false} color="primary" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
  });

  it('should render formatted value and label on success', async () => {
    render(<BentoKpi value={1247} label="Members" loading={false} color="primary" />);
    await waitFor(() => {
      expect(screen.getByText('1.2K')).toBeInTheDocument();
    });
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('live')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && rtk pnpm vitest run tests/components/landing/bento-kpi.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```tsx
// web/src/components/landing/bento/BentoKpi.tsx
'use client';

import { AnimatedCounter, formatNumber } from '../AnimatedCounter';

interface BentoKpiProps {
  readonly value: number | null;
  readonly label: string;
  readonly loading: boolean;
  readonly color: 'primary' | 'secondary' | 'accent';
}

const colorMap = {
  primary: 'bg-primary/15 text-primary',
  secondary: 'bg-secondary/15 text-secondary',
  accent: 'bg-accent/15 text-accent',
} as const;

/**
 * Reusable KPI cell for the bento grid.
 * Shows an animated counter with a label and live indicator badge.
 */
export function BentoKpi({ value, label, loading, color }: BentoKpiProps) {
  const badgeClass = colorMap[color];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5">
      {loading ? (
        <>
          <div className="h-8 w-20 animate-pulse rounded bg-muted mb-2" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </>
      ) : value === null ? (
        <>
          <div className="text-2xl font-bold text-muted-foreground">—</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-foreground tracking-tight tabular-nums">
            <AnimatedCounter target={value} duration={1.2} formatter={formatNumber} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
          <div className="mt-2">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
              live
            </span>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && rtk pnpm vitest run tests/components/landing/bento-kpi.test.tsx`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/components/landing/bento/BentoKpi.tsx web/tests/components/landing/bento-kpi.test.tsx
rtk git commit -m "feat(landing): add BentoKpi component for live stat display"
```

---

### Task 3: BentoChart Component

**Files:**
- Create: `web/src/components/landing/bento/BentoChart.tsx`

- [ ] **Step 1: Write the component**

```tsx
// web/src/components/landing/bento/BentoChart.tsx
'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useMemo, useRef } from 'react';
import { generateChartHeights } from './bento-data';

/**
 * SVG area chart cell for the bento grid.
 * Generates random heights on mount, draws path left-to-right on scroll-in,
 * and displays a pulsing "LIVE" indicator.
 */
export function BentoChart() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;

  const heights = useMemo(() => generateChartHeights(), []);

  // Convert heights (30-95) to SVG y-coordinates (inverted: 95% → y=5, 30% → y=70)
  const points = useMemo(() => {
    const width = 220;
    const height = 80;
    const padding = 5;
    const usableHeight = height - padding * 2;
    return heights.map((h, i) => ({
      x: (i / (heights.length - 1)) * width,
      y: padding + usableHeight * (1 - (h - 30) / 65),
    }));
  }, [heights]);

  const linePath = useMemo(() => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    return `${linePath} L220,80 L0,80 Z`;
  }, [linePath]);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 row-span-2"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">Server Activity</span>
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-primary"
            animate={
              shouldReduceMotion
                ? {}
                : { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }
            }
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="text-[10px] font-medium text-primary">LIVE</span>
        </div>
      </div>

      {/* SVG Chart */}
      <svg viewBox="0 0 220 80" className="w-full h-auto mb-3" aria-label="Server activity chart">
        <defs>
          <linearGradient id="bento-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <motion.path
          d={areaPath}
          fill="url(#bento-area-fill)"
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1, delay: 0.3 }}
        />
        {/* Line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={shouldReduceMotion ? {} : { pathLength: 0 }}
          animate={isInView ? { pathLength: 1 } : {}}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
        {/* End dot */}
        {isInView && (
          <circle
            cx={points[points.length - 1]?.x ?? 220}
            cy={points[points.length - 1]?.y ?? 10}
            r="3"
            fill="hsl(var(--primary))"
          />
        )}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Messages
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
          AI Responses
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add web/src/components/landing/bento/BentoChart.tsx
rtk git commit -m "feat(landing): add BentoChart SVG area chart with path draw animation"
```

---

### Task 4: BentoModeration Component

**Files:**
- Create: `web/src/components/landing/bento/BentoModeration.tsx`

- [ ] **Step 1: Write the component**

```tsx
// web/src/components/landing/bento/BentoModeration.tsx
'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useMemo, useRef } from 'react';
import { MODERATION_POOL, TIMESTAMP_POOL, shuffleAndPick } from './bento-data';

const severityColors = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
} as const;

/**
 * Moderation feed cell for the bento grid.
 * Randomly picks 3 moderation events from the pool on mount.
 * Top item's dot pulses to indicate recency.
 */
export function BentoModeration() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;

  const items = useMemo(() => {
    const picked = shuffleAndPick(MODERATION_POOL, 3);
    const timestamps = shuffleAndPick(TIMESTAMP_POOL, 2);
    return picked.map((item, i) => ({
      ...item,
      timestamp: i === 0 ? 'just now' : timestamps[i - 1],
    }));
  }, []);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="text-sm font-semibold text-foreground mb-3">Moderation</div>
      <div className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <motion.div
            key={item.text}
            className="flex items-center gap-2"
            initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: shouldReduceMotion ? 0 : i * 0.08 }}
          >
            {i === 0 ? (
              <motion.div
                className={`w-1.5 h-1.5 rounded-full ${severityColors[item.severity]} shrink-0`}
                animate={
                  shouldReduceMotion
                    ? {}
                    : { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }
                }
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <div className={`w-1.5 h-1.5 rounded-full ${severityColors[item.severity]} shrink-0`} />
            )}
            <span className="text-xs text-foreground flex-1 truncate">{item.text}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{item.timestamp}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add web/src/components/landing/bento/BentoModeration.tsx
rtk git commit -m "feat(landing): add BentoModeration feed with random picks and pulse animation"
```

---

### Task 5: BentoAIChat Component

**Files:**
- Create: `web/src/components/landing/bento/BentoAIChat.tsx`

- [ ] **Step 1: Write the component**

```tsx
// web/src/components/landing/bento/BentoAIChat.tsx
'use client';

import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { useMemo, useRef, useState, useEffect } from 'react';
import { AI_CHAT_POOL, pickRandom } from './bento-data';

/**
 * AI Chat cell for the bento grid.
 * Shows a random Q&A pair with a typing indicator that resolves into the bot's response.
 * Spans 2 columns on desktop.
 */
export function BentoAIChat() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [showResponse, setShowResponse] = useState(false);

  const chat = useMemo(() => pickRandom(AI_CHAT_POOL), []);

  // Sync reduced motion preference — if user prefers reduced motion, skip typing animation
  useEffect(() => {
    if (shouldReduceMotion) setShowResponse(true);
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (!isInView || shouldReduceMotion || showResponse) return;
    const timer = setTimeout(() => setShowResponse(true), 1200);
    return () => clearTimeout(timer);
  }, [isInView, shouldReduceMotion, showResponse]);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 col-span-1 sm:col-span-2"
    >
      <div className="text-sm font-semibold text-foreground mb-3">AI Chat</div>
      <div className="flex flex-col gap-2.5">
        {/* User message */}
        <motion.div
          className="flex gap-2 items-start"
          initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4 }}
        >
          <div className="w-5 h-5 rounded-full bg-secondary shrink-0 flex items-center justify-center text-[9px] font-bold text-white">
            A
          </div>
          <div className="bg-muted/50 rounded-lg px-3 py-1.5 text-xs text-foreground">
            {chat.question}
          </div>
        </motion.div>

        {/* Bot response with typing indicator */}
        <motion.div
          className="flex gap-2 items-start justify-end"
          initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: shouldReduceMotion ? 0 : 0.3 }}
        >
          <div className="bg-primary/10 rounded-lg px-3 py-1.5 text-xs text-primary">
            <AnimatePresence mode="wait">
              {showResponse ? (
                <motion.span
                  key="response"
                  initial={shouldReduceMotion ? {} : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {chat.answer}
                </motion.span>
              ) : (
                <motion.span
                  key="typing"
                  className="inline-flex gap-1 py-0.5"
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1 h-1 rounded-full bg-primary"
                      animate={{ y: [0, -3, 0] }}
                      transition={{
                        duration: 0.5,
                        repeat: Infinity,
                        delay: i * 0.12,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="w-5 h-5 rounded-full bg-primary shrink-0 flex items-center justify-center text-[9px] font-bold text-white">
            V
          </div>
        </motion.div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add web/src/components/landing/bento/BentoAIChat.tsx
rtk git commit -m "feat(landing): add BentoAIChat with typing indicator animation"
```

---

### Task 6: BentoConversations Component

**Files:**
- Create: `web/src/components/landing/bento/BentoConversations.tsx`

- [ ] **Step 1: Write the component**

```tsx
// web/src/components/landing/bento/BentoConversations.tsx
'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useMemo, useRef } from 'react';
import { CONVERSATION_POOL, TIMESTAMP_POOL, shuffleAndPick } from './bento-data';

const avatarColorMap = {
  purple: 'bg-secondary/30 text-secondary',
  green: 'bg-primary/30 text-primary',
  orange: 'bg-accent/30 text-accent',
} as const;

/**
 * Conversations list cell for the bento grid.
 * Randomly picks 3 conversations with randomized token/message counts on mount.
 */
export function BentoConversations() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;

  const items = useMemo(() => {
    const picked = shuffleAndPick(CONVERSATION_POOL, 3);
    const timestamps = shuffleAndPick(TIMESTAMP_POOL, 3);
    return picked.map((item, i) => ({
      ...item,
      messages: Math.floor(4 + Math.random() * 14),
      tokens: `${(0.8 + Math.random() * 4).toFixed(1)}k`,
      timestamp: timestamps[i],
    }));
  }, []);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="text-sm font-semibold text-foreground mb-3">Conversations</div>
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <motion.div
            key={item.question}
            className="flex items-center gap-2.5"
            initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: shouldReduceMotion ? 0 : i * 0.08 }}
          >
            <div
              className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-semibold ${avatarColorMap[item.avatarColor as keyof typeof avatarColorMap]}`}
            >
              {item.initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{item.question}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {item.messages} messages · {item.tokens} tokens
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{item.timestamp}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add web/src/components/landing/bento/BentoConversations.tsx
rtk git commit -m "feat(landing): add BentoConversations list with random data"
```

---

### Task 7: DashboardShowcase Wrapper & Tests

**Files:**
- Create: `web/src/components/landing/DashboardShowcase.tsx`
- Create: `web/tests/components/landing/dashboard-showcase.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/tests/components/landing/dashboard-showcase.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseInView, mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
  mockUseReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(({ animate: _animate, initial: _initial, transition: _transition, whileHover: _whileHover, exit: _exit, ...props }: any, ref: any) =>
      React.createElement(tag, { ...props, ref }, props.children)
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: createComponent('div'),
      span: createComponent('span'),
      path: createComponent('path'),
    },
    useInView: (...args: unknown[]) => mockUseInView(...args),
    useScroll: () => ({ scrollY: 0, scrollYProgress: 0 }),
    useSpring: (value: unknown) => value,
    useTransform: (_value: unknown, _input: unknown, output: unknown[]) => output[0],
    useReducedMotion: () => mockUseReducedMotion(),
  };
});

import { DashboardShowcase } from '@/components/landing/DashboardShowcase';

const mockStats = {
  servers: 42,
  members: 12_847,
  commandsServed: 48_200,
  activeConversations: 12,
  uptime: 97_200,
  messagesProcessed: 5_500,
  cachedAt: '2026-03-25T12:00:00.000Z',
};

describe('DashboardShowcase', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;
  let nextHandle = 1;
  let lastTimestamp = 0;
  let cancelledHandles: Set<number>;

  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    mockUseReducedMotion.mockReturnValue(false);
    nextHandle = 1;
    lastTimestamp = 0;
    cancelledHandles = new Set();
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      queueMicrotask(() => { if (!cancelledHandles.has(handle)) { lastTimestamp += 2000; cb(lastTimestamp); } });
      return handle;
    });
    globalThis.cancelAnimationFrame = vi.fn((h: number) => { cancelledHandles.add(h); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
  });

  it('should render section header with THE PRODUCT label', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<DashboardShowcase />);
    expect(screen.getByText('THE PRODUCT')).toBeInTheDocument();
    expect(screen.getByText('Your server, at a glance')).toBeInTheDocument();
  });

  it('should render all bento cell titles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<DashboardShowcase />);
    expect(screen.getByText('Server Activity')).toBeInTheDocument();
    expect(screen.getByText('Moderation')).toBeInTheDocument();
    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
  });

  it('should render live KPI values after fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<DashboardShowcase />);
    await waitFor(() => {
      expect(screen.getByText('12.8K')).toBeInTheDocument(); // members
      expect(screen.getByText('48.2K')).toBeInTheDocument(); // commands
      expect(screen.getByText('42')).toBeInTheDocument(); // servers
    });
  });

  it('should render loading skeletons initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    render(<DashboardShowcase />);
    expect(screen.getByText('Total Members')).toBeInTheDocument();
  });

  it('should render error fallback dashes on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    render(<DashboardShowcase />);
    await waitFor(() => {
      expect(screen.getAllByText('—')).toHaveLength(3);
    });
  });

  it('should render the LIVE badge on the chart', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<DashboardShowcase />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && rtk pnpm vitest run tests/components/landing/dashboard-showcase.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the DashboardShowcase component**

```tsx
// web/src/components/landing/DashboardShowcase.tsx
'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ScrollStage } from './ScrollStage';
import { SectionHeader } from './SectionHeader';
import { BentoAIChat } from './bento/BentoAIChat';
import { BentoChart } from './bento/BentoChart';
import { BentoConversations } from './bento/BentoConversations';
import { BentoKpi } from './bento/BentoKpi';
import { BentoModeration } from './bento/BentoModeration';

// Re-use the same shape as Stats.tsx. TODO: extract to shared type if more consumers appear.
interface BotStats {
  servers: number;
  members: number;
  commandsServed: number;
  activeConversations: number;
  uptime: number;
  messagesProcessed: number;
  cachedAt: string;
}

/**
 * Landing page "THE PRODUCT" section.
 * Renders an animated bento grid showcasing dashboard capabilities
 * with live stats from /api/stats and randomized mock data.
 */
export function DashboardShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });
  const shouldReduceMotion = useReducedMotion() ?? false;

  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BotStats = await res.json();
        if (!cancelled) {
          setStats(data);
          setLoading(false);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      }
    };
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  const kpiValue = (field: keyof BotStats): number | null => {
    if (error && !stats) return null;
    return (stats?.[field] as number) ?? null;
  };

  return (
    <section className="px-4 py-28 sm:px-6 lg:px-8 bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-5xl" ref={containerRef}>
        <ScrollStage>
          <SectionHeader
            label="THE PRODUCT"
            labelColor="primary"
            title="Your server, at a glance"
            subtitle="A dashboard that makes you feel in control."
            className="mb-12"
          />

          {/* Bento grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Row 1-2: Chart (spans 2 rows on lg) */}
            <motion.div
              className="sm:col-span-2 lg:col-span-1 lg:row-span-2"
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0 }}
            >
              <BentoChart />
            </motion.div>

            {/* Row 1: Members KPI */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.08 }}
            >
              <BentoKpi
                value={kpiValue('members')}
                label="Total Members"
                loading={loading}
                color="primary"
              />
            </motion.div>

            {/* Row 1: Commands Served KPI */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.16 }}
            >
              <BentoKpi
                value={kpiValue('commandsServed')}
                label="Commands Served"
                loading={loading}
                color="secondary"
              />
            </motion.div>

            {/* Row 2: Servers KPI */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.24 }}
            >
              <BentoKpi
                value={kpiValue('servers')}
                label="Servers"
                loading={loading}
                color="accent"
              />
            </motion.div>

            {/* Row 2: Moderation */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.32 }}
            >
              <BentoModeration />
            </motion.div>

            {/* Row 3: AI Chat (spans 2 cols) */}
            <motion.div
              className="sm:col-span-2"
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.4 }}
            >
              <BentoAIChat />
            </motion.div>

            {/* Row 3: Conversations */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.48 }}
            >
              <BentoConversations />
            </motion.div>
          </div>
        </ScrollStage>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && rtk pnpm vitest run tests/components/landing/dashboard-showcase.test.tsx`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/components/landing/DashboardShowcase.tsx web/tests/components/landing/dashboard-showcase.test.tsx
rtk git commit -m "feat(landing): add DashboardShowcase bento grid section with tests"
```

---

### Task 8: Wire Into Landing Page & Clean Up

**Files:**
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/components/landing/index.ts`
- Delete: `web/src/components/landing/DashboardPreview.tsx`
- Delete: `web/src/components/landing/DashboardOverviewTab.tsx`
- Delete: `web/src/components/landing/DashboardModerationTab.tsx`
- Delete: `web/src/components/landing/DashboardAIChatTab.tsx`
- Delete: `web/src/components/landing/DashboardSettingsTab.tsx`
- Delete: `web/tests/components/landing/dashboard-preview.test.tsx`
- Modify: `web/tests/app/landing.test.tsx`

- [ ] **Step 1: Update `page.tsx` — swap dynamic import**

In `web/src/app/page.tsx`, replace:
```tsx
const DashboardPreview = dynamic(
  () =>
    import('@/components/landing/DashboardPreview').then((m) => ({ default: m.DashboardPreview })),
  { ssr: false },
);
```
With:
```tsx
const DashboardShowcase = dynamic(
  () =>
    import('@/components/landing/DashboardShowcase').then((m) => ({ default: m.DashboardShowcase })),
  { ssr: false },
);
```

And replace `<DashboardPreview />` with `<DashboardShowcase />` in the JSX.

- [ ] **Step 2: Update `index.ts` — swap barrel export**

In `web/src/components/landing/index.ts`, replace:
```tsx
export { DashboardPreview } from './DashboardPreview';
```
With:
```tsx
export { DashboardShowcase } from './DashboardShowcase';
```

- [ ] **Step 3: Delete old files**

```bash
rtk git rm web/src/components/landing/DashboardPreview.tsx
rtk git rm web/src/components/landing/DashboardOverviewTab.tsx
rtk git rm web/src/components/landing/DashboardModerationTab.tsx
rtk git rm web/src/components/landing/DashboardAIChatTab.tsx
rtk git rm web/src/components/landing/DashboardSettingsTab.tsx
rtk git rm web/tests/components/landing/dashboard-preview.test.tsx
```

- [ ] **Step 4: Update landing page test**

In `web/tests/app/landing.test.tsx`, the test `'renders feature cards'` checks for text that exists in `FeatureGrid`, not in `DashboardPreview`, so it should still pass. The test `'has CTA section'` is also unaffected.

Add a new assertion to verify the showcase section renders:
```tsx
it('renders the product showcase section', () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      servers: 1, members: 1, commandsServed: 1,
      activeConversations: 0, uptime: 0, messagesProcessed: 0, cachedAt: '',
    }),
  } as Response);
  render(<LandingPage />);
  expect(screen.getByText('THE PRODUCT')).toBeInTheDocument();
});
```

**Important:** The framer-motion mock in `landing.test.tsx` must be updated to include `path: createComponent('path')` in the `motion` object (required by `BentoChart`). Also add a `beforeEach` that mocks `fetch` globally since `DashboardShowcase` calls `fetch('/api/stats')` on mount:

```tsx
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      servers: 1, members: 1, commandsServed: 1,
      activeConversations: 0, uptime: 0, messagesProcessed: 0, cachedAt: '',
    }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
  // keep existing env var cleanup
});
```

And in the framer-motion mock, add `path` to the motion object:
```tsx
motion: {
  div: createComponent('div'),
  // ... existing entries ...
  path: createComponent('path'),  // required for BentoChart
},
```

- [ ] **Step 5: Run all landing-related tests**

Run: `cd web && rtk pnpm vitest run tests/components/landing/ tests/app/landing.test.tsx`
Expected: All PASS

- [ ] **Step 6: Run full test suite**

Run: `cd web && rtk pnpm vitest run`
Expected: All PASS, no regressions

- [ ] **Step 7: Add bento display components to coverage excludes**

In `web/vitest.config.ts`, add to the `coverage.exclude` array:
```typescript
// Landing bento display components — tested via DashboardShowcase integration tests.
// BentoKpi and bento-data have dedicated unit tests.
'src/components/landing/bento/BentoChart.tsx',
'src/components/landing/bento/BentoModeration.tsx',
'src/components/landing/bento/BentoAIChat.tsx',
'src/components/landing/bento/BentoConversations.tsx',
```

- [ ] **Step 8: Run validation chain**

Run: `cd web && rtk pnpm lint && rtk pnpm typecheck`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
rtk git add -A
rtk git commit -m "refactor(landing): replace DashboardPreview with DashboardShowcase bento grid

Remove the old tabbed preview (5 files) and wire in the new animated
bento grid. Update barrel exports, dynamic import, and tests."
```

---

### Task 9: Visual QA & Polish

This task is manual verification, not automated tests.

- [ ] **Step 1: Start dev server**

Run: `cd web && rtk pnpm dev`

- [ ] **Step 2: Check desktop layout (lg+)**

Open http://localhost:3000 in browser at 1440px width. Verify:
- 3-column grid renders correctly
- Chart spans 2 rows on the left
- KPIs show live numbers with count-up animation
- Moderation feed shows 3 randomized items
- AI Chat shows typing indicator → response
- Conversations shows 3 randomized items
- All cells have hover lift effect
- Refresh page — mock data changes each time

- [ ] **Step 3: Check dark/light theme**

Toggle theme. Verify all cells respect the theme — no hardcoded colors.

- [ ] **Step 4: Check tablet (sm-lg)**

Resize to ~768px. Verify:
- 2-column grid
- Chart full-width
- KPIs properly arranged
- No overflow or broken layout

- [ ] **Step 5: Check mobile (<sm)**

Resize to ~375px. Verify:
- Single column stack
- All cells full-width
- Readable text, no cramping

- [ ] **Step 6: Fix any issues found, commit**

```bash
rtk git add -A
rtk git commit -m "fix(landing): polish bento grid responsive layout and visual details"
```

Only create this commit if changes were needed.
