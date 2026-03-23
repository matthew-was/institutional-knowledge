# Code Review — Frontend Service — Task 1: Scaffold the Next.js frontend application

**Date**: 2026-03-23 20:29
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/package.json`
- `apps/frontend/tsconfig.json`
- `apps/frontend/biome.json`
- `apps/frontend/next.config.ts`
- `apps/frontend/tailwind.config.ts`
- `apps/frontend/src/styles/global.css`
- `apps/frontend/vitest.config.ts`
- `apps/frontend/playwright.config.ts`
- `package.json` (root — `pnpm.ignoredBuiltDependencies` addition)
- Directory structure: `src/app/`, `src/components/`, `src/lib/`, `src/styles/`,
  `server/routes/`, `server/handlers/`, `server/requests/`, `server/config/`

---

## Acceptance condition

**Condition type**: automated

The acceptance condition has six parts:

1. `apps/frontend/` exists with the correct directory structure
2. `tailwind.config.ts` exists and `src/styles/global.css` imports Tailwind
3. No CSS module files anywhere in `apps/frontend/`
4. `pnpm --filter frontend tsc --noEmit` passes with no errors
5. `pnpm biome check apps/frontend/src apps/frontend/server` passes
6. No `app/api/` directory exists

**Result**: Not met — parts 1, 2, 3, 5, 6 are satisfied; part 4 fails.

**Part 1**: All required directories exist (`src/app/`, `src/components/`, `src/lib/`,
`src/styles/`, `server/routes/`, `server/handlers/`, `server/requests/`, `server/config/`)
each containing a `.gitkeep` file. Satisfied.

**Part 2**: `tailwind.config.ts` exists with content paths `./src/**/*.{ts,tsx}`. The
Tailwind v4 `@import "tailwindcss"` directive in `src/styles/global.css` is the correct
v4 equivalent of the v3 `@tailwind base/components/utilities` triple. Satisfied.

**Part 3**: No `.module.css` or `.module.scss` files found anywhere in `apps/frontend/`.
Satisfied.

**Part 4**: `pnpm --filter frontend exec tsc --noEmit` exits with code 2:

```text
node_modules/next/dist/client/components/segment-cache/cache.d.ts(104,21):
  error TS2304: Cannot find name 'PromiseWithResolvers'.
```

`PromiseWithResolvers` was introduced in ES2024. The frontend tsconfig inherits
`"target": "ES2022"` from the root tsconfig and does not override it. The root tsconfig
was written for the backend (Node-only, no browser types), so its `ES2022` target is
appropriate for Express. Next.js 16's type definitions reference `PromiseWithResolvers`,
which requires a lib that includes ES2024 (or later). The frontend tsconfig must add a
`"target"` and/or `"lib"` override to resolve this. **Not satisfied — blocking.**

**Part 5**: `pnpm biome check apps/frontend/src apps/frontend/server` exits cleanly
("Checked 1 file in 2ms. No fixes applied."). Satisfied.

**Part 6**: `src/app/` exists; `src/app/api/` does not. Confirmed by directory listing.
Satisfied.

---

## Findings

### Blocking

**B-1 — `tsconfig.json`: missing `target`/`lib` override causes `tsc --noEmit` to fail**

File: `apps/frontend/tsconfig.json`

The acceptance condition explicitly requires `pnpm --filter frontend tsc --noEmit` to pass.
It currently fails:

```text
error TS2304: Cannot find name 'PromiseWithResolvers'.
```

Root cause: the frontend tsconfig inherits `"target": "ES2022"` from the root. The default
lib for `ES2022` does not include `PromiseWithResolvers` (ES2024). Next.js 16's bundled
type declarations reference this API. The frontend tsconfig must override the inherited
target with a value whose default lib includes ES2024, or it must add an explicit `"lib"`
array that includes `"ES2024"` alongside `"DOM"` and `"DOM.Iterable"` (since the frontend
runs in both browser and Node environments and both lib families are needed).

The task spec says "target Node for the `server/` sub-system; strict mode enabled". Strict
mode is inherited. What must change is the `target` (and possibly an explicit `lib`) in
the frontend tsconfig so that the Next.js types resolve without error. What form that takes
is for the implementer to decide.

---

### Suggestions

**S-1 — Plan divergence: `@base-ui-components/react` → `@base-ui/react`**

The task spec (line 34) names `@base-ui-components/react`. The implementation uses
`@base-ui/react` at version `^1.3.0`. The implementer notes this as a correction —
`@base-ui/react` is the correct published package name. The version installed (`1.3.0`)
is consistent with the stable release.

This is a plan divergence. The developer should update the task spec (and any other
references in `frontend-tasks.md`) to use the correct package name `@base-ui/react`
so that later tasks are not confused by the wrong name.

**S-2 — Plan divergence: `@testing-library/react-hooks` removed**

The task spec (line 37) lists `@testing-library/react-hooks` as a devDependency. The
implementation omits it. The implementer notes this is correct because `renderHook` has
been built into `@testing-library/react` since React 18 and the separate hooks package
is deprecated. This is a correct decision, but it diverges from the plan. The developer
should update `frontend-tasks.md` to remove the reference to `@testing-library/react-hooks`
so that other tasks do not try to import from it.

**S-3 — `playwright.config.ts`: `testDir` points at `src/` rather than an E2E-specific
directory**

File: `apps/frontend/playwright.config.ts`, line 4

`testDir: './src'` will cause Playwright to scan the entire `src/` directory for test
files. Tier 1 (unit) and Tier 2 (behaviour) tests live in `src/` alongside components —
Playwright will not run them (different file patterns) but the broad `testDir` is
unconventional and may cause noise as the codebase grows. A dedicated `e2e/` or
`src/__e2e__/` directory is the common pattern. This is a scaffold-only task so there are
no E2E tests yet; the developer may prefer to address this in a later task when the first
Playwright test is written. Raising now so the decision is deliberate.

**S-4 — `vitest.config.ts`: `fileParallelism: false` at top level**

File: `apps/frontend/vitest.config.ts`, line 6

`fileParallelism: false` is present from the start. On the backend this is required because
integration tests share a single PostgreSQL instance and parallel file execution causes
flakiness. For the frontend there is no shared database. Browser-side unit tests (Tier 1)
have no I/O and would run safely in parallel; Tier 2 route handler tests using supertest
may benefit from sequential execution once they exist, but that can be added at the Tier 2
task. Setting `fileParallelism: false` globally now means all future tests — including pure
unit tests — run sequentially, slowing the test suite unnecessarily. This is a low-stakes
scaffold decision that can be revisited when the first tests are written.

---

## Summary

**Outcome**: Fail

One blocking finding (B-1): the acceptance condition `pnpm --filter frontend tsc --noEmit`
fails with a TypeScript error caused by the inherited `ES2022` target not including the
`PromiseWithResolvers` type used in Next.js 16 type declarations. The frontend tsconfig
must override `target` (and/or `lib`) to resolve this before the acceptance condition
can be met.

Task status set to `review_failed`.

The review is ready for the user to check.
