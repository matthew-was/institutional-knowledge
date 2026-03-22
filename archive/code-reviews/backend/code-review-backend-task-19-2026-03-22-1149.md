# Code Review — Backend Service — Task 19: Biome configuration and quality gate

**Date**: 2026-03-22 11:49
**Task status at review**: in_review
**Files reviewed**:

- `apps/backend/package.json` (lint script added)
- `apps/backend/biome.json` (existing; confirmed still correct)
- `biome.json` (root; existing; provides the inherited configuration)

## Acceptance condition

Running `biome check apps/backend/src/` from the monorepo root exits with code 0 and
produces no lint or formatting errors. Running `pnpm --filter backend lint` produces the
same result. Confirmed manually by the developer after all handler tasks are implemented.

**Condition type**: manual

**Result**: Met

Both invocation forms were executed during this review and exit 0 with no errors:

- `pnpm exec biome check apps/backend/src/` — "Checked 80 files in 16ms. No fixes applied."
- `pnpm --filter backend lint` — "Checked 80 files in 15ms. No fixes applied."

The `lint` script in `apps/backend/package.json` is `"biome check src/"`, which correctly
targets the `src/` directory when run from the package root via `pnpm --filter backend lint`.

The task also requires that the Biome configuration enforces consistent import ordering,
no unused variables, and consistent formatting. These are confirmed:

- **Import ordering**: `organizeImports` is part of Biome's recommended ruleset and is
  enabled by default. Verified via `biome explain organizeImports` — rule is recommended
  and active.
- **No unused variables**: explicitly set to `"error"` in root `biome.json` under
  `linter.rules.correctness.noUnusedVariables`.
- **Consistent formatting**: enabled in root `biome.json` with `"indentStyle": "space"` and
  `quoteStyle: "single"` for JavaScript/TypeScript.

`apps/backend/biome.json` sets `"root": false` and extends `../../biome.json`, correctly
inheriting all of the above from the root configuration.

## Findings

### Blocking

None.

### Suggestions

None.

## Summary

**Outcome**: Pass

No blocking findings. The `lint` script is correctly added, the Biome configuration
enforces all three required rules (import ordering, unused variables, formatting), and both
invocation forms exit 0 against all 80 source files. Task status set to `review_passed`.

The review is ready for the user to check.
