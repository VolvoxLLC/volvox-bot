# Design System: Volvox.Bot Dashboard

## Colors (Light / Dark)

Primary: #18B46B / #1ABC71 (Volvox green)
Secondary:  #8C42D7 / #8C42D7 (Volvox purple)
Background: #F5FAF7 / #070E0B
Accent: #FF8C00 / #FF8C00 (Orange)

### Rules

- Everything should be styled for both light and dark mode.
- System is the default theme.

## Landing Page

### Section Order
Hero → Dashboard Preview → Competitor Comparison → Features → Pricing → Testimonials + Stats → Footer CTA

### Landing Page Components
- `Hero` — Typewriter headline (40ms/char), ChatConsole V2 with #general channel context, coordinated entrance
- `DashboardPreview` — Interactive 4-tab mockup (Overview, Moderation, AI Chat, Settings) with static data
- `ComparisonTable` — Feature matrix (Volvox vs MEE6 vs Dyno vs Carl-bot) with sticky first column on mobile
- `FeatureGrid` — 2x2 cards with mini-preview insets (AI Chat, Moderation, Starboard, Analytics)
- `Pricing` — 2-tier model (Free + Pro), annual/monthly toggle
- `Stats` — Merged testimonials (placeholder quotes) + 3 condensed live stats (Members, Commands, Uptime)
- `Footer` — Discord blue CTA, tagline, links, copyright

### Shared Components
- `SectionHeader` — Uppercase label + title + optional subtitle, used across all sections
- `AnimatedCounter` — Scroll-triggered number animation with eased progression
- `ScrollStage` — Parallax entrance/exit wrapper for cinematic section transitions

### Performance
- Below-fold sections (DashboardPreview, ComparisonTable, Stats) use `next/dynamic` with `ssr: false`
- Hero, FeatureGrid, Pricing, Footer remain in main bundle
