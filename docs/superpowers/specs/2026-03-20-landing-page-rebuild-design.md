# Landing Page Full Rebuild — Design Spec

## Overview

Full rebuild of the Volvox.Bot landing page. The current page is functional but feels generic and template-like. This redesign transforms it into a premium, conversion-oriented experience that balances developer-tool craft (Linear, Raycast) with community-product warmth (Discord, Midjourney).

## Goals

1. **Premium & distinctive** — the page should feel hand-crafted, not generated
2. **Conversion-focused narrative** — Hook → Prove it → Compare → Price it → Close
3. **Faster time-to-value** — hero communicates the value prop in under 1 second
4. **Real social proof** — replace fake testimonials with real user quotes
5. **Show the product** — interactive dashboard preview, not just descriptions
6. **Clear differentiation** — competitor comparison table makes the case visually

## Design Direction

**Hybrid: Developer Craft + Community Energy** — Linear/Raycast polish without being sterile. Dark-mode-first hero with glows and gradients, sections that show real community activity. Technical credibility meets "this is fun to use."

## Page Flow (New Order)

```
Hero → Dashboard Preview → Competitor Comparison → Features → Pricing → Testimonials + Stats → Footer CTA
```

Previous order was: Hero → Features → Pricing → Stats → Testimonials → Footer CTA. The new order leads with proof, not promises.

---

## Section 1: Hero

### Current Issues
- 3.5s to see value prop (typewriter at 80ms/char with 500ms start delay)
- Chat console looks like a basic card with generic window chrome
- No channel context in the console

### Design

**Entrance choreography:**

The current Hero uses individual `isInView`-gated `initial/animate` pairs with independent `delay` props on each element. The new Hero replaces this with a single choreographed sequence driven by a shared `isInView` trigger. Each element still uses Framer Motion's `initial/animate` pattern but with coordinated delays from a single timeline:

| Time | Event |
|------|-------|
| 0ms | Background glow fades in (radial gradient, parallax-linked to scroll) |
| 100ms | Badge slides down with secondary/purple accent |
| 200ms | Typewriter starts at 40ms/char (2x faster), 150ms start delay |
| ~700ms | Typewriter completes → "AI-powered Discord." aurora text fades in |
| 900ms | Description paragraph fades up |
| 1100ms | CTA buttons stagger in |
| 1400ms | Chat console scales up with spring physics |
| 2200ms | Chat script begins playing |

**Total time to value: ~700ms** (down from ~3.5s).

**Verification:** The typewriter speed (40ms/char) and start delay (150ms) are testable constants. A unit test should assert these parameter values to prevent regression. The bot typing speed (18ms/char) is similarly a testable constant.

**Chat Console V2:**
- Richer terminal chrome inspired by VS Code/Linear: traffic light dots, command icon, `volvox-bot — #general` in header
- Live indicator with green glow dot
- Bot avatar colors change per icon type (green for bot, purple for shield/sparkles, orange for zap) with box-shadow glow
- User message bubbles use primary green with rounded corners (16px top, 4px bottom-right)
- Bot bubbles use tinted backgrounds with colored borders matching avatar
- Bot typing speed increased to 18ms/char (from 22ms)
- Input bar with `/slash` hint in secondary color

**Scroll behavior:**
- Existing parallax effects (copyY, consoleY, consoleScale, consoleOpacity) are preserved
- Background glow parallaxes slower than copy (existing glowY)
- Bottom gradient fade to bg-primary maintained

**Components affected:** `Hero.tsx` (full rewrite of ChatConsole, updated useTypewriter params, replaced per-element isInView animations with coordinated entrance sequence). This is the most invasive rewrite — existing Hero tests will need significant rework to account for new timing constants, rebuilt ChatConsole markup, and the coordinated animation approach.

---

## Section 2: Dashboard Preview (NEW)

### Purpose
Immediately after the hero, show the actual product. Visitors can click tabs to explore different dashboard views without leaving the landing page.

### Design

**Section header:**
- Label: "THE PRODUCT" (uppercase, primary green, letter-spacing 2.5px)
- Title: "Your server, at a glance"
- Subtitle: "Configure everything from the browser. No YAML. No CLI. No documentation rabbit holes."

**Interactive dashboard mockup:**
- Container: rounded-2xl, subtle border, deep box-shadow, dark card background
- Navigation bar with Volvox logo badge + server name + 4 tabs
- Active tab: green background pill
- Tab content switches with crossfade animation (200ms) + slight vertical slide

**Tab contents:**

All tab content is **static/decorative** — hardcoded mock data rendered as JSX. Nothing fetches from the API or toggles real state. The only interactive element is tab switching itself (clicking a tab swaps the visible content panel). This keeps the component simple and avoids coupling the landing page to backend state.

1. **Overview** (default)
   - 3 KPI cards in a row (Members, Messages Today, AI Responses) with kpi-card styling
   - Each KPI has colored top accent line, animated counter, percentage change indicator
   - Bar chart showing 7-day activity (stylized CSS bars, not a charting library)
   - Recent activity feed with color-coded dot indicators (green=AI, purple=moderation, orange=welcomes)

2. **Moderation**
   - Auto-mod stats (threats blocked today, accuracy rate)
   - Recent actions feed (spam detected, user warned, raid prevented)
   - Rule toggle previews (visual-only, non-functional styled switches)

3. **AI Chat**
   - Conversation count, average response time
   - Sample conversation snippet (static text)
   - Token usage meter (static progress bar)

4. **Settings**
   - Feature toggle cards (visual-only, shows AI Chat: ON, Starboard: ON, Welcome Messages: OFF)
   - Channel selector preview (static)
   - Role permission matrix preview (static)

**Animation:**
- Section enters via ScrollStage (fade + slide up)
- Dashboard container enters with scale(0.96→1) + shadow expansion
- KPI counters use AnimatedCounter (extracted — see Shared Infrastructure below)
- Activity feed items stagger in at 50ms intervals
- Tab switching uses crossfade (AnimatePresence + opacity/y transition, 200ms)

**Component decomposition:** `DashboardPreview.tsx` is the parent component managing tab state. Each tab view should be a separate sub-component to keep file size manageable:
- `DashboardPreview.tsx` — tab bar + AnimatePresence wrapper (~80 lines)
- `DashboardOverviewTab.tsx` — KPIs, chart, activity feed (~120 lines)
- `DashboardModerationTab.tsx` — mod stats, actions feed, toggles (~80 lines)
- `DashboardAIChatTab.tsx` — conversation preview, stats (~80 lines)
- `DashboardSettingsTab.tsx` — feature toggles, config preview (~80 lines)

**Test strategy:** Tests should verify: (a) all 4 tabs render without error, (b) clicking a tab switches the visible content, (c) default tab is Overview, (d) AnimatedCounter renders with correct target values.

---

## Section 3: Competitor Comparison (NEW)

### Purpose
Feature matrix showing Volvox vs MEE6 vs Dyno vs Carl-bot. Lets Volvox's differentiators speak for themselves without trash-talking.

### Design

**Section header:**
- Label: "WHY VOLVOX" (uppercase, secondary purple)
- Title: "Compare the alternatives"
- Subtitle: "See what you get with each bot. No hidden gotchas."

**Comparison table:**
- Container: rounded-2xl, dark background, subtle border
- Header row: Volvox column highlighted in green with logo badge; competitor names in muted text
- Feature rows with name + small description text

**Feature rows:**
| Feature | Volvox | MEE6 | Dyno | Carl-bot |
|---------|--------|------|------|----------|
| AI Chat (Context-aware conversations) | ✓ | ✗ | ✗ | ✗ |
| AI Moderation (Claude-powered) | ✓ | Basic | Basic | Basic |
| Open Source (Inspect, fork, contribute) | ✓ | ✗ | ✗ | ✗ |
| Self-Hostable (Your infra, your data) | ✓ | ✗ | ✗ | ✗ |
| Web Dashboard (Full config UI) | ✓ | ✓ | ✓ | Limited |
| Starboard (Community highlights) | ✓ | ✗ | ✗ | ✓ |
| Analytics (Server health metrics) | ✓ | Paid | ✗ | ✗ |
| Free Tier | Full features | Very limited | Limited | Limited |

**Visual emphasis:**
- Rows where Volvox uniquely wins get a faint green background tint (Open Source, Self-Hostable)
- Volvox checkmarks are green; competitor ✗ marks are very low opacity
- "Basic" and "Paid" labels in muted text (factual, not dismissive)

**Animation:**
- Table enters via ScrollStage
- Rows stagger in from top to bottom (40ms apart)
- Volvox column checkmarks animate with subtle scale pop on entrance

**Mobile behavior:** Horizontal scroll with sticky first column (Feature column stays pinned on left, competitor columns scroll horizontally). This is simpler to implement than stacked cards and preserves the table mental model.

**Competitor data note:** The feature claims in this table (e.g., "MEE6: Very limited free tier") must be verified against each competitor's current public documentation before shipping. Mark data as draft during implementation and verify before merge.

**Optional:** "See full comparison →" link to docs

**Components:** New `ComparisonTable.tsx` component

---

## Section 4: Features (UPGRADED)

### Current Issues
- 2x2 text grid with icon + title + description + detail text
- Text-heavy, doesn't show what the features actually do
- Generic card layout

### Design

**Section header:**
- Label: "FEATURES" (uppercase, accent orange)
- Title: "Everything you need"
- Subtitle: "One bot. One dashboard. No stitching together single-purpose tools."

**Feature cards (2x2 grid):**
Each card now includes a **mini-preview** showing the feature in action:

1. **AI Chat** (primary green accent)
   - Icon: MessageSquare (Lucide)
   - Description: "Reply in-channel with Claude. Context-aware, multi-turn conversations that actually help."
   - Mini-preview: stylized 2-message exchange (user question → bot answer)

2. **Moderation** (secondary purple accent)
   - Icon: Shield (Lucide)
   - Description: "Claude-backed detection for spam, toxicity, and raids. Steps in before your team has to."
   - Mini-preview: event log showing "Spam detected → Message removed, user warned (0.3s)"

3. **Starboard** (accent orange)
   - Icon: Star (Lucide)
   - Description: "Best posts become a running highlight reel. Community votes, bot curates."
   - Mini-preview: "5 reactions → promoted to #starboard"

4. **Analytics** (neon-cyan accent — uses existing `--neon-cyan` CSS variable, HSL 185)
   - Icon: BarChart3 (Lucide)
   - Description: "Track server health from the dashboard. Activity, trends, and AI usage in one place."
   - Mini-preview: tiny 5-bar chart

**Card styling:**
- Colored top accent line (2px, gradient fading right)
- Icon in colored rounded container (36x36px)
- Mini-preview in dark inset container with subtle border
- glow-card hover effect (existing CSS class)
- Staggered entrance animation (80ms per card)

**Components:** `FeatureGrid.tsx` (rewrite with mini-previews, keep data-driven approach)

---

## Section 5: Pricing (UPGRADED)

### Current Issues
- Only 2 tiers but feels thin
- Free CTA goes to GitHub (confusing for non-technical users)
- "Start Free Trial" implies a flow that doesn't exist
- Pricing is aspirational (not live yet)

### Design

**Section header:**
- Label: "PRICING" (uppercase, primary green)
- Title: "Simple, transparent pricing"
- Subtitle: "Start free. Upgrade when your community grows."
- Annual/monthly toggle preserved (refined styling)

**2 tiers: Free and Pro**

**Free tier:**
- Clean card with subtle border
- $0/month forever
- CTA: "Get Started" → links to GitHub repo (secondary/outline style)
- Features: Core bot features, 1 Discord server, Community support, Self-hosted option

**Pro tier (highlighted):**
- 2px accent border with glow shadow (box-shadow with orange tint)
- "Most Popular" badge (orange pill, positioned at top)
- Price with annual savings callout
- CTA: "Start Free Trial" → links to bot invite URL (orange filled button with shadow)
  - Falls back to disabled state if no invite URL
- Features: Everything in Free, Up to 3 servers, AI chat (100 msgs/day), Analytics dashboard, Email support, Custom command aliases

**Footer note:** "All plans include open-source self-hosting option. No credit card required for Free."

**Components:** `Pricing.tsx` (refined styling, same data structure minus Team tier)

---

## Section 6: Testimonials + Stats (MERGED & UPGRADED)

### Current Issues
- Fake testimonials with fabricated names hurt credibility
- 6 stat cards feel like padding
- Two separate subsections within one component

### Design

**Testimonials (top):**
- Title: "Loved by developers" with aurora gradient on "developers"
- 3 cards in a row, each with:
  - Colored top accent line (green, purple, orange — cycling through Volvox palette)
  - Opening quotation mark in low-opacity accent color
  - Real quote text (italic)
  - Divider line
  - Avatar circle (initial letter, colored background matching accent) + name + role
- **Content:** Ship with clearly-marked placeholder quotes (e.g., "[Quote from a real user — coming soon]") using the same card layout. Real quotes will be swapped in as a separate follow-up when the user provides them. The placeholder state should look intentional, not broken.

**Stats (below testimonials):**
- 3 compact inline stat cards (down from 6)
- Members (green), Commands Served (purple), Uptime (orange)
- Uses existing live API data from `/api/stats` with AnimatedCounter
- Small "Live data · refreshed every minute" note below

**Components:** `Stats.tsx` (rewrite — merged testimonials + condensed stats)

---

## Section 7: Footer CTA (UPGRADED)

### Design

- Title: "Ready to upgrade?" with aurora gradient on "upgrade"
- Tighter subtitle copy
- CTA: "Add to Discord — Free" using the existing `variant="discord"` Button variant (which maps to `--color-discord: #5865F2`) with glow shadow
  - Reuses the same variant that `InviteButton` uses for consistency
  - Disabled state with "Coming Soon" if no invite URL
- Tagline: "Open source. Self-hostable. Free forever." in mono font
- Footer links: Documentation, GitHub, Support Server (Lucide icons)
- Copyright line

**Components:** `Footer.tsx` (refined copy + Discord blue CTA)

---

## Shared Infrastructure

### ScrollStage (PRESERVED)
Existing `ScrollStage.tsx` component is kept. All sections wrap content in ScrollStage for parallax entrance/exit effects. Spring physics config unchanged.

### Page Architecture
- Each section targets full-viewport height on desktop (min-h-screen or generous padding)
- Cinematic section transitions via ScrollStage (sections fade/scale/translate as user scrolls)
- Alternating background colors: `bg-[var(--bg-primary)]` ↔ `bg-[var(--bg-secondary)]` for visual rhythm (note: these are the semantic CSS variables, not Tailwind's `bg-primary` which maps to the green color)
- Scroll progress bar at top preserved (existing implementation)

### Navbar
- Floating island navbar preserved (existing implementation)
- **Updated anchors:** Desktop nav links change from `#features` / `#pricing` to the new section order. Keep only `#features` and `#pricing` as nav anchors (Dashboard Preview and Comparison are part of the narrative flow but don't need direct nav links — they're above the fold or close to it).
- **Mobile nav:** Update `scrollIntoView` targets in the mobile menu to match. The mobile menu items stay as Features and Pricing (no new items needed for Dashboard Preview / Comparison).

### Mobile
- Purpose-built responsive layouts, not just "make it narrower"
- Dashboard Preview: tabs stack vertically, KPIs become 2-column
- Comparison Table: horizontal scroll with sticky first column, or stacked cards
- Feature Grid: single column stack
- Stats: 3-up grid maintained (compact enough)
- All touch targets ≥ 44px

### Animation Principles
- All animations respect `prefers-reduced-motion` (existing pattern)
- Entrance animations: fade + slide up, staggered where appropriate
- Micro-interactions: spring physics for buttons, crossfade for tab switching
- Duration budget: 150-300ms for micro, ≤400ms for section transitions
- No decorative-only animation

### Shared Components

**SectionHeader:** The spec introduces a repeated pattern across all sections: uppercase label (colored) + title + subtitle. This should be extracted into a shared `SectionHeader` component to avoid 6 different implementations of the same layout:
```
<SectionHeader label="THE PRODUCT" labelColor="primary" title="Your server, at a glance" subtitle="..." />
```

**AnimatedCounter:** Currently a private function inside `Stats.tsx`. Must be extracted into a shared utility (e.g., `web/src/components/landing/AnimatedCounter.tsx`) so both `Stats.tsx` and `DashboardPreview.tsx` can import it.

### Design System Compliance
- All colors use existing CSS custom properties from globals.css
- Volvox palette: primary green (`--primary`), secondary purple (`--secondary`), accent orange (`--accent`), neon-cyan (`--neon-cyan`)
- Both light and dark mode supported (existing theme system)
- Lucide icons throughout (no emojis in production)
- JetBrains Mono for display/code, Manrope for body (existing fonts)

### Performance
- Below-the-fold sections (DashboardPreview, ComparisonTable, Stats) should use `next/dynamic` with `ssr: false` or React.lazy + Suspense to code-split them out of the initial bundle. This protects the Lighthouse score (target ≥ 90) given the heavy Framer Motion usage.
- Hero and navbar remain in the main bundle (above the fold).

---

## Files Affected

### New Files
- `web/src/components/landing/DashboardPreview.tsx` (parent + tab bar)
- `web/src/components/landing/DashboardOverviewTab.tsx`
- `web/src/components/landing/DashboardModerationTab.tsx`
- `web/src/components/landing/DashboardAIChatTab.tsx`
- `web/src/components/landing/DashboardSettingsTab.tsx`
- `web/src/components/landing/ComparisonTable.tsx`
- `web/src/components/landing/SectionHeader.tsx`
- `web/src/components/landing/AnimatedCounter.tsx` (extracted from Stats.tsx)

### Rewritten Files
- `web/src/components/landing/Hero.tsx` — faster typewriter, rebuilt ChatConsole
- `web/src/components/landing/FeatureGrid.tsx` — cards with mini-previews
- `web/src/components/landing/Stats.tsx` — merged testimonials + condensed stats
- `web/src/components/landing/Footer.tsx` — refined copy, Discord blue CTA
- `web/src/components/landing/Pricing.tsx` — refined styling, 2 tiers
- `web/src/app/page.tsx` — new section order, new component imports

### Modified Files
- `web/src/components/landing/index.ts` — export new components
- `web/src/app/globals.css` — any new utility classes needed

### Preserved Files
- `web/src/components/landing/ScrollStage.tsx` — no changes
- `web/src/components/landing/InviteButton.tsx` — no changes

### Test Files (to update)
- `web/tests/components/landing/feature-grid.test.tsx`
- `web/tests/app/login.test.tsx` (if landing page imports changed)
- New test files for DashboardPreview, ComparisonTable
- Existing test files for Hero, Stats, Footer, Pricing

---

## Out of Scope

- Backend API changes (stats endpoint stays the same)
- Authentication / login flow changes
- Dashboard app changes
- SEO metadata changes (can be a follow-up)
- Real testimonial content (ships with intentional placeholders; real quotes swapped in as a follow-up)
- Actual payment integration (pricing is aspirational)

---

## Success Criteria

1. Value prop visible within 1 second of page load
2. Every section earns its place — no filler
3. Testimonial section ships with intentional placeholders ready for real quotes
4. Dashboard preview demonstrates the actual product
5. Competitor comparison makes differentiation obvious
6. Both light and dark mode look polished
7. All existing tests updated + new tests for new components
8. 85% coverage threshold maintained
9. Lighthouse performance score ≥ 90
10. Accessibility: all interactive elements keyboard-navigable, contrast ≥ 4.5:1
