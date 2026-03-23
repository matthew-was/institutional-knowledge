# Self-Review — Frontend Task List

**Reviewed**: 2026-03-23
**Task list reviewed**: `documentation/tasks/frontend-tasks.md`
**Source plan**: `documentation/tasks/senior-developer-frontend-plan.md` (revised 2026-03-23)
**Additional context**: `documentation/tasks/frontend-tasks-revision-2026-03-23.md`

---

## Completeness

Every distinct implementation unit in the plan is covered:

| Plan section | Task(s) |
| --- | --- |
| Project scaffolding | Task 1 |
| Hono custom server (`server.ts`, config, auth middleware, Ky client) | Task 2 |
| Shared utilities (`fetchWrapper`, `parseFilename`, `schemas.ts`) | Task 3 |
| Layout, navigation, page stubs (`AppNav`, `CurationNav`, root redirect) | Task 4 |
| Upload form components (`DocumentUploadForm`, `FilePickerInput`, etc.) | Task 5 |
| Upload Hono route + handler + request functions (DOC-001 to DOC-005) | Task 6 |
| Upload success page and `UploadSuccessMessage` component | Task 7 |
| Document queue components (`DocumentQueueItem`, `ClearFlagButton`) | Task 8 |
| Document queue route + handler + request functions + `useDocumentQueue` | Task 9 |
| Document detail page and `DocumentMetadataForm` components | Task 10 |
| Document detail route + handler + request functions (DOC-007, DOC-009) | Task 11 |
| Vocabulary queue components (`VocabularyQueueItem`, accept/reject buttons) | Task 12 |
| Vocabulary queue route + handler + request functions + `useVocabularyQueue` | Task 13 |
| Manual term entry components (`AddVocabularyTermForm`, `TermRelationshipsInput`) | Task 14 |
| Add-term route + handler + request function (VOC-004) | Task 15 |
| Request function contract sweep (Tier 1, all 12 functions) | Task 16 |
| Playwright E2E tests (Tier 3, 5 scenarios) | Task 17 |
| Config file and Docker setup | Task 18 |

The revision document required the following new tasks not in the original task list:

- Hono server setup task: covered by Task 2
- Shared utilities task: covered by Task 3
- Task 21 reframed as Tier 1 request function contract sweep: covered by Task 16
- Playwright E2E task: covered by Task 17

All four new items are present.

**Potential gap**: The revision document summary table lists "Hono replaces Next.js
file-based API routing" as affecting "all API route tasks". Each API route task (Tasks 6,
9, 11, 13, 15) explicitly describes all three layers (route handler, handler, request
functions). No API task describes Next.js file-based routes. Covered.

**No plan sections are silently omitted.**

---

## Consistency

- **Task numbers in dependency fields**: all dependencies reference valid task numbers
  within the range 1–18. Spot-checked:
  - Task 6 depends on Tasks 2, 3, 5 — all exist
  - Task 16 depends on Tasks 6, 9, 11, 13, 15 — all exist
  - Task 17 depends on Tasks 7, 9, 11, 13 — all exist
  - Task 18 depends on Tasks 2, 3, 6, 9, 11, 13, 15 — all exist
- **Status values**: all 18 tasks carry `**Status**: not_started`. Consistent.
- **Condition types**: all tasks use `automated`, `manual`, or `both`. Task 2 and Task 4
  use `both` (automated checks plus a manual smoke test); Task 18 uses `both` (automated
  build check plus manual Docker start). All others use `automated`. No non-standard values.

---

## Ambiguity

The following items were considered and judged not ambiguous, but are noted for clarity:

1. **Task 2 — manual condition**: the Tier 2 supertest tests are automated. The `both`
   classification is because starting the Hono custom server is verified manually at first
   start. The Tier 2 tests give sufficient automated confidence; the manual label is for
   the Docker smoke test wiring in Task 18.

2. **Task 4 — `both` condition type**: the RTL tests are automated; the manual condition is
   that `/` redirects to `/upload` in a running browser. The RTL test covers the component
   rendering; the redirect behaviour under Next.js routing requires a manual confirmation
   that the `redirect()` call is effective at runtime.

3. **Task 17 — Playwright architecture**: the description states "MSW in Node server mode
   or a lightweight mock HTTP server" as the Express mock. This is an implementer choice.
   The acceptance condition is defined in terms of the tests passing, not the mock
   implementation — this is appropriate because the choice does not affect correctness.

4. **SWR fetcher placement** (design decision D5 from the revision document): the plan
   states fetchers may be defined inline in hook files or extracted to a co-located
   `[hookName].requests.ts`. The task descriptions say "use `useSWR` with `fetchWrapper`
   as fetcher" without prescribing whether the fetcher is inline or extracted. This is
   intentional — it is a documented implementer choice per `development-principles.md`.

5. **`admin/curation/` vs `curation/` path**: The plan lists routes as `/curation/*` but
   the folder structure in the revision document and plan shows
   `src/app/admin/curation/`. The task descriptions use the folder path
   `src/app/admin/curation/` consistently. The implementer should ensure the Next.js
   App Router page file structure matches the intended URL — if the folder is
   `admin/curation/documents/`, the URL is `/admin/curation/documents`. The plan's route
   table says `/curation/documents`. This is a minor inconsistency between the plan's
   route table and folder structure. **Flagged for the implementer**: confirm whether the
   URL prefix is `/curation/` or `/admin/curation/` and ensure the folder structure
   matches.

---

## Ordering

The dependency chain is valid:

- Task 1 (scaffold) has no dependencies — first task, correct
- Tasks 2 and 3 both depend only on Task 1 — can proceed in parallel after Task 1
- Task 4 depends on Tasks 1 and 3 — requires schemas before layout tests can reference
  them; correct
- Task 5 depends on Tasks 3 and 4 — form components need schemas and layout; correct
- Task 6 depends on Tasks 2, 3, and 5 — needs Ky client (Task 2), schemas (Task 3), and
  form components (Task 5); correct
- Task 7 depends on Tasks 4 and 6 — success page needs layout (Task 4) and the upload
  route to be complete (Task 6); correct
- Tasks 8, 10, 12, 14 all depend on Tasks 3 and 4 — component-only tasks, no server
  dependency; correct; can proceed in parallel after Tasks 3 and 4
- Tasks 9, 11, 13, 15 all depend on Tasks 2, 3, and their respective component task —
  need Ky client, schemas, and components; correct
- Task 16 depends on Tasks 6, 9, 11, 13, 15 — all request functions must exist; correct
- Task 17 depends on Tasks 7, 9, 11, 13 — needs success page and the four main route
  groups wired; correct
- Task 18 depends on Tasks 2, 3, 6, 9, 11, 13, 15 — Docker setup after all server routes
  are implemented; correct

No circular dependencies. No task requires work that appears later in the list.

---

## Summary

The task list is complete, consistent, and unambiguous with one exception: a minor
inconsistency between the plan's URL route table (`/curation/*`) and the folder structure
(`src/app/admin/curation/`) needs the implementer to confirm the intended URL prefix before
Task 4. This is noted in the task list's Flagged Issues section only implicitly — it is
captured here for explicit tracking.

The task list is ready for developer review. The folder/URL inconsistency should be
resolved before Task 4 begins.
