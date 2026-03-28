# Code Review — Frontend Service — Task 17: E2E tests — critical happy paths and key error paths

**Date**: 2026-03-28 14:55
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/e2e/globalSetup.ts`
- `apps/frontend/e2e/globalTeardown.ts`
- `apps/frontend/e2e/mockExpressServer.ts`
- `apps/frontend/e2e/upload.spec.ts`
- `apps/frontend/e2e/curation.spec.ts`
- `apps/frontend/src/app/(private)/curation/vocabulary/components/VocabularyQueueList.browser.test.tsx`
- `apps/frontend/vitest.config.ts`
- `apps/frontend/playwright.config.ts`
- `apps/frontend/tsconfig.json`
- `apps/frontend/package.json`
- `.gitignore`

---

## Acceptance condition

**Restated**: Playwright test suite exists at `apps/frontend/e2e/`; all five scenarios pass
against a running Hono custom server with mocked Express backend;
`pnpm --filter frontend exec playwright test` command exists in `package.json` and passes.

**Condition type**: automated

**Result**: Met

The `e2e/` directory exists with `upload.spec.ts` (two scenarios: happy path and duplicate
detection) and `curation.spec.ts` (three scenarios: document queue clear-flag, metadata edit,
vocabulary queue accept). All five scenarios from the task description are present.

The `package.json` `test:e2e` script runs `playwright test`, and the `@playwright/test`
binary is installed at `node_modules/.bin/playwright`. The command
`pnpm --filter frontend exec playwright test` invokes the binary directly and is equivalent
— it will run all tests in `testDir: './e2e'` as configured in `playwright.config.ts`.

`playwright.config.ts` declares `globalSetup` and `globalTeardown`, which start and stop the
mock Express server on port 4000. The `webServer` block starts the Hono custom server
(`pnpm dev`) and waits for it to be ready on port 3000 before tests run.

The mock Express server in `mockExpressServer.ts` handles all routes exercised by the five
scenarios: DOC-001 through DOC-009 and VOC-001 through VOC-003. Per-test state is reset via
the `/test-reset` control endpoint called in `beforeEach`.

---

## Findings

### Blocking

**B-001** — CR-015 violation: `getByText(...).toBeDefined()` in `VocabularyQueueList.browser.test.tsx`

File: `apps/frontend/src/app/(private)/curation/vocabulary/components/VocabularyQueueList.browser.test.tsx`, line 30

```typescript
expect(screen.getByText('Term: Home Farm')).toBeDefined();
```

`screen.getByText(...)` is a `getBy*` query — it already throws an error if the element is
not found. The `.toBeDefined()` assertion therefore passes unconditionally regardless of
whether the component renders anything. If the component were deleted or rendered no text,
`getByText` would throw first, but `toBeDefined()` on a found element can never be false.
This is the exact pattern CR-015 identifies as vacuous for `getBy*` queries.

The assertion must be changed to assert a meaningful property of the element — for example
its `textContent`:

```typescript
expect(screen.getByText('Term: Home Farm').textContent).toBe('Term: Home Farm');
```

Or, if the intent is to confirm the element exists (which `getByText` already guarantees by
throwing on absence), remove `.toBeDefined()` and assert an attribute or structural property
instead.

This is a blocking finding because it violates CR-015: the assertion provides no regression
protection — a broken rendering path that causes `getByText` to throw would surface the
failure, but the assertion itself adds nothing. CR-015 requires every assertion to be
independently falsifiable; this one is not.

---

### Suggestions

**S-001** — `mockExpressServer.ts`: `clearedDocumentIds` set is shared across document queue
and vocabulary queue state

File: `apps/frontend/e2e/mockExpressServer.ts`, lines 259 and 275

The `clearedDocumentIds` set tracks both cleared document queue items (line 206) and accepted
or rejected vocabulary terms (lines 275, 289). This means a clear-flag action on a document
would also remove a vocabulary term from the list if they happened to share the same UUID —
which they do not in practice because each mock ID is unique. However, the naming
`clearedDocumentIds` does not communicate that it is also used for vocabulary term tracking.

Consider renaming to `removedIds` and updating the comment, or splitting into two separate
sets (`clearedDocumentIds` and `acceptedOrRejectedTermIds`). This is a suggestion because
the current tests do not conflate the two states (IDs are distinct and `beforeEach` resets
between tests), but the implicit coupling would be a source of confusion if the mock is
extended.

**S-002** — `upload.spec.ts`: `body` text scan instead of targeted locator for success page

File: `apps/frontend/e2e/upload.spec.ts`, lines 87–88

```typescript
const pageText = await page.locator('body').textContent();
expect(pageText).toContain('2024-01-15 — Family letter');
```

Asserting on `body.textContent()` is broad — any element on the page that happens to contain
the archive reference string would satisfy the assertion, including a navigation link, a
debug banner, or an error message that renders the reference in a different context.

A more targeted assertion would locate the specific element that `UploadSuccessMessage`
renders (e.g. the `<time>` element or the paragraph/heading that contains the archive
reference). This is a suggestion, not blocking, because the archive reference string is
specific enough that a false positive is unlikely in practice.

**S-003** — Plan divergence: `VocabularyQueueList.browser.test.tsx` is not in the Task 17
description

File: `apps/frontend/src/app/(private)/curation/vocabulary/components/VocabularyQueueList.browser.test.tsx`

The task description covers five Playwright E2E scenarios only. The `VocabularyQueueList`
browser test is a Tier 2 Vitest test, not a Tier 3 E2E test. It was not listed in the Task
17 acceptance condition or in the senior-developer-frontend-plan.md Task 13 test requirements.

This is additive and benign — the test exercises a component that was previously untested at
the component level (`VocabularyQueueList` itself, as distinct from the hook tests that existed
from Task 13). However, the implementer should note this as a divergence from the plan. The
file is included here in the review because it was introduced in this task's branch.

The blocking finding B-001 above applies to this file and must be fixed regardless.

---

## Summary

**Outcome**: Fail

One blocking finding (B-001): the `VocabularyQueueList.browser.test.tsx` contains a
`getByText(...).toBeDefined()` assertion that violates CR-015 (vacuous — `getBy*` queries
throw on absence, making `.toBeDefined()` unconditionally true). This file was introduced
in this task's branch and must be fixed before the task can advance.

The five Playwright E2E scenarios are well-structured and the assertions in the Playwright
spec files are falsifiable: they assert specific text content, `aria-disabled` attribute
values, and `[role="status"]` text content. No CR-015 violations in the spec files themselves.

The mock Express server is correctly shaped and covers all routes exercised by the scenarios.

Task status set to `review_failed`.

The review is ready for the user to check.
