# Config Route-Based Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic 2,229-line `ConfigEditor` component into route-based category pages with a shared React context provider.

**Architecture:** A `ConfigProvider` context in a Next.js layout holds shared draft/save state. Each config category becomes its own route (`/dashboard/config/[category]`), with a landing page at `/dashboard/config`. Category components are extracted into dedicated files that consume the context.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-17-config-route-navigation-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `web/src/components/dashboard/config-editor-utils.ts` | Shared utilities: `parseNumberInput`, `inputClasses`, `generateId`, `isGuildConfig`, `DEFAULT_ACTIVITY_BADGES` |
| `web/src/components/dashboard/config-context.tsx` | `ConfigProvider` + `useConfigContext` hook — all shared state, save/discard/undo, search, guild selection |
| `web/src/components/dashboard/config-categories/config-landing.tsx` | `ConfigLandingContent` — category card grid for landing page |
| `web/src/components/dashboard/config-categories/ai-automation.tsx` | AI Chat + Channel Mode, AI AutoMod, Triage, Memory feature cards |
| `web/src/components/dashboard/config-categories/onboarding-growth.tsx` | Welcome, Reputation, Engagement, TL;DR/AFK, Challenges feature cards |
| `web/src/components/dashboard/config-categories/moderation-safety.tsx` | Moderation, Starboard, Permissions, Audit Log feature cards |
| `web/src/components/dashboard/config-categories/community-tools.tsx` | Community Tool Toggles feature card |
| `web/src/components/dashboard/config-categories/support-integrations.tsx` | Tickets, GitHub Feed feature cards |
| `web/src/app/dashboard/config/layout.tsx` | Server component layout shell (renders `ConfigLayoutShell` client component) |
| `web/src/components/dashboard/config-layout-shell.tsx` | Client component: provider wrapper, header bar, category nav, search, banners, diff modal, keyboard shortcuts |
| `web/src/app/dashboard/config/[category]/page.tsx` | Dynamic route: validates slug, renders matching category component |
| `web/tests/components/dashboard/config-context.test.tsx` | Tests for ConfigProvider |
| `web/tests/components/dashboard/config-editor-utils.test.ts` | Tests for shared utilities |

### Modified files
| File | Change |
|------|--------|
| `web/src/app/dashboard/config/page.tsx` | Server metadata + render `ConfigLandingContent` |
| `web/src/components/dashboard/config-workspace/category-navigation.tsx` | Route-based: `<Link>` + `usePathname()` (desktop), `useRouter().push()` (mobile). Consume `dirtyCounts` via context. |
| `web/src/components/dashboard/config-workspace/types.ts` | Remove dead `ConfigWorkspaceProps` interface |
| `web/src/components/dashboard/config-sections/CommunitySettingsSection.tsx` | Import shared utilities directly instead of receiving them as props; keep `activeCategoryId` prop |
| `web/src/lib/page-titles.ts` | Add category-specific title matchers |

### Deleted files
| File | Reason |
|------|--------|
| `web/src/components/dashboard/config-editor.tsx` | Fully replaced |

---

## Task 1: Extract shared utilities

Extract pure functions and constants from `config-editor.tsx` into a standalone module. No dependencies on React or context.

**Files:**
- Create: `web/src/components/dashboard/config-editor-utils.ts`
- Create: `web/tests/components/dashboard/config-editor-utils.test.ts`

- [ ] **Step 1: Write failing tests for `parseNumberInput`**

```typescript
// web/tests/components/dashboard/config-editor-utils.test.ts
import { describe, expect, it } from 'vitest';
import { parseNumberInput, inputClasses, generateId, isGuildConfig, DEFAULT_ACTIVITY_BADGES } from '@/components/dashboard/config-editor-utils';

describe('parseNumberInput', () => {
  it('returns undefined for empty string', () => {
    expect(parseNumberInput('')).toBeUndefined();
  });

  it('returns undefined for non-finite input', () => {
    expect(parseNumberInput('abc')).toBeUndefined();
    expect(parseNumberInput('NaN')).toBeUndefined();
    expect(parseNumberInput('Infinity')).toBeUndefined();
  });

  it('parses valid number', () => {
    expect(parseNumberInput('42')).toBe(42);
    expect(parseNumberInput('3.14')).toBe(3.14);
  });

  it('clamps to min', () => {
    expect(parseNumberInput('-5', 0)).toBe(0);
  });

  it('clamps to max', () => {
    expect(parseNumberInput('999', undefined, 100)).toBe(100);
  });

  it('clamps to both min and max', () => {
    expect(parseNumberInput('150', 0, 100)).toBe(100);
    expect(parseNumberInput('-10', 0, 100)).toBe(0);
  });
});

describe('generateId', () => {
  it('returns a string matching UUID v4 format', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('isGuildConfig', () => {
  it('rejects null and arrays', () => {
    expect(isGuildConfig(null)).toBe(false);
    expect(isGuildConfig([])).toBe(false);
  });

  it('rejects object with no known sections', () => {
    expect(isGuildConfig({ unknown: 'value' })).toBe(false);
  });

  it('accepts object with known section as object', () => {
    expect(isGuildConfig({ ai: { enabled: true } })).toBe(true);
    expect(isGuildConfig({ moderation: {} })).toBe(true);
  });

  it('rejects known section that is array or null', () => {
    expect(isGuildConfig({ ai: null })).toBe(false);
    expect(isGuildConfig({ ai: [1, 2] })).toBe(false);
  });
});

describe('inputClasses', () => {
  it('is a non-empty string', () => {
    expect(typeof inputClasses).toBe('string');
    expect(inputClasses.length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_ACTIVITY_BADGES', () => {
  it('has 4 tiers with days and labels', () => {
    expect(DEFAULT_ACTIVITY_BADGES).toHaveLength(4);
    for (const badge of DEFAULT_ACTIVITY_BADGES) {
      expect(typeof badge.days).toBe('number');
      expect(typeof badge.label).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && rtk pnpm vitest run tests/components/dashboard/config-editor-utils.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the utilities module**

Extract these from `web/src/components/dashboard/config-editor.tsx` (lines 41-131, 62-67) into `web/src/components/dashboard/config-editor-utils.ts`:

```typescript
// web/src/components/dashboard/config-editor-utils.ts
import type { BotConfig, DeepPartial } from '@/types/config';

type GuildConfig = DeepPartial<BotConfig>;

/** Shared input styling for text inputs and textareas in the config editor. */
export const inputClasses =
  'w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

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

/**
 * Generate a UUID with fallback for environments without crypto.randomUUID.
 *
 * @returns A UUID v4 string.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Type guard that checks whether a value is a guild configuration object returned by the API.
 *
 * @returns `true` if the value is an object containing at least one known top-level section and each present section is a plain object.
 */
export function isGuildConfig(data: unknown): data is GuildConfig {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  const knownSections = [
    'ai', 'welcome', 'spam', 'moderation', 'triage', 'starboard', 'permissions', 'memory',
    'help', 'announce', 'snippet', 'poll', 'showcase', 'tldr', 'reputation', 'afk',
    'engagement', 'github', 'review', 'challenges', 'tickets', 'auditLog',
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && rtk pnpm vitest run tests/components/dashboard/config-editor-utils.test.ts
```
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/components/dashboard/config-editor-utils.ts web/tests/components/dashboard/config-editor-utils.test.ts
git commit -m "$(cat <<'EOF'
refactor(web): extract config editor shared utilities

Extract parseNumberInput, inputClasses, generateId, isGuildConfig, and
DEFAULT_ACTIVITY_BADGES from config-editor.tsx into config-editor-utils.ts
for reuse across category components.
EOF
)"
```

---

## Task 2: Create ConfigProvider context

Extract all shared state (guild selection, config fetch/save, draft management, search, derived state) from `ConfigEditor` into a React context provider.

**Files:**
- Create: `web/src/components/dashboard/config-context.tsx`
- Create: `web/tests/components/dashboard/config-context.test.tsx`

- [ ] **Step 1: Write failing test for ConfigProvider**

```typescript
// web/tests/components/dashboard/config-context.test.tsx
import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// Mock next/navigation
const mockPush = vi.fn();
const mockPathname = vi.fn(() => '/dashboard/config');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush }),
}));

const minimalConfig = {
  ai: { enabled: false, systemPrompt: '', blockedChannelIds: [] },
  moderation: { enabled: false },
  welcome: { enabled: false },
  triage: { enabled: false },
  starboard: { enabled: false },
  permissions: { enabled: false },
  memory: { enabled: false },
};

describe('ConfigProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('volvox-bot-selected-guild', 'guild-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('provides initial state with loading true then config after fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );

    const { result } = renderHook(() => useConfigContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.draftConfig).not.toBeNull();
    });

    expect(result.current.guildId).toBe('guild-123');
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it('updateDraftConfig marks hasChanges', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );

    const { result } = renderHook(() => useConfigContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.draftConfig).not.toBeNull();
    });

    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, enabled: true },
      }));
    });

    expect(result.current.hasChanges).toBe(true);
  });

  it('discardChanges resets draft to saved', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigProvider, useConfigContext } = await import(
      '@/components/dashboard/config-context'
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );

    const { result } = renderHook(() => useConfigContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.draftConfig).not.toBeNull();
    });

    act(() => {
      result.current.updateDraftConfig((prev) => ({
        ...prev,
        ai: { ...prev.ai, enabled: true },
      }));
    });

    expect(result.current.hasChanges).toBe(true);

    act(() => {
      result.current.discardChanges();
    });

    expect(result.current.hasChanges).toBe(false);
  });

  it('throws when useConfigContext is used outside provider', async () => {
    const { useConfigContext } = await import('@/components/dashboard/config-context');

    expect(() => {
      renderHook(() => useConfigContext());
    }).toThrow('useConfigContext must be used within ConfigProvider');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && rtk pnpm vitest run tests/components/dashboard/config-context.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create ConfigProvider**

Create `web/src/components/dashboard/config-context.tsx`. Extract from `config-editor.tsx`:
- All state declarations (lines 143-167): `guildId`, `loading`, `saving`, `showDiffModal`, `prevSavedConfig`, `error`, `savedConfig`, `draftConfig`, `activeCategoryId` (now derived from `usePathname()`), `searchQuery`, `focusFeatureId`, `selectedSearchItemId`
- `updateDraftConfig` (line 169)
- Guild selection effect (lines 173-199)
- `fetchConfig` (lines 202-257)
- All derived state: `hasChanges`, `hasValidationErrors`, `changedSections`, `searchResults`, `matchedFeatureIds`, `activeCategory`, `visibleFeatureIds`, `selectedSearchItem`, `forceOpenAdvancedFeatureId`, `dirtyCategoryCounts`, `changedCategoryCount` (lines 260-346)
- Search handlers: `handleSearchSelect` (now navigates via `router.push()`), `handleSearchChange` (lines 348-357)
- Focus feature effect (lines 359-372)
- Before unload effect (lines 374-385)
- Save/diff logic: `openDiffModal`, `revertSection`, `executeSave`, `undoLastSave`, auto-dismiss timer (lines 389-559)
- Keyboard shortcuts: Ctrl/Cmd+S, `/` for search, Escape (lines 561-609)
- `discardChanges` (lines 612-617)

**Key changes from the original:**
- `activeCategoryId` is derived from `usePathname()` — parse the last segment of `/dashboard/config/[category]`, default to `null` on the landing page
- `handleSearchSelect` uses `router.push()` to navigate to the result's category
- `forceOpenAdvancedFeatureId` resets on pathname change via a `usePathname()` effect:
  ```typescript
  // Reset forceOpenAdvancedFeatureId when route changes
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      setFocusFeatureId(null);
      setSelectedSearchItemId(null);
      prevPathnameRef.current = pathname;
    }
  }, [pathname]);
  ```
- `visibleFeatureIds` handles `null` active category (landing page) by returning empty set
- Remove all JSX — only state + context value
- Export `ConfigProvider` component and `useConfigContext` hook
- Export `GuildConfig` type alias for use in category components

> **Note:** All line numbers reference the original `config-editor.tsx` before any modifications. The file is not modified until Task 9.

The context value shape matches the spec's `ConfigContextValue` interface exactly (minus `dmStepsRaw` which is local to onboarding-growth).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && rtk pnpm vitest run tests/components/dashboard/config-context.test.tsx
```
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/components/dashboard/config-context.tsx web/tests/components/dashboard/config-context.test.tsx
git commit -m "$(cat <<'EOF'
refactor(web): create ConfigProvider context for config editor state

Extract all shared state management from ConfigEditor into a React
context provider. Derives active category from URL pathname, handles
cross-category search navigation, and provides save/discard/undo.
EOF
)"
```

---

## Task 3: Update CategoryNavigation to route-based

Convert from state-driven (`onClick` + `activeCategoryId` prop) to route-driven (`<Link>` + `usePathname()`).

**Files:**
- Modify: `web/src/components/dashboard/config-workspace/category-navigation.tsx`
- Modify: `web/src/components/dashboard/config-workspace/types.ts`

- [ ] **Step 1: Update `types.ts` — remove dead `ConfigWorkspaceProps`**

Remove the `ConfigWorkspaceProps` interface (lines 52-59) from `web/src/components/dashboard/config-workspace/types.ts`.

- [ ] **Step 2: Update `CategoryNavigation` to use routes**

Replace `web/src/components/dashboard/config-workspace/category-navigation.tsx`:

```typescript
'use client';

import { Bot, MessageSquareWarning, Sparkles, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { CONFIG_CATEGORIES } from './config-categories';
import type { ConfigCategoryIcon, ConfigCategoryId } from './types';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<ConfigCategoryIcon, typeof Sparkles> = {
  sparkles: Sparkles,
  users: Users,
  'message-square-warning': MessageSquareWarning,
  bot: Bot,
  ticket: Ticket,
};

interface CategoryNavigationProps {
  dirtyCounts: Record<ConfigCategoryId, number>;
}

/**
 * Route-based category navigation for the config editor.
 *
 * Desktop: renders a vertical list of Link buttons.
 * Mobile: renders a select that uses router.push() for programmatic navigation.
 *
 * @param dirtyCounts - A record mapping category ids to their unsaved change counts.
 */
export function CategoryNavigation({ dirtyCounts }: CategoryNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Extract active category from pathname: /dashboard/config/[category]
  const pathSegments = pathname.split('/');
  const activeSlug = pathSegments.length > 3 ? pathSegments[3] : null;

  return (
    <>
      <div className="space-y-2 md:hidden">
        <Label htmlFor="config-category-picker" className="text-xs text-muted-foreground">
          Category
        </Label>
        <select
          id="config-category-picker"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={activeSlug ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            if (value) {
              router.push(`/dashboard/config/${value}`);
            } else {
              router.push('/dashboard/config');
            }
          }}
        >
          {/* New: Overview option navigates back to landing page */}
          <option value="">Overview</option>
          {CONFIG_CATEGORIES.map((category) => {
            const dirtyCount = dirtyCounts[category.id];
            const dirtyLabel = dirtyCount > 0 ? ` (${dirtyCount})` : '';
            return (
              <option key={category.id} value={category.id}>
                {category.label}
                {dirtyLabel}
              </option>
            );
          })}
        </select>
      </div>

      <aside className="hidden md:block">
        <div className="sticky top-24 space-y-2 rounded-lg border bg-card p-3">
          {CONFIG_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.icon];
            const isActive = activeSlug === category.id;
            const dirtyCount = dirtyCounts[category.id];

            return (
              <Link
                key={category.id}
                href={`/dashboard/config/${category.id}`}
                className={cn(
                  'flex h-auto w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{category.label}</span>
                </span>
                {dirtyCount > 0 && (
                  <Badge variant="default" className="min-w-5 justify-center px-1.5">
                    {dirtyCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd web && rtk pnpm tsc --noEmit
```
Expected: No errors related to `CategoryNavigation` or `ConfigWorkspaceProps`.

- [ ] **Step 4: Commit**

```bash
rtk git add web/src/components/dashboard/config-workspace/category-navigation.tsx web/src/components/dashboard/config-workspace/types.ts
git commit -m "$(cat <<'EOF'
refactor(web): convert CategoryNavigation to route-based navigation

Replace onClick/state-driven category switching with Link (desktop) and
router.push (mobile). Remove dead ConfigWorkspaceProps interface.
EOF
)"
```

---

## Task 4: Extract category components

Extract the JSX for each category's feature cards from `config-editor.tsx` into standalone components that consume `useConfigContext()`.

**Files:**
- Create: `web/src/components/dashboard/config-categories/ai-automation.tsx`
- Create: `web/src/components/dashboard/config-categories/onboarding-growth.tsx`
- Create: `web/src/components/dashboard/config-categories/moderation-safety.tsx`
- Create: `web/src/components/dashboard/config-categories/community-tools.tsx`
- Create: `web/src/components/dashboard/config-categories/support-integrations.tsx`
- Modify: `web/src/components/dashboard/config-sections/CommunitySettingsSection.tsx`

### Sub-task 4a: AiAutomationCategory

- [ ] **Step 1: Create `ai-automation.tsx`**

Extract from `config-editor.tsx` lines 1099-1950 (AI Chat, Channel Mode, AI AutoMod, Triage, Memory feature cards). The component:
- Is `'use client'`
- Imports `useConfigContext` from `config-context`
- Imports `parseNumberInput`, `inputClasses` from `config-editor-utils`
- Defines local `useCallback` updaters: `updateSystemPrompt`, `updateAiEnabled`, `updateAiBlockedChannels`, `updateChannelMode`, `updateDefaultChannelMode`, `resetAllChannelModes`, `updateAiAutoModField`, `updateTriageEnabled`, `updateTriageField`, `updateMemoryField`
- Renders `SettingsFeatureCard` for each feature, using `visibleFeatureIds` and `forceOpenAdvancedFeatureId` from context
- Uses existing `ChannelModeSection`, `SystemPromptEditor`, `ToggleSwitch`, `ChannelSelector` components

```typescript
// Structure (not full code — extract from config-editor.tsx):
'use client';

import { useCallback } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { inputClasses, parseNumberInput } from '@/components/dashboard/config-editor-utils';
import { ChannelModeSection } from '@/components/dashboard/config-sections/ChannelModeSection';
import { SettingsFeatureCard } from '@/components/dashboard/config-workspace/settings-feature-card';
import { ChannelSelector } from '@/components/ui/channel-selector';
import { SystemPromptEditor } from '@/components/dashboard/system-prompt-editor';
import { ToggleSwitch } from '@/components/dashboard/toggle-switch';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';
import type { ChannelMode } from '@/types/config';

export function AiAutomationCategory() {
  const {
    draftConfig, saving, guildId, visibleFeatureIds,
    forceOpenAdvancedFeatureId, updateDraftConfig,
  } = useConfigContext();

  // ... all AI/Triage/Memory updaters (useCallback wrappers)
  // ... JSX from config-editor.tsx lines 1099-1950
}
```

- [ ] **Step 2: Verify file compiles**

```bash
cd web && rtk pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
rtk git add web/src/components/dashboard/config-categories/ai-automation.tsx
git commit -m "feat(web): extract AiAutomationCategory component"
```

### Sub-task 4b: ModerationSafetyCategory

- [ ] **Step 1: Create `moderation-safety.tsx`**

Extract from `config-editor.tsx` lines 1369-2149 (Moderation, Starboard, Permissions, Audit Log). Defines local updaters: `updateModerationEnabled`, `updateModerationField`, `updateModerationDmNotification`, `updateModerationEscalation`, `updateRateLimitField`, `updateLinkFilterField`, `updateProtectRolesField`, `updateStarboardField`, `updatePermissionsField`, `updateAuditLogField`.

- [ ] **Step 2: Verify file compiles**

```bash
cd web && rtk pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
rtk git add web/src/components/dashboard/config-categories/moderation-safety.tsx
git commit -m "feat(web): extract ModerationSafetyCategory component"
```

### Sub-task 4c: OnboardingGrowthCategory

- [ ] **Step 1: Create `onboarding-growth.tsx`**

Extract Welcome feature card from `config-editor.tsx` lines 1155-1367. Also renders Reputation, Engagement, TL;DR/AFK, Challenges — these currently live in `CommunitySettingsSection` under `activeCategoryId === 'onboarding-growth'`.

This component:
- Defines local `dmStepsRaw` / `setDmStepsRaw` state, initialized from `draftConfig` on mount:
  ```typescript
  const { draftConfig } = useConfigContext();
  const [dmStepsRaw, setDmStepsRaw] = useState(
    () => (draftConfig?.welcome?.dmSequence?.steps ?? []).join('\n')
  );
  ```
  This re-initializes from `draftConfig` each time the component mounts (when navigating to this category). The parsed steps are already in `draftConfig`, so the raw string doesn't need to survive unmount.
- Defines Welcome updaters: `updateWelcomeEnabled`, `updateWelcomeMessage`, `updateWelcomeField`, `updateWelcomeRoleMenu`, `updateWelcomeDmSequence`
- Renders the Welcome `SettingsFeatureCard` directly
- Renders `CommunitySettingsSection` for the onboarding-growth features (reputation, engagement, tldr-afk, challenges)

- [ ] **Step 2: Verify file compiles**

```bash
cd web && rtk pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
rtk git add web/src/components/dashboard/config-categories/onboarding-growth.tsx
git commit -m "feat(web): extract OnboardingGrowthCategory component"
```

### Sub-task 4d: CommunityToolsCategory and SupportIntegrationsCategory

- [ ] **Step 1: Create `community-tools.tsx`**

Thin wrapper that renders `CommunitySettingsSection` for `activeCategoryId === 'community-tools'`.

- [ ] **Step 2: Create `support-integrations.tsx`**

Thin wrapper that renders `CommunitySettingsSection` for `activeCategoryId === 'support-integrations'`.

- [ ] **Step 3: Update CommunitySettingsSection props**

The `CommunitySettingsSection` currently takes `activeCategoryId` and uses it to gate which features render. Since each category component now only calls it for one category, the `activeCategoryId` prop is still needed (the component renders features for 3 different categories). Keep the prop — each wrapper passes its own category id.

However, the props `inputClasses`, `defaultActivityBadges`, and `parseNumberInput` should be imported directly instead of passed as props. Update `CommunitySettingsSection`:
- Import `inputClasses`, `parseNumberInput`, `DEFAULT_ACTIVITY_BADGES` from `@/components/dashboard/config-editor-utils`
- Remove those three from the `CommunitySettingsSectionProps` interface
- Update all call sites

- [ ] **Step 4: Verify all files compile**

```bash
cd web && rtk pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/components/dashboard/config-categories/community-tools.tsx web/src/components/dashboard/config-categories/support-integrations.tsx web/src/components/dashboard/config-sections/CommunitySettingsSection.tsx
git commit -m "$(cat <<'EOF'
feat(web): extract CommunityTools and SupportIntegrations categories

Add thin wrapper components for community-tools and support-integrations.
Refactor CommunitySettingsSection to import shared utilities directly.
EOF
)"
```

---

## Task 5: Create landing page

**Files:**
- Create: `web/src/components/dashboard/config-categories/config-landing.tsx`
- Modify: `web/src/app/dashboard/config/page.tsx`

- [ ] **Step 1: Create `ConfigLandingContent` client component**

```typescript
// web/src/components/dashboard/config-categories/config-landing.tsx
'use client';

import { Bot, MessageSquareWarning, Sparkles, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfigContext } from '@/components/dashboard/config-context';
import { CONFIG_CATEGORIES } from '@/components/dashboard/config-workspace/config-categories';
import type { ConfigCategoryIcon } from '@/components/dashboard/config-workspace/types';

const CATEGORY_ICONS: Record<ConfigCategoryIcon, typeof Sparkles> = {
  sparkles: Sparkles,
  users: Users,
  'message-square-warning': MessageSquareWarning,
  bot: Bot,
  ticket: Ticket,
};

/**
 * Landing page content for the config editor.
 * Renders a responsive grid of category cards with dirty count badges.
 */
export function ConfigLandingContent() {
  const { dirtyCategoryCounts, loading } = useConfigContext();

  if (loading) return null; // Layout shows the loader

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CONFIG_CATEGORIES.map((category) => {
        const Icon = CATEGORY_ICONS[category.icon];
        const dirtyCount = dirtyCategoryCounts[category.id];

        return (
          <Link
            key={category.id}
            href={`/dashboard/config/${category.id}`}
            className="group"
          >
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <CardTitle className="text-base">{category.label}</CardTitle>
                  </div>
                  {dirtyCount > 0 && (
                    <Badge variant="default" className="min-w-5 justify-center px-1.5">
                      {dirtyCount}
                    </Badge>
                  )}
                </div>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Update `page.tsx` to render landing page**

Replace `web/src/app/dashboard/config/page.tsx`:

```typescript
import type { Metadata } from 'next';
import { ConfigLandingContent } from '@/components/dashboard/config-categories/config-landing';
import { createPageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = createPageMetadata(
  'Bot Config',
  'Manage your bot configuration settings.',
);

/**
 * Config landing page — renders category cards for navigating to config sections.
 */
export default function ConfigPage() {
  return <ConfigLandingContent />;
}
```

- [ ] **Step 3: Verify file compiles**

```bash
cd web && rtk pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
rtk git add web/src/components/dashboard/config-categories/config-landing.tsx web/src/app/dashboard/config/page.tsx
git commit -m "feat(web): add config landing page with category card grid"
```

---

## Task 6: Create config layout

The layout wraps all `/dashboard/config/*` routes with `ConfigProvider` and persistent chrome.

**Files:**
- Create: `web/src/app/dashboard/config/layout.tsx`

- [ ] **Step 1: Create the config layout**

**Important: server/client split.** In Next.js App Router, a `'use client'` layout causes child page `metadata` exports to be ignored. The layout must be a **server component** that renders a client component shell.

Structure:
- `layout.tsx` is a **server component** (no `'use client'` directive)
- It renders `ConfigLayoutShell` (a client component) that wraps `{children}` in `ConfigProvider`
- `ConfigLayoutShell` renders `ConfigLayoutInner` which consumes context for the chrome

The inner component:
- Wraps `{children}` in `ConfigProvider`
- Splits into an inner component (`ConfigLayoutInner`) that consumes the context for rendering chrome
- Renders: header bar (title + save/discard/undo), banners, `CategoryNavigation`, `ConfigSearch`, `{children}`, `ConfigDiff`, `ConfigDiffModal`
- Handles loading/error/no-guild states (extracted from config-editor.tsx lines 943-984)

The layout structure matches the spec's ASCII diagram. Extract the header bar JSX from config-editor.tsx lines 987-1038 and the grid layout from lines 1040-1098.

```typescript
// web/src/app/dashboard/config/layout.tsx (SERVER component — no 'use client')
import { ConfigLayoutShell } from '@/components/dashboard/config-layout-shell';

export default function ConfigLayout({ children }: { children: React.ReactNode }) {
  return <ConfigLayoutShell>{children}</ConfigLayoutShell>;
}
```

```typescript
// web/src/components/dashboard/config-layout-shell.tsx (CLIENT component)
'use client';

import { ConfigProvider, useConfigContext } from '@/components/dashboard/config-context';
// ... other imports

export function ConfigLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider>
      <ConfigLayoutInner>{children}</ConfigLayoutInner>
    </ConfigProvider>
  );
}

function ConfigLayoutInner({ children }: { children: React.ReactNode }) {
  const { /* all needed context values */ } = useConfigContext();

  // No guild selected state
  // Loading state
  // Error state

  // Main layout:
  // - Header with save/discard/undo
  // - Grid with CategoryNavigation sidebar + main content
  // - Banners, search bar
  // - {children} slot
  // - ConfigDiff + ConfigDiffModal
}
```

- [ ] **Step 2: Verify file compiles**

```bash
cd web && rtk pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
rtk git add web/src/app/dashboard/config/layout.tsx web/src/components/dashboard/config-layout-shell.tsx
git commit -m "feat(web): add config layout with provider and persistent chrome"
```

---

## Task 7: Create dynamic category route

**Files:**
- Create: `web/src/app/dashboard/config/[category]/page.tsx`

- [ ] **Step 1: Create the category page**

```typescript
// web/src/app/dashboard/config/[category]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  CONFIG_CATEGORIES,
  FEATURE_LABELS,
} from '@/components/dashboard/config-workspace/config-categories';
import type { ConfigCategoryId } from '@/components/dashboard/config-workspace/types';
import { AiAutomationCategory } from '@/components/dashboard/config-categories/ai-automation';
import { CommunityToolsCategory } from '@/components/dashboard/config-categories/community-tools';
import { ModerationSafetyCategory } from '@/components/dashboard/config-categories/moderation-safety';
import { OnboardingGrowthCategory } from '@/components/dashboard/config-categories/onboarding-growth';
import { SupportIntegrationsCategory } from '@/components/dashboard/config-categories/support-integrations';
import { createPageMetadata } from '@/lib/page-titles';

const CATEGORY_COMPONENTS: Record<ConfigCategoryId, React.ComponentType> = {
  'ai-automation': AiAutomationCategory,
  'onboarding-growth': OnboardingGrowthCategory,
  'moderation-safety': ModerationSafetyCategory,
  'community-tools': CommunityToolsCategory,
  'support-integrations': SupportIntegrationsCategory,
};

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

/**
 * Generate metadata for the category page based on the slug.
 */
export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const meta = CONFIG_CATEGORIES.find((c) => c.id === category);
  if (!meta) return createPageMetadata('Bot Config');
  return createPageMetadata(`Bot Config - ${meta.label}`, meta.description);
}

/**
 * Dynamic config category page.
 * Validates the slug against known categories, renders the matching component, or 404s.
 */
export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;

  const isValid = CONFIG_CATEGORIES.some((c) => c.id === category);
  if (!isValid) {
    notFound();
  }

  const Component = CATEGORY_COMPONENTS[category as ConfigCategoryId];
  return <Component />;
}
```

- [ ] **Step 2: Verify file compiles**

```bash
cd web && rtk pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
rtk git add web/src/app/dashboard/config/\\[category\\]/page.tsx
git commit -m "feat(web): add dynamic config category route with validation"
```

---

## Task 8: Update page titles

**Files:**
- Modify: `web/src/lib/page-titles.ts`

- [ ] **Step 1: Add category-specific matchers**

In `web/src/lib/page-titles.ts`, replace the existing `/dashboard/config` matcher with category-specific matchers. Insert these **before** the generic config matcher (order matters — more specific first):

```typescript
// Add individual category matchers
{
  matches: (pathname) => pathname === '/dashboard/config/ai-automation',
  title: 'Bot Config - AI & Automation',
},
{
  matches: (pathname) => pathname === '/dashboard/config/onboarding-growth',
  title: 'Bot Config - Onboarding & Growth',
},
{
  matches: (pathname) => pathname === '/dashboard/config/moderation-safety',
  title: 'Bot Config - Moderation & Safety',
},
{
  matches: (pathname) => pathname === '/dashboard/config/community-tools',
  title: 'Bot Config - Community Tools',
},
{
  matches: (pathname) => pathname === '/dashboard/config/support-integrations',
  title: 'Bot Config - Support & Integrations',
},
// Keep the generic fallback for /dashboard/config (landing page) and unknown sub-routes
{
  matches: (pathname) =>
    pathname === '/dashboard/config' || pathname.startsWith('/dashboard/config/'),
  title: 'Bot Config',
},
```

- [ ] **Step 2: Verify existing page-titles tests still pass**

```bash
cd web && rtk pnpm vitest run tests/lib/page-titles.test.ts
```
Expected: All PASS (if tests exist; if not, verify typecheck).

- [ ] **Step 3: Commit**

```bash
rtk git add web/src/lib/page-titles.ts
git commit -m "feat(web): add category-specific page title matchers for config routes"
```

---

## Task 9: Delete old ConfigEditor and update existing tests

**Files:**
- Delete: `web/src/components/dashboard/config-editor.tsx`
- Modify: `web/tests/components/dashboard/config-editor-autosave.test.tsx`

- [ ] **Step 1: Delete `config-editor.tsx`**

```bash
rm web/src/components/dashboard/config-editor.tsx
```

- [ ] **Step 2: Verify no remaining imports**

```bash
cd web && rtk pnpm tsc --noEmit
```

If there are remaining imports of `ConfigEditor` (e.g., in the test file), fix them.

- [ ] **Step 3: Update existing test file**

The test file `web/tests/components/dashboard/config-editor-autosave.test.tsx` imports `ConfigEditor` directly. This test needs to be rewritten to test against the new layout + provider architecture. The tests should:
- Render `ConfigProvider` with mocked fetch, then render category components
- Test navigation between categories (mock `useRouter` and `usePathname`)
- Keep the same coverage: category rendering, search filtering, save/discard flows

Update the imports from `@/components/dashboard/config-editor` to `@/components/dashboard/config-context` and the category components.

- [ ] **Step 4: Run all tests**

```bash
cd web && rtk pnpm vitest run
```
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/components/dashboard/config-editor.tsx web/tests/components/dashboard/config-editor-autosave.test.tsx
git commit -m "$(cat <<'EOF'
refactor(web): remove monolithic ConfigEditor, update tests

Delete the 2,229-line config-editor.tsx, now fully replaced by
ConfigProvider + layout + category components. Update integration
tests to use the new architecture.
EOF
)"
```

---

## Task 10: Build verification and visual check

- [ ] **Step 1: Run full validation chain**

```bash
rtk pnpm mono:typecheck && rtk pnpm mono:lint && rtk pnpm mono:test
```
Expected: All pass.

- [ ] **Step 2: Build the web app**

```bash
cd web && rtk pnpm build
```
Expected: Build succeeds with no errors.

- [ ] **Step 2b: Format check**

```bash
cd web && rtk pnpm format
```
Expected: No formatting issues (or auto-fixed).

- [ ] **Step 3: Visual verification**

Start the dev server and use Chrome DevTools MCP to verify:
1. `/dashboard/config` — landing page shows 5 category cards
2. Click a category card — navigates to `/dashboard/config/[category]`
3. Category page shows correct feature cards
4. Sidebar "Bot Config" highlights on all config routes
5. Category nav sidebar shows correct active state
6. Make a change, verify dirty badge appears on nav
7. Navigate between categories — draft changes persist
8. Save flow works (Ctrl/Cmd+S opens diff modal)
9. Check both dark and light themes
10. Check mobile responsive layout (category select)

- [ ] **Step 4: Final commit if any fixes needed**

Stage only the specific files that were fixed, then commit:
```bash
git commit -m "fix(web): address visual verification feedback"
```
