# Code Review — Frontend Service — Task 3: Shared utilities and frontend-only schemas

**Date**: 2026-03-24 08:40
**Task status at review**: in_review
**Files reviewed**:

- `apps/frontend/src/lib/temporal.ts`
- `apps/frontend/src/lib/fetchWrapper.ts`
- `apps/frontend/src/lib/parseFilename.ts`
- `apps/frontend/src/lib/schemas.ts`
- `apps/frontend/src/lib/__tests__/parseFilename.test.ts`
- `apps/frontend/src/lib/__tests__/schemas.test.ts`
- `apps/frontend/src/lib/__tests__/fetchWrapper.browser.test.ts`

---

## Acceptance condition

All three schemas exist in `src/lib/schemas.ts`; only `UploadFormSchema` (via
`createUploadFormSchema` factory), `MetadataEditSchema`, and `AddTermSchema` are defined
there (no response schema redefinitions); `src/lib/temporal.ts` exists and re-exports
`Temporal` from `@js-temporal/polyfill`; `parseFilename` and `fetchWrapper` exist in
`src/lib/`; all Tier 1 tests pass; `pnpm biome check` and `pnpm --filter frontend tsc
--noEmit` pass.

**Condition type**: automated

**Result**: Met

All four `src/lib/` files exist and contain only the required exports. All three test
files are present and cover the behaviours stated in the acceptance condition:

- `parseFilename.test.ts` — 14 cases covering conforming filenames, valid calendar dates,
  invalid calendar dates (null date returned with description preserved), and
  non-conforming filenames (null returned).
- `schemas.test.ts` — covers `UploadFormSchema` (valid, empty date, invalid date format,
  invalid calendar date, empty description, whitespace-only description, unsupported
  extension, oversized file, at-limit file), `MetadataEditSchema` (valid, null/empty
  date, whitespace description, comma-separated arrays, array pass-through),
  `AddTermSchema` (valid required-only, valid all-fields, missing required fields, UUID
  validation for `targetTermId`).
- `fetchWrapper.browser.test.ts` — five cases: content-type set on every call, basePath
  prepended, empty basePath default, caller-supplied content-type not overridden,
  additional init options passed through.

The tests confirm the actual stated behaviours, not weaker approximations.

---

## Findings

### Blocking

None.

### Suggestions

**S-1** — `apps/frontend/src/lib/parseFilename.ts` lines 28–29: type assertions
`match[1] as string` and `match[2] as string` are redundant. In TypeScript,
`RegExpExecArray` index access returns `string` (not `string | undefined`) for indexed
groups when the array element is known to exist via a successful `exec` call. The
assertions carry no explanatory comment. They are harmless and will not cause a runtime
error, but they add noise. Consider removing them and using a destructuring assignment
instead (e.g. `const [, rawDate, description] = match`). Not blocking.

**S-2** — `apps/frontend/src/lib/schemas.ts` line 116: the `description` field override
in `MetadataEditSchema` drops the `.trim()` from the shared schema
(`UpdateDocumentMetadataRequest` applies `.string().trim().min(1)`). The frontend override
uses `.string().refine(s => s.trim().length > 0)` which validates the same invariant
but does not strip leading/trailing whitespace from the output. If a form user submits
a description with surrounding whitespace (e.g. `"  Notes  "`), the shared schema would
silently trim it; the frontend override would accept it without trimming. This may be
intentional (trimming could happen elsewhere, or the server will trim via the shared
schema on receipt), but the discrepancy is worth a conscious decision. Not blocking.

---

## Summary

**Outcome**: Pass

No blocking findings. All acceptance conditions are met. The implementations are clean,
well-structured, and comply with the key constraints specified for this task:

- `temporal.ts` is the sole import point for `@js-temporal/polyfill` — confirmed by
  grep across `apps/frontend/src/`.
- `schemas.ts` imports `{ z } from 'zod'` only (no `@asteasolutions/zod-to-openapi`).
- `MetadataEditSchema` is derived via `.extend()` from the shared
  `UpdateDocumentMetadataRequest` — no independent field redefinition.
- `AddTermSchema` is derived via `.extend()` from the shared `AddVocabularyTermRequest`
  and uses `z.uuid()` (Zod v4 standalone) for `targetTermId`.
- `parseFilename` returns `{ date: null, description }` for invalid calendar dates
  (distinct from `null` for pattern-not-matching).
- `fetchWrapper.ts` has no Next.js or Hono imports.
- `fetchWrapper.browser.test.ts` is in the jsdom project; `parseFilename.test.ts` and
  `schemas.test.ts` are in the node project.

Task status set to `review_passed`.

The review is ready for the user to check.
