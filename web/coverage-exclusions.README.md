# Web coverage exclusions

`coverage-exclusions.json` is the single editable source of truth for web coverage exclusions.

- Vitest imports `coverage-exclusions.json` directly in `vitest.config.ts`.
- The `sonar.coverage.exclusions` block in `../sonar-project.properties` is generated from the same JSON.
- Edit only `coverage-exclusions.json`, then run `pnpm sonar:sync-coverage-exclusions` from the repository root.
- CI runs `pnpm sonar:check-coverage-exclusions` from the repository root, which fails if Sonar drifts or Vitest stops consuming the JSON directly.
