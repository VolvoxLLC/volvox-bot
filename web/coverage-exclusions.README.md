# Web coverage exclusions

`coverage-exclusions.json` is the single editable source of truth for web coverage exclusions.

- Vitest imports `coverage-exclusions.json` directly in `vitest.config.ts`.
- The `sonar.coverage.exclusions` block in `../sonar-project.properties` is generated from the same JSON.
- Edit only `coverage-exclusions.json`, then run `pnpm sonar:sync-coverage-exclusions` from the repository root.
- CI runs `pnpm sonar:check-coverage-exclusions` from the repository root, which fails if Sonar drifts or Vitest stops consuming the JSON directly.

## Exclusion rationale

These exclusions are intentionally file-specific except for inert type/framework glue and shared primitive UI surfaces. They should not be used to hide real application logic from coverage.

- `typesAndFrameworkGlue`: Type-only modules, CSS, app router segment wrappers, error/loading boundaries, and Next metadata handlers are exercised by Next build/runtime rather than useful unit tests.
- `sharedUiShells`: Generic UI primitives, the error card, and the theme provider are presentation shells with little branch logic; behavior is covered by consumers and build/render gates.
- `dashboardBrowserCompositionSurfaces`: Browser-heavy dashboard shells built around Recharts measurements, virtualized/table UI, rich form widgets, editor composition, and event-driven panels. Stores, contexts, API routes, proxy/security helpers, dashboard clients, and reusable data utilities remain covered by focused tests.
- `landingVisualCompositionSurfaces`: Animated/static marketing sections, counters, comparison/stat cards, and bento cells depend on viewport/framer-motion timing or static presentation data; browser/e2e coverage is the right verification layer. The list is file-specific to avoid excluding all landing logic by directory, and fully covered primitives such as pricing and section headers stay included.
- `layoutNavigationShells`: Responsive navigation/sidebar/footer shells compose tested directory providers and selectors, but their value is browser layout behavior. `header.tsx` stays included because its refresh/export/session behavior is unit-tested.
- `browserLifecycleHooksAndUtilities`: Viewport/browser lifecycle hooks plus scroll wrappers are thin browser side-effect surfaces. Core analytics, API, websocket, logger, auth/proxy, store, and context utilities are not excluded.
