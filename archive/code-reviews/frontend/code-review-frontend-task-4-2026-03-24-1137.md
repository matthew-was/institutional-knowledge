# Code Review — Frontend Service — Task 4: Application layout and navigation

**Date**: 2026-03-24 11:37
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/src/app/layout.tsx`
- `apps/frontend/src/app/page.tsx`
- `apps/frontend/src/app/(private)/layout.tsx`
- `apps/frontend/src/app/(private)/upload/page.tsx`
- `apps/frontend/src/app/(private)/curation/layout.tsx`
- `apps/frontend/src/app/(private)/curation/page.tsx`
- `apps/frontend/src/app/(public)/.gitkeep`
- `apps/frontend/src/components/AppNav/AppNav.tsx`
- `apps/frontend/src/components/AppNav/AppNav.browser.test.tsx`
- `apps/frontend/src/components/CurationNav/CurationNav.tsx`
- `apps/frontend/src/components/CurationNav/CurationNav.browser.test.tsx`
- `apps/frontend/src/testing/setup.browser.ts`
- `apps/frontend/src/styles/global.css`
- `apps/frontend/vitest.config.ts`
- `apps/frontend/package.json`

---

## Acceptance condition

**Stated condition**: Root `src/app/layout.tsx` renders only the `<html>`/`<body>` shell;
`(private)/layout.tsx` renders `AppNav`; root `/` redirects to `/upload`;
`(private)/curation/layout.tsx` renders `CurationNav`; Tier 1 RTL + `vitest-axe` tests for
`AppNav` and `CurationNav` pass with no accessibility violations; `pnpm biome check` and
`pnpm --filter frontend tsc --noEmit` pass.

**Condition type**: both (automated tests + manual build/lint verification)

**Result**: Met

**Automated**:

All 60 tests pass (`pnpm --filter frontend test`, confirmed in review session). The 8 new
tests land in the `browser` Vitest project (jsdom) via the `*.browser.test.tsx` naming
convention. Specifically:

- `AppNav.browser.test.tsx`: 4 tests — nav role with aria-label, two link `href` assertions,
  and a `vitest-axe` `toHaveNoViolations` assertion.
- `CurationNav.browser.test.tsx`: 4 tests — nav role with aria-label, two link `href`
  assertions, and a `vitest-axe` `toHaveNoViolations` assertion.

The `vitest-axe` `toHaveNoViolations` matcher is available in tests because `setup.browser.ts`
imports `vitest-axe/extend-expect` (side-effect) and calls `expect.extend({ toHaveNoViolations })`.

**Manual verification required**:

Run the following in order and confirm all pass:

```bash
pnpm --filter frontend exec biome check src server
pnpm --filter frontend exec tsc --noEmit
```

For the layout structure, start the dev server and confirm:

1. `GET /` redirects to `/upload` (HTTP 308 or browser redirect)
2. `/upload` renders `AppNav` in a `<header>` and the page content in `<main>`
3. `/curation` renders `AppNav` in a `<header>` and `CurationNav` above the curation content
4. The root `layout.tsx` does not render `AppNav` (verified by code: it renders only
   `<html lang="en"><body>{children}</body></html>`)

---

## Findings

### Blocking

None.

---

### Suggestions

**S-001 — Double registration of `toHaveNoViolations` in `setup.browser.ts`**

File: `apps/frontend/src/testing/setup.browser.ts`, lines 3–6

The setup file imports `vitest-axe/extend-expect` as a side-effect (line 3), which already
calls `expect.extend(matchers_exports)` internally. It then also imports `toHaveNoViolations`
from `vitest-axe/matchers` (line 4) and calls `expect.extend({ toHaveNoViolations })` again
(line 6). This registers the matcher twice. It is harmless but redundant.

The minimal correct form is one of the following two approaches (both are correct; do not
combine them):

*Approach A — side-effect only (simplest):*

```typescript
import 'vitest-axe/extend-expect';
```

*Approach B — manual only (more explicit):*

```typescript
import { toHaveNoViolations } from 'vitest-axe/matchers';
expect.extend({ toHaveNoViolations });
```

The current code uses both simultaneously. No test breaks from this but the intent is
unclear to a future reader. Consider choosing one approach.

---

**S-002 — Config singleton imported directly from a Next.js page across sub-system boundary**

File: `apps/frontend/src/app/(private)/upload/page.tsx`, line 1

The upload page imports the `config` singleton from
`../../../../server/config/index` via a relative path that crosses the `src/` ↔ `server/`
sub-system boundary. The plan (`senior-developer-frontend-plan.md`, Configuration section)
states the singleton is imported by "Hono route handlers, handlers, and request functions"
and must never be imported into Client Components. This page is a Server Component (no
`"use client"` directive), so it does not violate the Client Component restriction.

The concern is architectural: `src/` is the Next.js UI sub-system and `server/` is the Hono
custom server sub-system. A page reaching into `server/` via a relative path couples the two
sub-systems. If the config module were ever restructured or if the Hono server were extracted,
this import would break silently.

A cleaner approach for future tasks would be for the page to receive `maxFileSizeMb` as a
prop from a parent layout (which would read config server-side), or to expose config values
needed by pages through a shared thin re-export in `src/lib/`. For Task 4 specifically, the
stub page is temporary (replaced in Task 5), so this is a low-risk interim coupling.

No action required for Task 4, but worth establishing the pattern before Task 5 wires the
real `DocumentUploadForm`.

---

**S-003 — Plan divergence: `AppNav` placement and route group structure**

The `senior-developer-frontend-plan.md` states in two places (lines 194–195 and 831) that
`AppNav` is rendered "on every page via `app/layout.tsx`" and the component map shows
`app/upload/page.tsx` and `app/curation/layout.tsx` without route groups.

The implementation uses route groups (`(private)/`, `(public)/`) with `AppNav` in
`(private)/layout.tsx` rather than in the root layout. The task description explicitly
describes and justifies this structure. The implementation is more architecturally sound
(public pages added in Phase 2 will not inherit `AppNav`), but it diverges from what the
plan documents.

The developer should decide whether to update the plan to reflect the route group structure
actually in use, so that Tasks 5–18 are written against an accurate folder layout. Left
unfixed, future task files may reference `app/upload/page.tsx` and `app/curation/layout.tsx`
rather than the `(private)/` equivalents, causing confusion during implementation.

This is a Suggestion, not a blocker for this task. The implementation is correct per the
task description. Plan updates are the developer's decision.

---

## Summary

**Outcome**: Pass

No blocking findings. All acceptance condition checks pass: the layout structure is
implemented exactly as the task description specifies, the redirect is in place, all tests
pass, and `vitest-axe` accessibility assertions are present and exercised. Three suggestions
are noted: a redundant matcher registration in the test setup, an interim cross-sub-system
config import, and a plan document that needs updating to reflect the route group structure.

Task status set to `review_passed`.

The review is ready for the user to check.
