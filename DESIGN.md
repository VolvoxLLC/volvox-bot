# Volvox.Bot Design System

This file documents the current visual system for the Volvox.Bot website and dashboard. Keep it aligned with `web/src/app/globals.css`, the landing components in `web/src/components/landing`, dashboard chrome in `web/src/components/layout`, and shared UI primitives in `web/src/components/ui`.

## Product Direction

Volvox.Bot should feel like a precise control room for Discord communities: calm, technical, capable, and lightly futuristic. The current design language is muted sage/olive, soft off-white or warm off-black surfaces, restrained glass effects, rounded operational panels, compact labels, and data-heavy bento layouts.

Avoid returning to the older neon-green/purple marketing style. The app now uses subdued contrast, thin borders, soft shadows, and small motion details instead of loud gradients or glow-heavy cards.

## Foundations

### Framework

- Next.js App Router with Tailwind CSS v4.
- Theme switching is class-based through `next-themes` and the `.dark` class on `<html>`.
- Fonts are loaded in `web/src/app/layout.tsx`.
- Shared tokens live in `web/src/app/globals.css`.
- Use `lucide-react` for interface icons.
- Use Radix primitives through the existing local components when available.

### Typography

- Body/UI font: Manrope via `--font-sans`.
- Code, command, version, and telemetry labels: JetBrains Mono via `--font-mono`.
- Display type is heavy and tight, but only for true hero or major section headings.
- Dashboard text should stay compact. Prefer `text-xs`, `text-sm`, and small uppercase labels for operational chrome.
- Do not use negative letter spacing except where the existing hero and section headings already do. New dense UI should use normal tracking or positive uppercase tracking.

### Radius

Global radius token: `--radius: 0.85rem`.

Common shapes:

- Standard controls: `rounded-[14px]` to `rounded-2xl`.
- Dashboard cards: `rounded-2xl`, `rounded-[20px]`, or `rounded-[24px]`.
- Large landing feature cards and windows: `rounded-[2rem]`.
- Floating nav, pills, and status badges: `rounded-full`.
- Icon boxes: `rounded-lg`, `rounded-xl`, or `rounded-[14px]`.

Do not make every surface a pill. Use pills for navigation islands, badges, and compact status elements.

## Color Tokens

Source of truth is `web/src/app/globals.css`.

### Light Theme

| Token | HSL | Approximate role |
| --- | --- | --- |
| `--background` | `60 10% 98%` | warm off-white page canvas |
| `--foreground` | `90 10% 12%` | near-black olive text |
| `--card` | `60 10% 96%` | raised surface |
| `--popover` | `60 10% 96%` | menus and overlays |
| `--primary` | `90 20% 30%` | muted olive action/accent |
| `--secondary` | `90 10% 88%` | secondary fill |
| `--muted` | `90 10% 92%` | quiet panels |
| `--muted-foreground` | `90 5% 45%` | secondary text |
| `--border` | `90 10% 85%` | default border |
| `--destructive` | `0 70% 45%` | destructive state |

### Dark Theme

| Token | HSL | Approximate role |
| --- | --- | --- |
| `--background` | `80 8% 6%` | warm olive off-black |
| `--foreground` | `80 10% 85%` | soft warm text |
| `--card` | `80 8% 9%` | raised dark surface |
| `--popover` | `80 8% 10%` | menus and overlays |
| `--primary` | `90 20% 65%` | muted sage action/accent |
| `--secondary` | `85 8% 13%` | secondary fill |
| `--muted` | `80 8% 12%` | quiet panels |
| `--muted-foreground` | `80 5% 55%` | secondary text |
| `--border` | `80 8% 16%` | default border |
| `--destructive` | `0 60% 55%` | destructive state |

### Fixed Brand/Utility Colors

- Discord CTA: `#5865F2`, hover `#4752C4`, dark `#454FBF`.
- Chart light palette: `#5865F2`, `#16A34A`, `#D97706`, `#7C3AED`, `#0891B2`.
- Chart dark palette: `#818CF8`, `#4ADE80`, `#FCD34D`, `#A78BFA`, `#22D3EE`.

Use Discord blue only for Discord-specific actions such as invite/add buttons. Use `primary` for Volvox product actions.

## Surface Language

### Page Canvas

Pages use `bg-background text-foreground`. The landing page layers subtle prismatic shards, low-opacity grid lines, grain, and radial vignettes. Dashboard pages use a simpler fixed shell with constrained content width.

### Cards and Panels

Cards should feel tactile but quiet:

- Border: `border border-border/40` to `border-border/80`.
- Fill: `bg-card`, `bg-card/40`, `bg-muted/20`, or `bg-background/40`.
- Blur: use `backdrop-blur-xl` or `backdrop-blur-3xl` only when a panel is intentionally glassy.
- Shadow: soft, low-opacity. Avoid heavy colored glows except subtle `primary/5` accents.

Preferred dashboard card wrapper: `DashboardCard` in `web/src/components/dashboard/dashboard-card.tsx`.

### Accent Effects

Acceptable:

- Small primary glow behind an active section.
- Thin gradient bar on page headers.
- Subtle hover translate of `-1px`.
- Soft shimmer on active buttons.
- Low-opacity ambient background shards on landing/CTA sections.

Avoid:

- Saturated neon glows.
- Purple/blue gradient-dominated layouts.
- Decorative orb backgrounds.
- Large marketing cards inside other cards.

## Landing Page

Source: `web/src/app/page.tsx` and `web/src/components/landing`.

Current section order:

1. `LandingNavbar`
2. `Hero`
3. `DashboardShowcase`
4. `ComparisonTable`
5. `FeatureGrid`
6. `Stats`
7. `Footer`

`Pricing` exists but is not currently mounted on the homepage.

### Navbar

The landing navbar is fixed and responsive.

- Desktop starts full-width and transitions into a floating rounded island after scrolling.
- Mobile uses a top sheet menu.
- Logo uses `/icon-192.png`.
- Desktop actions: theme toggle, `Sign In`, and invite CTA.
- Section links scroll to `dashboard`, `compare`, `features`, and `stats` with reduced-motion support.

### Hero

The hero is brand-first.

- H1 text is `VOLVOX`, large, black-weight, and centered.
- `BOT` appears underneath as a mono uppercase engine label.
- Version label sits above the title.
- Primary CTA is a command-console-style `/summon volvox bot` module.
- Background uses prismatic shard, grid overlay, grain, vignette, vertical data threads, and small particles.
- Scroll parallax and entrance animation use GSAP and Framer Motion.

### Dashboard Showcase

The showcase is a mock dashboard browser window.

- Large rounded window with title bar and faux controls.
- KPI row: members, commands served, servers.
- Main bento content: activity chart, moderation, conversations, AI chat.
- Stats are fetched from `/api/stats`; loading/error states must stay visually stable.

### Comparison Table

The comparison section is a rounded table comparing Volvox.Bot, MEE6, Dyno, and Carl-bot.

- Use muted table headers, small uppercase labels, and compact row descriptions.
- Volvox column receives the strongest visual emphasis.
- Mobile/tablet behavior is horizontal scrolling with `min-w-[700px]`.
- Rows may use subtle pointer-follow hover background.

### Feature Grid

Feature cards use a bento grid, not a generic marketing grid.

Current feature set:

- AI Chat
- AI Auto-Moderation
- Reputation / XP System
- User Memory
- TL;DR

Cards have icon boxes, concise copy, and embedded UI previews. Keep preview content short and functional-looking.

### Stats

Stats combines live metrics with a feedback CTA for early operators.

- Uses `PrismaticBackground` and low-opacity vertical mini threads.
- Left side is a stat card grid.
- Right side is an `Early Operators` feedback CTA with a `Share Feedback` action.
- Stat cards use mono labels, live dots, count-up animation, and large tabular values.

### Footer

Footer includes a large CTA module followed by structured link columns.

- CTA headline: `Your community, re-engineered.`
- CTA actions: invite/init button and dashboard link.
- Link groups: system core, resources, legal protocol.
- Footer status uses compact mono telemetry text.

## Dashboard

Source: `web/src/components/layout` and `web/src/components/dashboard`.

### Shell

`DashboardShell` defines the dashboard frame:

- Full viewport height: `h-[100dvh]`.
- Desktop sidebar: fixed `260px`, border-right, scrollable.
- Header: sticky top control bar.
- Main content: scrollable, max width `1440px`, padded `px-4 md:px-8 lg:px-10`.
- Footer sits inside the main scroll region.

### Sidebar

The sidebar is grouped into operational sections:

- Core Controls: Overview, Moderation, Members, Tickets.
- Intelligence: AI Chat, Conversations.
- System Ops: Temp Roles, Audit Log, Performance, Logs, Settings.

Visual rules:

- Use compact grouped islands with `bg-card/20`, `border-border/30`, and rounded `[24px]`.
- Active nav items use `bg-primary/10`, primary icon boxes, and a small pulsing indicator.
- Icons are required for every nav item.
- Settings mode replaces normal nav with the settings category tree and an exit button.
- Bottom support button is a solid `primary` action.

### Header

The header is a dense command bar.

- Left: mobile sidebar trigger, logo, product label, live status, current page.
- Center: config search only when settings context is active.
- Right: page-specific refresh/filter/export controls, session menu.
- Page actions are compact uppercase buttons with icons.
- User menu uses the custom material dropdown menu.
- Theme menu labels are intentionally product-styled: `Light Aspect`, `Dark Protocol`, `System Default`.

### Page Headers

Use `PageHeader` for dashboard page introductions.

- Rounded panel with left gradient accent bar.
- Optional icon in a primary-tinted square.
- Title and short description.
- Optional action cluster in a bordered mini container.

### Analytics and Charts

Use `StableResponsiveContainer` for Recharts. Do not mount raw `ResponsiveContainer` directly in dashboard views.

#### Overview dashboard KPIs and AI panel

The analytics overview KPI strip uses a compact four-card grid: `grid gap-3 grid-cols-2 lg:grid-cols-4 stagger-fade-in`. Keep the overview focused on activity and adoption KPIs: Total messages, AI requests, Active users, and New members. Do not reintroduce AI spend as a top-level KPI; cost belongs in deeper reporting, not the first-scan operational overview.

When analytics are loading and no previous payload is available, render four stable skeleton placeholders keyed `kpi-0` through `kpi-3`. The placeholders should preserve card height and grid rhythm so the overview does not shift while data loads.

The AI detail panel should be titled `AI Usage Analysis`, with copy oriented around model requests and token volume. Keep this panel usage-forward instead of cost-forward: model distribution, prompt/completion token volume, and empty states that explain data appears after AI requests are processed.

Reuse the existing dashboard surface tokens for this area: `border-border/40`, `bg-muted/20`, `bg-background/40`, `backdrop-blur-3xl`, `primary` accents, and chart colors from `useChartTheme()`. Exceptions should be limited to fixed chart palette colors and Discord-specific blue only when the action is explicitly Discord-branded. Future overview cards should follow the same compact KPI-card structure and be added only when they improve immediate operator scanning.

Chart color source:

- Use `useChartTheme()` for theme-aware chart colors.
- Use accessible series colors from the fixed chart palettes.
- Tooltips must set theme-aware background, border, and text.
- Empty chart regions should use `EmptyState`, not blank cards.

### Settings

Settings are feature-card based.

- Use `SettingsFeatureCard` for configurable modules.
- Header area contains title, description, optional active badge, and optional switch.
- Basic settings live in a muted inset panel.
- Advanced content is collapsed behind an `Advanced Configuration` control.
- `FloatingSaveIsland` handles unsaved changes.
- Config changes must preserve the runtime/API/dashboard/test path described in `AGENTS.md`.

## Shared Controls

### Buttons

Source: `web/src/components/ui/button.tsx`.

Variants:

- `default`: primary solid action.
- `outline`: bordered glass action.
- `secondary`: muted secondary action.
- `ghost`: low-emphasis action.
- `ghost-primary`: low-emphasis primary hover.
- `destructive`: destructive action.
- `discord`: Discord-specific action.

Button defaults:

- Rounded `[14px]`.
- Bold text with tight tracking.
- Active state scales to `0.98`.
- Focus ring uses `primary/60`.

### Inputs and Selectors

- Keep inputs compact, bordered, and theme-aware.
- For channels and roles, use the existing selector components.
- For larger option sets, prefer searchable command/popover patterns.
- Do not add extra guild-fetch loops in leaf components. Use `GuildDirectoryProvider` when a dashboard client needs guild data.

### Badges and Status

- Use small uppercase labels with positive tracking.
- Live status uses a tiny primary dot with a restrained pulse.
- Destructive badges should use `destructive` tokens, not custom reds unless there is a chart-specific reason.

### Tables

- Headers are uppercase, small, and muted.
- Rows use thin borders and subtle hover fills.
- Dense operational tables should prioritize scanability over large spacing.

## Motion

Motion is part of the current identity, but it must stay controlled.

Current libraries:

- Framer Motion for layout, entrance, hover, and small interactive transitions.
- GSAP with ScrollTrigger for landing section reveals and parallax.

Rules:

- Honor `prefers-reduced-motion`; the existing landing sections already short-circuit animations.
- Keep dashboard motion shorter than landing motion.
- Use `dashboard-fade-in` for route/content entrance.
- Avoid motion that changes layout dimensions after initial paint.
- For counters, use eased count-up animation only when the value is meaningful.

## Responsive Rules

- Landing sections use generous vertical spacing on desktop and retain centered, inspectable content on mobile.
- Dashboard shell switches to mobile sidebar through `MobileSidebar`.
- Do not let text overflow buttons, cards, menu items, or table cells.
- Tables that cannot compress should scroll horizontally.
- Fixed-format elements such as charts, heatmaps, KPI cards, and toolbars need stable dimensions.
- Check desktop, tablet, and mobile when layout changes.

## Accessibility

- Use semantic landmarks where practical: `header`, `main`, `section`, `footer`, tables with labels.
- Icon-only buttons need accessible labels.
- Focus states must be visible and use existing ring styles.
- Do not rely on color alone for status; pair color with text, icons, or shape.
- Keep contrast legible in both light and dark themes.

## Implementation Rules

- Prefer existing components and utility classes over inventing new primitives.
- Update `globals.css` tokens only when changing the system globally.
- UI changes must update this file when they alter tokens, layout rules, component conventions, or the landing/dashboard visual language.
- Keep visual copy concise. The UI should not explain its own controls.
- Use real product surfaces and data previews, not generic decorative mockups.
- Do not use raw `console.*`; use repo logging conventions where relevant.

## Visual Verification

Any visual dashboard or landing page change must be checked in a browser before it is called done.

Required checks:

- Screenshot after the change.
- Light and dark themes if colors or theming changed.
- Mobile, tablet, and desktop if layout changed.
- Dashboard-specific flows when dashboard chrome or authenticated pages changed.

Preferred tool per repo instructions: Chrome DevTools MCP. If MCP is unavailable, say so plainly and use the closest available browser verification, such as Playwright screenshots.
