# Config Route-Based Navigation

Split the monolithic bot configuration page into route-based category pages with a shared context provider for cross-category state management.

## Problem

The current `/dashboard/config` page renders all configuration sections in a single 2,229-line `ConfigEditor` component. Categories are filtered client-side via state, but there are no distinct URLs, no deep-linking, and the file is difficult to maintain.

## Solution

Replace the single-page config editor with:

1. A `ConfigProvider` React context that holds shared draft/save state
2. A Next.js layout that renders the persistent chrome (header bar, category nav, save/discard controls, diff modal)
3. A landing page at `/dashboard/config` showing category cards
4. Dynamic route pages at `/dashboard/config/[category]` rendering category-specific feature cards
5. Dedicated category component files extracted from the monolith

## URL Structure

| URL | Content |
|-----|---------|
| `/dashboard/config` | Landing page: category card grid with icons, descriptions, dirty badges |
| `/dashboard/config/ai-automation` | AI Chat (includes Channel Mode sub-section), AI AutoMod, Triage, Memory |
| `/dashboard/config/onboarding-growth` | Welcome, Reputation, Engagement, TL;DR/AFK, Challenges |
| `/dashboard/config/moderation-safety` | Moderation, Starboard, Permissions, Audit Log |
| `/dashboard/config/community-tools` | Community Tool Toggles |
| `/dashboard/config/support-integrations` | Tickets, GitHub Feed |

> **Note:** Channel Mode is not a standalone feature — it renders as a sub-section of AI Chat when `ai-chat` is visible, consistent with the existing `ConfigFeatureId` and `CONFIG_CATEGORIES` definitions.

## Architecture

### ConfigProvider (`config-context.tsx`)

React context wrapping the config layout. Holds all state that spans categories.

```typescript
interface ConfigContextValue {
  // Core state
  guildId: string;
  draftConfig: GuildConfig | null;
  savedConfig: GuildConfig | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  hasChanges: boolean;
  hasValidationErrors: boolean;
  changedSections: string[];

  // Generic updater — category-specific updaters build on this
  updateDraftConfig: (updater: (prev: GuildConfig) => GuildConfig) => void;

  // Search state (driven by layout, consumed by category pages)
  searchQuery: string;
  visibleFeatureIds: Set<ConfigFeatureId>;
  forceOpenAdvancedFeatureId: ConfigFeatureId | null;

  // Save/discard/undo actions
  openDiffModal: () => void;
  discardChanges: () => void;
  undoLastSave: () => void;
  executeSave: () => Promise<void>;
  revertSection: (section: string) => void;

  // Diff modal state
  showDiffModal: boolean;
  setShowDiffModal: (open: boolean) => void;
  prevSavedConfig: { guildId: string; config: GuildConfig } | null;

  // Derived state for navigation
  dirtyCategoryCounts: Record<ConfigCategoryId, number>;
  changedCategoryCount: number;

  // Re-fetch
  fetchConfig: (id: string) => Promise<void>;
}
```

**Design decisions:**
- Category-specific updaters (e.g., `updateAiEnabled`, `updateModerationField`) live in their respective category component files as `useCallback` wrappers around `updateDraftConfig`, not in the context itself. This keeps the context lean.
- `dmStepsRaw` (the raw textarea string for DM sequence steps) lives as local state in `onboarding-growth.tsx`, not in the context. The parsed result is already stored in `draftConfig.welcome.dmSequence.steps`. The raw string doesn't need to survive navigation away from the onboarding category — it re-initializes from `draftConfig` when the component mounts.
- `forceOpenAdvancedFeatureId` resets to `null` on route change via a `usePathname()` effect in the provider, preventing stale advanced-section expansion when navigating between categories.
- `visibleFeatureIds` is derived from the current route's category and the search query. The provider reads the active category from `usePathname()` rather than storing it as state.

### Config Layout (`/dashboard/config/layout.tsx`)

Client component that:

- Wraps `{children}` in `ConfigProvider`
- Renders the page header with title, subtitle, save/discard/undo buttons
- Renders unsaved-changes and validation-error banners (full-width)
- Renders the `CategoryNavigation` sidebar (desktop) / select (mobile)
- Renders the `ConfigSearch` bar
- Renders `ConfigDiff` (inline) and `ConfigDiffModal`
- Registers keyboard shortcuts (Ctrl/Cmd+S for save, `/` for search, Escape to clear search)
- Registers `beforeunload` listener for unsaved changes

Layout structure:
```
┌─────────────────────────────────────────────┐
│ Header: "Bot Configuration" + Save/Discard  │
├─────────────────────────────────────────────┤
│ [Unsaved changes banner]                    │
│ [Validation errors banner]                  │
├──────────────┬──────────────────────────────┤
│ Category Nav │ Search bar                   │
│ (sidebar)    │ {children} ← route content   │
│              │                              │
└──────────────┴──────────────────────────────┘
│ [Inline diff]                               │
│ [Diff modal]                                │
└─────────────────────────────────────────────┘
```

### Landing Page (`/dashboard/config/page.tsx`)

**Server component** that exports `metadata` via `createPageMetadata()` and renders a client component `ConfigLandingContent`.

`ConfigLandingContent` (client component) consumes `ConfigProvider` via `useConfigContext()` and renders a responsive grid of category cards. Each card shows:
- Category icon
- Category label
- Category description
- Dirty count badge (if unsaved changes exist for that category)
- Clickable — navigates to `/dashboard/config/${category.id}`

The `ConfigLandingContent` component lives in `web/src/components/dashboard/config-categories/config-landing.tsx`.

### Category Page (`/dashboard/config/[category]/page.tsx`)

- Reads `params.category` and validates against `CONFIG_CATEGORIES`
- Invalid slugs call `notFound()` (renders the nearest `not-found.tsx`, idiomatic Next.js App Router)
- Renders the matching category component (e.g., `AiAutomationCategory`)
- Each category component consumes `useConfigContext()` for `draftConfig`, `saving`, `guildId`, `visibleFeatureIds`, `forceOpenAdvancedFeatureId`, and `updateDraftConfig`

### Category Components

Extracted from the monolithic `ConfigEditor` render into dedicated files:

| File | Features | Approximate lines |
|------|----------|-------------------|
| `ai-automation.tsx` | AI Chat + Channel Mode sub-section, AI AutoMod, Triage, Memory | ~350 |
| `onboarding-growth.tsx` | Welcome (incl. local `dmStepsRaw` state), Reputation, Engagement, TL;DR/AFK, Challenges | ~250 |
| `moderation-safety.tsx` | Moderation, Starboard, Permissions, Audit Log | ~350 |
| `community-tools.tsx` | Community Tool Toggles (wraps `CommunitySettingsSection`) | ~50 |
| `support-integrations.tsx` | Tickets, GitHub Feed | ~150 |

Each category file:
- Is a `'use client'` component
- Imports and uses `useConfigContext()` for shared state
- Defines its own `useCallback` updater wrappers (e.g., `updateTriageField`)
- Renders `SettingsFeatureCard` instances for its features
- Uses the existing `config-sections/` components where they exist

### Shared Utilities (`config-editor-utils.ts`)

Extracted from `ConfigEditor` since they're used across multiple categories:

- `parseNumberInput(raw, min?, max?)` — numeric input parser
- `inputClasses` — shared Tailwind class string for text inputs
- `generateId()` — UUID generator with fallback
- `isGuildConfig(data)` — type guard for API responses
- `DEFAULT_ACTIVITY_BADGES` — constant for engagement section

## File Changes

### New files

| File | Purpose |
|------|---------|
| `web/src/app/dashboard/config/layout.tsx` | Config layout with provider + persistent chrome |
| `web/src/app/dashboard/config/[category]/page.tsx` | Dynamic category route |
| `web/src/components/dashboard/config-context.tsx` | ConfigProvider + useConfigContext hook |
| `web/src/components/dashboard/config-editor-utils.ts` | Shared utilities extracted from ConfigEditor |
| `web/src/components/dashboard/config-categories/config-landing.tsx` | Landing page client component (ConfigLandingContent) |
| `web/src/components/dashboard/config-categories/ai-automation.tsx` | AI & Automation features |
| `web/src/components/dashboard/config-categories/onboarding-growth.tsx` | Onboarding & Growth features |
| `web/src/components/dashboard/config-categories/moderation-safety.tsx` | Moderation & Safety features |
| `web/src/components/dashboard/config-categories/community-tools.tsx` | Community Tools features |
| `web/src/components/dashboard/config-categories/support-integrations.tsx` | Support & Integrations features |

### Modified files

| File | Change |
|------|--------|
| `web/src/app/dashboard/config/page.tsx` | Replace `ConfigEditor` import with server metadata + `ConfigLandingContent` client component |
| `web/src/components/dashboard/config-workspace/category-navigation.tsx` | Desktop: replace `onClick` buttons with `<Link>` + `usePathname()`. Mobile: replace `onChange` with `useRouter().push()` for programmatic navigation. Remove `activeCategoryId` and `onCategoryChange` props; add `dirtyCounts` via context. |
| `web/src/components/dashboard/config-workspace/types.ts` | Remove `ConfigWorkspaceProps` interface (dead code after refactor) |
| `web/src/lib/page-titles.ts` | Add matchers for `/dashboard/config` and `/dashboard/config/:category` with category-specific titles |

### Deleted files

| File | Reason |
|------|--------|
| `web/src/components/dashboard/config-editor.tsx` | Fully replaced by context + layout + category components |

### Unchanged files

- All `config-sections/*.tsx` components
- `config-workspace/config-search.tsx`
- `config-workspace/settings-feature-card.tsx`
- `config-workspace/config-categories.ts`
- `config-diff.tsx`, `config-diff-modal.tsx`
- `toggle-switch.tsx`, `system-prompt-editor.tsx`, `reset-defaults-button.tsx`
- `components/layout/sidebar.tsx` (existing `isActive` check already handles sub-routes)

## Navigation Behavior

### Category navigation
`CategoryNavigation` switches from state-driven to route-driven:
- Desktop: each category button becomes a `<Link href="/dashboard/config/${category.id}">`
- Mobile: the `<select>` element uses `useRouter().push()` on change for programmatic navigation (since `<select>` cannot contain `<Link>` children)
- Active state derived from `usePathname()` instead of `activeCategoryId` prop
- Dirty count badges rendered from `dirtyCategoryCounts` via context

### Search behavior
- Search results in the dropdown include the category name and link to the correct category page when clicked
- When on a category page, the visible features list filters to that category's features only (same as current behavior)
- From the landing page, clicking a search result navigates to the matching category page and scrolls to the feature
- Cross-category results are visible in the search dropdown regardless of current route; selecting one navigates to the correct category

### Cross-category state persistence
Navigating between `/config/ai-automation` and `/config/moderation-safety` preserves all draft state because `ConfigProvider` lives in the layout and isn't unmounted.

### Leaving config entirely
Navigating away from `/dashboard/config/*` unmounts the layout and loses draft state. The existing `beforeunload` listener handles page close/refresh. No in-app navigation blocking is added (same behavior as today).

### Sidebar highlighting
The main dashboard sidebar's "Bot Config" link at `/dashboard/config` already uses `pathname.startsWith(item.href + '/')` for active detection, so it highlights correctly for all sub-routes. The exact match on `/dashboard/config` also highlights correctly for the landing page.

## Testing

- Existing config-related tests continue to work against the same API and config types
- New tests needed:
  - `ConfigProvider` context: state initialization, `updateDraftConfig`, save/discard/undo flows
  - Landing page: renders category cards, displays dirty badges, links navigate correctly
  - Category page: validates slug, renders correct features, invalid slug triggers `notFound()`
  - `CategoryNavigation`: active link matches current route, dirty badges render, mobile select navigates
  - Each category component: renders expected feature cards with correct props from context
  - Search: cross-category results navigate to correct category page

## Migration

This is a full replacement, not incremental:
1. Create all new files
2. Update modified files
3. Delete `config-editor.tsx`
4. Verify build passes
5. Visual verification via Chrome DevTools MCP
