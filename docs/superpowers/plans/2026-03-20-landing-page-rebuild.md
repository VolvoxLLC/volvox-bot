# Landing Page Full Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Volvox.Bot landing page into a premium, conversion-focused experience with cinematic scroll transitions, an interactive dashboard preview, competitor comparison table, upgraded hero, and real testimonial slots.

**Architecture:** Component-per-section approach. Shared utilities (`SectionHeader`, `AnimatedCounter`) extracted first, then each section built independently with TDD. Below-fold sections lazy-loaded via `next/dynamic`. All existing patterns (ScrollStage, framer-motion mocking, CSS custom properties) preserved.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Framer Motion 12, Vitest + Testing Library, Lucide React icons

**Spec:** `docs/superpowers/specs/2026-03-20-landing-page-rebuild-design.md`

---

## File Map

| File | Responsibility | Status |
|------|---------------|--------|
| `web/src/components/landing/AnimatedCounter.tsx` | Shared animated number counter with `useInView` trigger | New (extracted from Stats.tsx) |
| `web/src/components/landing/SectionHeader.tsx` | Shared section header: uppercase label + title + subtitle | New |
| `web/src/components/landing/Hero.tsx` | Hero with fast typewriter, rebuilt ChatConsole V2 | Rewrite |
| `web/src/components/landing/DashboardPreview.tsx` | Tab bar + AnimatePresence wrapper for dashboard mockup | New |
| `web/src/components/landing/DashboardOverviewTab.tsx` | KPIs, activity chart, recent events | New |
| `web/src/components/landing/DashboardModerationTab.tsx` | Mod stats, actions feed, visual toggles | New |
| `web/src/components/landing/DashboardAIChatTab.tsx` | Conversation preview, AI stats | New |
| `web/src/components/landing/DashboardSettingsTab.tsx` | Feature toggles, config previews | New |
| `web/src/components/landing/ComparisonTable.tsx` | Competitor feature matrix | New |
| `web/src/components/landing/FeatureGrid.tsx` | 2x2 feature cards with mini-previews | Rewrite |
| `web/src/components/landing/Pricing.tsx` | 2-tier pricing (Free + Pro) | Rewrite |
| `web/src/components/landing/Stats.tsx` | Merged testimonials + condensed live stats | Rewrite |
| `web/src/components/landing/Footer.tsx` | Footer CTA with Discord blue button | Rewrite |
| `web/src/components/landing/index.ts` | Barrel exports | Modify |
| `web/src/app/page.tsx` | Page shell, section order, dynamic imports | Rewrite |
| `web/src/app/globals.css` | New utility classes if needed (glow shadows, etc.) | Modify |
| `DESIGN.md` | Update design system docs to reflect landing page changes | Modify |

---

## Framer Motion Test Mock (Shared Pattern)

Every test file in this project mocks framer-motion the same way. Copy this pattern into each new test file. The mock strips animation props and renders plain HTML elements so tests can assert on content without triggering animation logic.

```tsx
const { mockUseInView, mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
  mockUseReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(({ animate: _animate, initial: _initial, transition: _transition, whileHover: _whileHover, ...props }: any, ref: any) =>
      React.createElement(tag, { ...props, ref }, props.children)
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: createComponent('div'),
      h1: createComponent('h1'),
      h2: createComponent('h2'),
      li: createComponent('li'),
      p: createComponent('p'),
      span: createComponent('span'),
      section: createComponent('section'),
    },
    useInView: (...args: unknown[]) => mockUseInView(...args),
    useScroll: () => ({ scrollY: 0, scrollYProgress: 0 }),
    useSpring: (value: unknown) => value,
    useTransform: (_value: unknown, _input: unknown, output: unknown[]) => output[0],
    useReducedMotion: () => mockUseReducedMotion(),
  };
});
```

---

## Task 1: Extract AnimatedCounter

**Files:**
- Create: `web/src/components/landing/AnimatedCounter.tsx`
- Create: `web/tests/components/landing/animated-counter.test.tsx`
- Modify: `web/src/components/landing/Stats.tsx` (remove AnimatedCounter, import from new file)
- Modify: `web/src/components/landing/index.ts` (add export)

- [ ] **Step 1: Write the failing test**

```tsx
// web/tests/components/landing/animated-counter.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// paste framer-motion mock from shared pattern above

import { AnimatedCounter } from '@/components/landing/AnimatedCounter';

describe('AnimatedCounter', () => {
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

  it('should render the formatted target value after animation completes', async () => {
    render(<AnimatedCounter target={1234} />);
    await waitFor(() => { expect(screen.getByText('1.2K')).toBeInTheDocument(); });
  });

  it('should accept a custom formatter', async () => {
    const fmt = (n: number) => `${n}s`;
    render(<AnimatedCounter target={42} formatter={fmt} />);
    await waitFor(() => { expect(screen.getByText('42s')).toBeInTheDocument(); });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm vitest run tests/components/landing/animated-counter.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Extract AnimatedCounter from Stats.tsx**

Copy the `AnimatedCounter` function and its `formatNumber` helper from `web/src/components/landing/Stats.tsx` into the new file. Export both. The interface:

```tsx
// web/src/components/landing/AnimatedCounter.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface AnimatedCounterProps {
  readonly target: number;
  readonly duration?: number;
  readonly formatter?: (n: number) => string;
}

export function AnimatedCounter({ target, duration = 2, formatter = formatNumber }: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isInView) return;
    let startTime: number | null = null;
    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      const eased = 1 - (1 - progress) ** 3;
      setCount(Math.floor(eased * target));
      if (progress < 1) { rafRef.current = requestAnimationFrame(animate); }
      else { setCount(target); }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [isInView, target, duration]);

  return <span ref={ref}>{formatter(count)}</span>;
}
```

- [ ] **Step 4: Update Stats.tsx to import from new file**

Replace the private `AnimatedCounter` and `formatNumber` in Stats.tsx with:
```tsx
import { AnimatedCounter, formatNumber } from './AnimatedCounter';
```
Remove the old function definitions.

- [ ] **Step 5: Add export to index.ts**

Add `export { AnimatedCounter } from './AnimatedCounter';` to `web/src/components/landing/index.ts`.

- [ ] **Step 6: Run tests to verify everything passes**

Run: `cd web && pnpm vitest run tests/components/landing/animated-counter.test.tsx tests/components/landing/stats.test.tsx`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/components/landing/AnimatedCounter.tsx web/tests/components/landing/animated-counter.test.tsx web/src/components/landing/Stats.tsx web/src/components/landing/index.ts
git commit -m "refactor(web): extract AnimatedCounter into shared component"
```

---

## Task 2: Create SectionHeader

**Files:**
- Create: `web/src/components/landing/SectionHeader.tsx`
- Create: `web/tests/components/landing/section-header.test.tsx`
- Modify: `web/src/components/landing/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// web/tests/components/landing/section-header.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionHeader } from '@/components/landing/SectionHeader';

describe('SectionHeader', () => {
  it('should render label, title, and subtitle', () => {
    render(<SectionHeader label="THE PRODUCT" labelColor="primary" title="Your server" subtitle="Configure everything." />);
    expect(screen.getByText('THE PRODUCT')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Your server');
    expect(screen.getByText('Configure everything.')).toBeInTheDocument();
  });

  it('should render without subtitle when not provided', () => {
    render(<SectionHeader label="FEATURES" labelColor="accent" title="Everything you need" />);
    expect(screen.getByText('FEATURES')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Everything you need');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm vitest run tests/components/landing/section-header.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement SectionHeader**

```tsx
// web/src/components/landing/SectionHeader.tsx
interface SectionHeaderProps {
  readonly label: string;
  readonly labelColor: 'primary' | 'secondary' | 'accent';
  readonly title: string;
  readonly subtitle?: string;
  readonly className?: string;
}

const labelColorClasses: Record<string, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  accent: 'text-accent',
};

export function SectionHeader({ label, labelColor, title, subtitle, className }: SectionHeaderProps) {
  return (
    <div className={`text-center ${className ?? ''}`}>
      <div className={`text-[10px] uppercase tracking-[2.5px] font-bold mb-2 ${labelColorClasses[labelColor]}`}>
        {label}
      </div>
      <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
        {title}
      </h2>
      {subtitle && (
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">{subtitle}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add export to index.ts**

- [ ] **Step 5: Run tests**

Run: `cd web && pnpm vitest run tests/components/landing/section-header.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/landing/SectionHeader.tsx web/tests/components/landing/section-header.test.tsx web/src/components/landing/index.ts
git commit -m "feat(web): add shared SectionHeader component for landing sections"
```

---

## Task 3: Rebuild Hero

**Files:**
- Rewrite: `web/src/components/landing/Hero.tsx`
- Rewrite: `web/tests/components/landing/hero.test.tsx`

This is the largest and most invasive task. Key changes: typewriter speed 40ms/char (was 80ms), start delay 150ms (was 500ms), bot typing 18ms/char (was 22ms), rebuilt ChatConsole chrome with channel context and colored avatar glows, coordinated entrance sequence.

- [ ] **Step 1: Write the updated Hero test**

Update `web/tests/components/landing/hero.test.tsx` with new timing assertions. The typewriter completes in ~550ms (10 chars * 40ms + 150ms delay). Use `vi.advanceTimersByTime(800)` to ensure completion.

**Important:** The existing Hero test mock only has `motion.div`, `motion.h1`, `motion.p`, `motion.span`. Upgrade the mock to the shared pattern (which includes `motion.h2`, `motion.li`, `motion.section`, `AnimatePresence`, `useReducedMotion`). The rebuilt Hero may use any of these.

```tsx
// Key test changes:
it('should use 40ms typing speed and 150ms start delay', () => {
  render(<Hero />);
  // At 0ms: only badge visible, typewriter hasn't started
  expect(screen.getByText(/Building the future of Discord communities/i)).toBeInTheDocument();
  expect(document.querySelector('.terminal-cursor')).not.toBeNull();
});

it('should reveal headline and CTAs after typewriter completes', () => {
  render(<Hero />);
  act(() => { vi.advanceTimersByTime(800); }); // 150ms delay + 10 chars * 40ms + buffer
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/volvox-bot\s*AI-powered Discord\./i);
  expect(screen.getByRole('link', { name: /Open Dashboard/i })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: /View on GitHub/i })).toBeInTheDocument();
});

it('should render the chat console with channel context', () => {
  render(<Hero />);
  expect(screen.getByText('volvox-bot')).toBeInTheDocument();
  expect(screen.getByText('#general')).toBeInTheDocument();
});

it('should still render correctly when reduced motion is enabled', () => {
  mockUseReducedMotion.mockReturnValue(true);
  render(<Hero />);
  expect(screen.getByText(/Building the future of Discord communities/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails against old Hero**

Run: `cd web && pnpm vitest run tests/components/landing/hero.test.tsx`
Expected: FAIL (old timing, missing #general)

- [ ] **Step 3: Rewrite Hero.tsx**

Key implementation changes:
- `useTypewriter(text, 40, 150)` — was `(text, 80, 300)`
- ChatConsole: add `#general` channel indicator in chrome, VS Code-style header with Terminal icon + server name + channel
- Bot bubbles: `setInterval` at 18ms (was 22ms)
- Avatar glows: `box-shadow: 0 0 12px` using icon tone color
- Entrance delays: coordinated from single `isInView` trigger (badge 0.1s, headline 0.2s, subtitle 0.9s, CTAs 1.1s, console 1.4s)
- Preserve all existing scroll parallax effects (copyY, consoleY, glowY, etc.)

- [ ] **Step 4: Run tests**

Run: `cd web && pnpm vitest run tests/components/landing/hero.test.tsx`
Expected: PASS

- [ ] **Step 5: Run full landing test suite to check for regressions**

Run: `cd web && pnpm vitest run tests/components/landing/`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/landing/Hero.tsx web/tests/components/landing/hero.test.tsx
git commit -m "feat(web): rebuild hero with faster typewriter and upgraded chat console"
```

---

## Task 4: Create DashboardPreview

**Files:**
- Create: `web/src/components/landing/DashboardPreview.tsx`
- Create: `web/src/components/landing/DashboardOverviewTab.tsx`
- Create: `web/src/components/landing/DashboardModerationTab.tsx`
- Create: `web/src/components/landing/DashboardAIChatTab.tsx`
- Create: `web/src/components/landing/DashboardSettingsTab.tsx`
- Create: `web/tests/components/landing/dashboard-preview.test.tsx`
- Modify: `web/src/components/landing/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// web/tests/components/landing/dashboard-preview.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// paste framer-motion mock

import { DashboardPreview } from '@/components/landing/DashboardPreview';

describe('DashboardPreview', () => {
  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('should render the Overview tab by default', () => {
    render(<DashboardPreview />);
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Messages Today')).toBeInTheDocument();
    expect(screen.getByText('Server Activity')).toBeInTheDocument();
  });

  it('should switch to Moderation tab when clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardPreview />);
    await user.click(screen.getByRole('button', { name: /Moderation/i }));
    expect(screen.getByText(/Threats Blocked/i)).toBeInTheDocument();
  });

  it('should switch to AI Chat tab when clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardPreview />);
    await user.click(screen.getByRole('button', { name: /AI Chat/i }));
    expect(screen.getByText(/Conversations/i)).toBeInTheDocument();
  });

  it('should switch to Settings tab when clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardPreview />);
    await user.click(screen.getByRole('button', { name: /Settings/i }));
    expect(screen.getByText(/AI Chat/i)).toBeInTheDocument();
    expect(screen.getByText(/Starboard/i)).toBeInTheDocument();
  });

  it('should render all 4 tab buttons', () => {
    render(<DashboardPreview />);
    expect(screen.getByRole('button', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Moderation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AI Chat/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Settings/i })).toBeInTheDocument();
  });

  it('should render tabs with keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<DashboardPreview />);
    const overviewTab = screen.getByRole('button', { name: /Overview/i });
    overviewTab.focus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: /Moderation/i })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm vitest run tests/components/landing/dashboard-preview.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement DashboardPreview parent + all 4 tab sub-components**

`DashboardPreview.tsx`: manages `activeTab` state, renders SectionHeader ("THE PRODUCT" / primary), tab bar with button elements, AnimatePresence wrapper that crossfades between tab components. Wrap in ScrollStage.

Each tab sub-component: static JSX with hardcoded mock data. Use Volvox design system colors (primary/secondary/accent/neon-cyan). All styling via Tailwind classes referencing CSS custom properties.

- [ ] **Step 4: Add exports to index.ts**

- [ ] **Step 5: Run tests**

Run: `cd web && pnpm vitest run tests/components/landing/dashboard-preview.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/landing/Dashboard*.tsx web/tests/components/landing/dashboard-preview.test.tsx web/src/components/landing/index.ts
git commit -m "feat(web): add interactive dashboard preview section with 4 tab views"
```

---

## Task 5: Create ComparisonTable

**Files:**
- Create: `web/src/components/landing/ComparisonTable.tsx`
- Create: `web/tests/components/landing/comparison-table.test.tsx`
- Modify: `web/src/components/landing/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// web/tests/components/landing/comparison-table.test.tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// paste framer-motion mock

import { ComparisonTable } from '@/components/landing/ComparisonTable';

describe('ComparisonTable', () => {
  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('should render all competitor column headers', () => {
    render(<ComparisonTable />);
    expect(screen.getByText('Volvox')).toBeInTheDocument();
    expect(screen.getByText('MEE6')).toBeInTheDocument();
    expect(screen.getByText('Dyno')).toBeInTheDocument();
    expect(screen.getByText('Carl-bot')).toBeInTheDocument();
  });

  it('should render all 8 feature rows', () => {
    render(<ComparisonTable />);
    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByText('AI Moderation')).toBeInTheDocument();
    expect(screen.getByText('Open Source')).toBeInTheDocument();
    expect(screen.getByText('Self-Hostable')).toBeInTheDocument();
    expect(screen.getByText('Web Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Starboard')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Free Tier')).toBeInTheDocument();
  });

  it('should render the section header', () => {
    render(<ComparisonTable />);
    expect(screen.getByText('WHY VOLVOX')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Compare the alternatives');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement ComparisonTable**

Data-driven approach: `const comparisonData` array of objects with feature name, description, and per-competitor values. Map over rows in JSX. Volvox-unique rows (Open Source, Self-Hostable) get `bg-primary/3` tint. Wrap in ScrollStage. Use SectionHeader. Mobile: `overflow-x-auto` with `sticky left-0` on feature column.

- [ ] **Step 4: Add export to index.ts**

- [ ] **Step 5: Run tests**

Run: `cd web && pnpm vitest run tests/components/landing/comparison-table.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/landing/ComparisonTable.tsx web/tests/components/landing/comparison-table.test.tsx web/src/components/landing/index.ts
git commit -m "feat(web): add competitor comparison table section"
```

---

## Task 6: Rewrite FeatureGrid

**Files:**
- Rewrite: `web/src/components/landing/FeatureGrid.tsx`
- Rewrite: `web/tests/components/landing/feature-grid.test.tsx`

- [ ] **Step 1: Update the test**

Keep existing assertions for feature titles. Add assertions for mini-preview content and new descriptions. Remove assertions for old detail text that's being replaced.

```tsx
it('should render feature cards with mini-preview content', () => {
  render(<FeatureGrid />);
  expect(screen.getByText('AI Chat')).toBeInTheDocument();
  expect(screen.getByText(/Reply in-channel with Claude/i)).toBeInTheDocument();
  expect(screen.getByText('Moderation')).toBeInTheDocument();
  expect(screen.getByText(/Claude-backed detection/i)).toBeInTheDocument();
  expect(screen.getByText('Starboard')).toBeInTheDocument();
  expect(screen.getByText('Analytics')).toBeInTheDocument();
});

it('should use SectionHeader with FEATURES label', () => {
  render(<FeatureGrid />);
  expect(screen.getByText('FEATURES')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Everything you need');
});
```

- [ ] **Step 2: Rewrite FeatureGrid.tsx**

Replace the text-heavy 2x2 grid with cards that include mini-previews. Each card: colored top accent line, icon in rounded container, description, mini-preview inset. Use SectionHeader. Analytics card uses `hsl(var(--neon-cyan))`. Keep data-driven approach with `features` array. Wrap in ScrollStage.

- [ ] **Step 3: Run tests**

Run: `cd web && pnpm vitest run tests/components/landing/feature-grid.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/landing/FeatureGrid.tsx web/tests/components/landing/feature-grid.test.tsx
git commit -m "feat(web): upgrade feature grid with mini-preview cards"
```

---

## Task 7: Rewrite Pricing

**Files:**
- Rewrite: `web/src/components/landing/Pricing.tsx`
- Rewrite: `web/tests/components/landing/pricing.test.tsx`

- [ ] **Step 1: Update the test**

Remove assertions for the old 3rd "Team" tier. The old test checks for `Contact Sales` and `Save $129.88/year` which won't exist. Update price assertions for 2-tier model. Add SectionHeader assertion.

```tsx
it('should render 2 tiers with monthly pricing by default', () => {
  render(<Pricing />);
  expect(screen.getByText('Free')).toBeInTheDocument();
  expect(screen.getByText('Pro')).toBeInTheDocument();
  expect(screen.getByText('$0')).toBeInTheDocument();
  expect(screen.getByText('$14.99')).toBeInTheDocument();
  // No Team tier
  expect(screen.queryByText('Team')).not.toBeInTheDocument();
  expect(screen.queryByText('Contact Sales')).not.toBeInTheDocument();
});

it('should switch to annual billing', async () => {
  const user = userEvent.setup();
  render(<Pricing />);
  await user.click(screen.getByRole('switch', { name: /toggle annual billing/i }));
  expect(screen.getByText('$115')).toBeInTheDocument();
  expect(screen.getByText('Save $64.88/year')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rewrite Pricing.tsx**

Remove Team tier from `tiers` array. Use SectionHeader ("PRICING" / primary). Refine Pro card: 2px accent border, glow shadow, "Most Popular" badge. Keep annual toggle. Keep existing `getBotInviteUrl()` pattern for CTA links.

- [ ] **Step 3: Run tests**

Run: `cd web && pnpm vitest run tests/components/landing/pricing.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/landing/Pricing.tsx web/tests/components/landing/pricing.test.tsx
git commit -m "feat(web): refine pricing section to 2-tier model with glow styling"
```

---

## Task 8: Rewrite Stats (Testimonials + Stats Merged)

**Files:**
- Rewrite: `web/src/components/landing/Stats.tsx`
- Rewrite: `web/tests/components/landing/stats.test.tsx`

- [ ] **Step 1: Update the test**

The old test checks for 6 stat values and the old trust badge text. Update to check for 3 condensed stats, placeholder testimonial cards, and the "Loved by developers" heading.

```tsx
it('should render 3 condensed stats after successful fetch', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      servers: 1_234, members: 1_200_000, commandsServed: 999,
      activeConversations: 12, uptime: 97_200, messagesProcessed: 5_500,
      cachedAt: '2026-03-11T12:34:56.000Z',
    }),
  } as Response);

  render(<Stats />);

  await waitFor(() => {
    expect(screen.getByText('1.2M')).toBeInTheDocument(); // Members
    expect(screen.getByText('999')).toBeInTheDocument(); // Commands
    expect(screen.getByText('1d 3h')).toBeInTheDocument(); // Uptime
  });
  // Only 3 stats, not 6
  expect(screen.queryByText('5.5K')).not.toBeInTheDocument();
});

it('should render testimonial placeholders', () => {
  render(<Stats />);
  expect(screen.getByRole('heading', { name: /Loved by developers/i })).toBeInTheDocument();
  // 3 placeholder cards
  expect(screen.getAllByText(/coming soon/i)).toHaveLength(3);
});

it('should render error fallback with 3 dashes', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
  render(<Stats />);
  await waitFor(() => { expect(screen.getAllByText('—')).toHaveLength(3); });
});
```

- [ ] **Step 2: Rewrite Stats.tsx**

Import `AnimatedCounter` and `formatNumber` from `./AnimatedCounter`. Import `formatUptime` (keep locally or move to AnimatedCounter — keep local since it's only used here). Replace 6-card stat grid with 3 inline stats (Members, Commands Served, Uptime). Replace fake testimonials with placeholder cards. Keep existing fetch logic for live stats. Use ScrollStage.

- [ ] **Step 3: Run tests**

Run: `cd web && pnpm vitest run tests/components/landing/stats.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/landing/Stats.tsx web/tests/components/landing/stats.test.tsx
git commit -m "feat(web): merge testimonials into stats section with condensed 3-stat layout"
```

---

## Task 9: Rewrite Footer

**Files:**
- Rewrite: `web/src/components/landing/Footer.tsx`
- Create: `web/tests/components/landing/footer.test.tsx` (none exists currently)

- [ ] **Step 1: Write the test**

```tsx
// web/tests/components/landing/footer.test.tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetBotInviteUrl } = vi.hoisted(() => ({
  mockGetBotInviteUrl: vi.fn(),
}));

// paste framer-motion mock

vi.mock('@/lib/discord', () => ({
  getBotInviteUrl: () => mockGetBotInviteUrl(),
}));

import { Footer } from '@/components/landing/Footer';

describe('Footer', () => {
  beforeEach(() => {
    mockGetBotInviteUrl.mockReturnValue('https://discord.com/invite/bot');
  });

  it('should render the CTA with Discord invite link', () => {
    render(<Footer />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Ready to upgrade/i);
    const cta = screen.getByRole('link', { name: /Add to Discord/i });
    expect(cta).toHaveAttribute('href', 'https://discord.com/invite/bot');
  });

  it('should render disabled CTA when no invite URL', () => {
    mockGetBotInviteUrl.mockReturnValue(null);
    render(<Footer />);
    expect(screen.getByText(/Coming Soon/i)).toBeInTheDocument();
  });

  it('should render footer links', () => {
    render(<Footer />);
    expect(screen.getByText('Documentation')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Support Server')).toBeInTheDocument();
  });

  it('should render the tagline and copyright', () => {
    render(<Footer />);
    expect(screen.getByText(/Open source. Self-hostable. Free forever./i)).toBeInTheDocument();
    expect(screen.getByText(/Volvox/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rewrite Footer.tsx**

Use `variant="discord"` Button for the CTA (same variant as InviteButton). Add glow shadow via className. Tighter copy. Keep footer link structure. Use ScrollStage.

- [ ] **Step 3: Run tests**

Run: `cd web && pnpm vitest run tests/components/landing/footer.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/landing/Footer.tsx web/tests/components/landing/footer.test.tsx
git commit -m "feat(web): upgrade footer CTA with Discord blue button and glow shadow"
```

---

## Task 10: Wire Up page.tsx + Final Integration

**Files:**
- Rewrite: `web/src/app/page.tsx`
- Modify: `web/src/components/landing/index.ts` (final exports check)
- Modify: `web/src/app/globals.css` (add any new utility classes needed, e.g., glow shadows for Pro pricing card)
- Modify: `DESIGN.md` (update design system docs per AGENTS.md hard rule)

- [ ] **Step 1: Rewrite page.tsx**

New section order: Hero → DashboardPreview → ComparisonTable → FeatureGrid → Pricing → Stats → Footer.

**Navbar anchors:** The `#features` and `#pricing` anchor IDs in the desktop nav and mobile menu `scrollIntoView` targets must point to the correct section wrappers in the new order. Verify that `<div id="features">` wraps FeatureGrid and `<div id="pricing">` wraps Pricing. No new nav items needed for Dashboard Preview or Comparison.

Use `next/dynamic` for below-fold sections:

```tsx
import dynamic from 'next/dynamic';

const DashboardPreview = dynamic(() => import('@/components/landing/DashboardPreview').then(m => ({ default: m.DashboardPreview })), { ssr: false });
const ComparisonTable = dynamic(() => import('@/components/landing/ComparisonTable').then(m => ({ default: m.ComparisonTable })), { ssr: false });
const Stats = dynamic(() => import('@/components/landing/Stats').then(m => ({ default: m.Stats })), { ssr: false });
```

Hero, FeatureGrid, Pricing, Footer remain in main bundle (above fold or critical path).

Keep existing navbar, scroll progress bar, noise overlay, mobile menu. The `#features` and `#pricing` anchor IDs stay on the same section wrappers.

- [ ] **Step 2: Verify index.ts exports all new components**

Ensure `DashboardPreview`, `ComparisonTable`, `SectionHeader`, `AnimatedCounter` are all exported.

- [ ] **Step 3: Add any new utility classes to globals.css**

If any new CSS classes were needed during implementation (e.g., glow shadows for pricing cards, new animation keyframes), add them now. Check that existing utility classes (`glow-card`, `kpi-card`, `nav-island`, `text-aurora`, etc.) are sufficient before adding new ones.

- [ ] **Step 4: Update DESIGN.md**

Per AGENTS.md hard rule: "Update README.md and CLAUDE.md when changes affect documented behavior, architecture, or patterns." DESIGN.md must reflect landing page component changes. Add a note about the new section order and any new design tokens used.

- [ ] **Step 5: Check login.test.tsx for breakage**

Run: `cd web && pnpm vitest run tests/app/login.test.tsx`
Expected: PASS. If it imports anything from the landing page that changed, fix it.

- [ ] **Step 6: Run full test suite**

Run: `cd web && pnpm vitest run tests/components/landing/`
Expected: ALL PASS

- [ ] **Step 7: Run typecheck and lint**

Run: `cd web && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 8: Run build**

Run: `cd web && pnpm build`
Expected: PASS (verifies dynamic imports resolve correctly)

- [ ] **Step 9: Run coverage**

Run: `cd web && pnpm test:coverage`
Expected: ≥ 85% across statements, branches, functions, lines

- [ ] **Step 10: Commit**

```bash
git add web/src/app/page.tsx web/src/components/landing/index.ts web/src/app/globals.css DESIGN.md
git commit -m "feat(web): wire up landing page rebuild with new section order and code splitting"
```

---

## Task 11: Visual Verification

**Files:** None (verification only)

- [ ] **Step 1: Start the dev server**

Run: `cd web && pnpm dev`

- [ ] **Step 2: Verify with Chrome DevTools MCP**

Open http://localhost:3000 and take screenshots of:
- Hero section (light + dark mode)
- Dashboard Preview (click through all 4 tabs)
- Comparison Table (desktop + mobile viewport)
- Feature Grid
- Pricing
- Testimonials + Stats
- Footer CTA

Check both themes. Check responsive behavior at 375px, 768px, 1440px.

- [ ] **Step 3: Run Lighthouse audit**

Target: Performance ≥ 90, Accessibility ≥ 90

- [ ] **Step 4: Final commit if any visual fixes needed**

---

## Task 12: Validation Gate

- [ ] **Step 1: Run the full validation chain**

```bash
cd web && pnpm lint && pnpm typecheck && pnpm build && pnpm test:coverage
```

All must pass. Coverage must be ≥ 85%.

- [ ] **Step 2: Run from monorepo root**

```bash
pnpm mono:lint && pnpm mono:typecheck && pnpm mono:build && pnpm mono:test:coverage
```

- [ ] **Step 3: Final commit with any remaining fixes**
