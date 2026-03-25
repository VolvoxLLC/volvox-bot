# Product Section Redesign — Bento Grid

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Landing page "THE PRODUCT" section — full tear-down and rebuild

---

## Overview

Replace the current tabbed `DashboardPreview` component with an animated bento grid that communicates "this dashboard is powerful." The new section uses a 3-column grid with 7 cells showcasing analytics, live KPIs, moderation, AI chat, and conversations.

### Design Goals

- **Impression:** "Wow, this dashboard is powerful"
- **Visual style:** Bento grid (Linear / Vercel aesthetic)
- **Interaction model:** Animated with live feel — count-up counters, chart path draw, pulsing indicators, typing animation
- **Theme:** Respects light/dark toggle (no forced dark)
- **Data:** Mix of live data from `/api/stats` and dynamic mock data randomized per mount

---

## Section Structure

The section uses the existing `SectionHeader` component with:
- **Label:** "THE PRODUCT" (labelColor: "primary")
- **Title:** "Your server, at a glance"
- **Subtitle:** "A dashboard that makes you feel in control."

The entire section is wrapped in `ScrollStage` for scroll-triggered entrance, matching the pattern used by all other landing sections.

## Grid Layout

```
Desktop (3-column):
┌─────────────────────┬────────────┬────────────┐
│                     │  Members   │  Commands  │
│  Server Activity    │  (live)    │  Served    │
│  (chart, 2 rows)    │            │  (live)    │
│                     ├────────────┼────────────┤
│                     │  Servers   │ Moderation │
│                     │  (live)    │  (mock)    │
├─────────────────────┴────────────┼────────────┤
│  AI Chat (mock)                  │ Convos     │
│  (spans cols 1-2)                │ (mock)     │
└──────────────────────────────────┴────────────┘

Tablet (2-column):
- Chart spans full-width top row
- KPIs use a 3-column flex row (breaks out of the 2-col grid)
- Moderation + AI Chat side-by-side
- Conversations full-width bottom

Mobile (1-column):
- All cells stack vertically
- Order: Chart → Members → Commands → Servers → Moderation → AI Chat → Conversations
```

---

## Cell Specifications

### 1. Server Activity (Chart)

- **Position:** Col 1, rows 1-2 (large cell)
- **Data source:** Mock — randomized on mount
- **Content:**
  - SVG area chart with gradient fill (primary green)
  - 7 data points with heights randomized between 30-95% on mount
  - General uptrend bias in the random generation
  - "LIVE" badge with pulsing green dot (top-right)
  - Legend: Messages (green) + AI Responses (purple)
- **Animation:**
  - Path draws left-to-right on scroll-in (~1s)
  - Gradient fill fades in behind the path
  - LIVE dot pulses infinitely (subtle scale + opacity)

### 2. Members (KPI)

- **Position:** Col 2, row 1
- **Data source:** Live — `stats.members` from `/api/stats`
- **Content:**
  - Large number with `AnimatedCounter` (reuse existing component)
  - Label: "Total Members"
  - Mini progress bar + "live" indicator
- **Animation:** Count-up from 0 on scroll-in. Pass `duration={1.2}` to `AnimatedCounter` (default is 2s).

### 3. Commands Served (KPI)

- **Position:** Col 3, row 1
- **Data source:** Live — `stats.commandsServed` from `/api/stats`
- **Content:**
  - Large number formatted with `formatNumber` (e.g., "48.2k")
  - Label: "Commands Served"
  - "live" badge in purple
- **Animation:** Count-up from 0 on scroll-in. Pass `duration={1.2}` to `AnimatedCounter`.

### 4. Servers (KPI)

- **Position:** Col 2, row 2
- **Data source:** Live — `stats.servers` from `/api/stats`
- **Content:**
  - Large number with `AnimatedCounter`
  - Label: "Servers"
  - "live" indicator
- **Animation:** Count-up from 0 on scroll-in. Pass `duration={1.2}` to `AnimatedCounter`.

### 5. Moderation Feed

- **Position:** Col 3, row 2
- **Data source:** Mock — dynamic random
- **Content:**
  - Title: "Moderation"
  - 3 action items randomly selected from a pool of ~10 templates
  - Each item: colored severity dot (red/amber/green) + description + relative timestamp
  - Timestamps shuffled from a set (e.g., "just now", "2m", "5m", "12m", "23m", "45m")
- **Template pool examples:**
  - Red: "Spam removed in #general", "Phishing link blocked in #links", "Mass-mention blocked"
  - Amber: "Toxicity warning issued", "User warned for caps spam", "Slow mode triggered"
  - Green: "Raid blocked — {N} accounts", "Auto-ban: known spam account", "Link scan passed"
- **Animation:**
  - Top item's dot pulses (same style as LIVE badge)
  - Items stagger-enter on scroll-in

### 6. AI Chat

- **Position:** Col 1-2, row 3 (spans 2 columns)
- **Data source:** Mock — dynamic random
- **Content:**
  - Title: "AI Chat"
  - 1 random Q&A pair selected from a pool of ~6 conversations
  - User message bubble (left-aligned, purple avatar) — intentionally inverted from typical chat UX to create a "reading a conversation" feel rather than "you are chatting"
  - Bot response bubble (right-aligned, green avatar with "V")
- **Conversation pool examples:**
  - "How do I set up auto-roles?" → "Head to Dashboard → Settings → Auto Roles..."
  - "What are the moderation commands?" → "Use /warn, /mute, /ban, or /kick..."
  - "How do I set up webhooks?" → "Go to Server Settings → Integrations → Webhooks..."
  - "Can I customize the AI personality?" → "Yes! Dashboard → AI Settings → System Prompt..."
  - "How does the XP system work?" → "Members earn XP per message with a cooldown..."
  - "How do I enable starboard?" → "Dashboard → Features → Starboard. Set the emoji and threshold..."
- **Animation:**
  - User message fades in first
  - Bot response shows 3-dot typing indicator for ~1s, then resolves into text
  - Typing dots use a bounce animation (staggered scale)

### 7. Conversations

- **Position:** Col 3, row 3
- **Data source:** Mock — dynamic random
- **Content:**
  - Title: "Conversations"
  - 3 conversation rows randomly selected from a pool of ~8
  - Each row: colored avatar initial, question preview, message count, token count badge, timestamp
  - Token counts randomized between 0.8k-4.8k
  - Message counts randomized between 4-18
  - Timestamps shuffled from a set
- **Conversation pool examples:**
  - "How to configure webhooks?", "Explain the XP system", "Ban appeal process?", "Set up welcome messages", "Custom bot prefix?", "Role hierarchy help", "Auto-mod settings", "Channel permissions"
- **Animation:** Rows stagger-enter on scroll-in

---

## Data Architecture

### Live Data

Share the existing `/api/stats` fetch with the `Stats` component lower on the page. Either:
- Lift the fetch to a shared context/hook so both `DashboardShowcase` and `Stats` consume the same request
- Or duplicate the fetch (acceptable since the endpoint has `s-maxage=60` caching)

**Decision:** Duplicate the fetch. Simpler, and the response is CDN-cached (`s-maxage=60, stale-while-revalidate=300`). In local dev without a CDN, both components make separate live requests — acceptable for development.

### Mock Data Randomization

- Use `useMemo` with empty deps to generate random selections once on mount
- Moderation: `shuffleAndPick(moderationPool, 3)` + random timestamps
- AI Chat: `pickRandom(conversationPool)`
- Conversations: `shuffleAndPick(conversationPool, 3)` + random token/message counts
- Chart heights: `Array.from({ length: 7 }, () => 30 + Math.random() * 65)` with slight uptrend

All randomization happens client-side on mount. Values stay stable during the session (no re-randomization on re-render).

---

## Animation Details

| Element | Type | Duration | Trigger | Reduced Motion |
|---|---|---|---|---|
| Grid cell entrance | Staggered fade-up | 0.45s per cell, 0.08s stagger | `useInView` (once) | Instant appear |
| KPI count-up | Number animation | ~1.2s, ease-out | After cell enters view | Show final value |
| Chart path draw | SVG path animation | ~1s | After cell enters view | Show complete chart |
| LIVE badge pulse | Scale + opacity loop | Infinite, 2s cycle | Immediately | Static dot |
| Moderation top dot | Pulse (matches LIVE) | Infinite, 2s cycle | Immediately | Static dot |
| AI typing indicator | 3-dot bounce | ~1s, then resolve | After cell enters view | Show final text |
| Conversations entrance | Staggered fade-up per row | 0.4s per row, 0.08s stagger | `useInView` (once) | Instant appear |
| Cell hover | translateY(-2px) + border glow | 0.2s transition | CSS hover | No change |

All animations check `useReducedMotion() ?? false` (coalesce with `false` for SSR safety, matching codebase convention) and skip if true.

---

## Component Architecture

```
web/src/components/landing/
├── DashboardShowcase.tsx          # Section wrapper, fetches /api/stats, grid layout
├── bento/
│   ├── BentoChart.tsx             # SVG area chart with path draw animation
│   ├── BentoKpi.tsx               # Reusable KPI cell (counter + label + indicator)
│   ├── BentoModeration.tsx        # Moderation feed with random picks
│   ├── BentoAIChat.tsx            # AI chat with typing animation
│   └── BentoConversations.tsx     # Conversation list with random picks
```

### Files to Delete

- `DashboardPreview.tsx`
- `DashboardOverviewTab.tsx`
- `DashboardModerationTab.tsx`
- `DashboardAIChatTab.tsx`
- `DashboardSettingsTab.tsx`

### Files to Modify

- `page.tsx` — Replace `DashboardPreview` dynamic import with `DashboardShowcase`. **Must maintain the same `dynamic(() => import(...), { ssr: false })` pattern** for code-splitting and client-only rendering.
- `index.ts` — Remove `DashboardPreview` from barrel exports (not re-exported there currently, but verify).

### Loading & Error States

- **Loading:** KPI cells show a pulse skeleton (same pattern as `KpiSkeleton` in the analytics dashboard): a `h-8 w-16 animate-pulse rounded bg-muted` block for the number, smaller block for the label.
- **Error / unavailable:** Show "—" as the value with muted text, matching the `Stats` component's error pattern.
- **Mock cells:** No loading state needed — they render immediately from randomized data.

---

## Responsive Behavior

- **Desktop (lg+):** 3-column grid as specified
- **Tablet (sm-lg):** 2-column grid. Chart full-width. 3 KPIs in a row. Remaining cells 2-up.
- **Mobile (<sm):** Single column stack. All cells full-width. Chart → KPIs → Moderation → AI Chat → Conversations.

Grid uses CSS grid with `grid-template-columns` and `grid-template-rows`. Responsive breakpoints via Tailwind classes.

---

## Theme Support

- All colors use CSS custom properties (`hsl(var(--primary))`, `var(--border)`, etc.)
- Card backgrounds use `bg-card`, borders use `border-border`
- Accent colors for indicators use theme-aware HSL variables
- No hardcoded dark-mode colors — everything inherits from the theme

---

## Dependencies

- **Existing:** Framer Motion (animations), Lucide React (icons if needed), existing `AnimatedCounter` and `ScrollStage` components
- **New:** None

---

## Success Criteria

- [ ] All 7 cells render correctly on desktop, tablet, and mobile
- [ ] KPI cells show live data from `/api/stats` with animated counters
- [ ] Mock data randomizes on each page load
- [ ] All animations trigger on scroll and respect `useReducedMotion`
- [ ] Section respects light/dark theme toggle
- [ ] Old `DashboardPreview` and tab components are fully removed
- [ ] No regressions in other landing page sections
