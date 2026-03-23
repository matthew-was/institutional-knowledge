# Self-Review — Senior Developer Frontend Plan Revision (2026-03-23)

**Reviewer**: Senior Developer (Frontend) agent
**Date**: 2026-03-23
**Document reviewed**: `documentation/tasks/senior-developer-frontend-plan.md`
**Reference**: `documentation/tasks/frontend-tasks-revision-2026-03-23.md`

---

## Decisions made during revision

### Placement of Config class

The original plan placed the Config class at `apps/frontend/src/config/index.ts`. After the
revision, the Config class is placed at `apps/frontend/server/config/index.ts` — inside
`server/` rather than `src/`. This is consistent with the separation of the custom server
sub-system (`server/`) from the Next.js UI sub-system (`src/`). Config is server-side only
and must not be importable from browser-side code. Placing it inside `server/` makes this
boundary structurally explicit.

### `MetadataEditSchema` and `AddTermSchema` derivation note

The revision document (§D2) says these schemas are "derived from their shared counterparts"
and "extend the shared schema shapes with frontend-specific transformation rules". The plan
records this in the validation sections by stating that each schema must be derived from the
shared import rather than being an independent redefinition. The exact derivation pattern
(e.g. `.extend()`, `.transform()`) is left to the Implementer, consistent with the plan's
role as design reference rather than implementation code.

### Tier 1 component test scope

The revision document places presentational component tests at Tier 1 (RTL, static props).
The plan applies this consistently to `DuplicateConflictAlert`, `FilePickerInput`,
`UploadSuccessMessage`, `DocumentQueueItem`, `VocabularyQueueItem`, and the action buttons.
Where the original plan had these as "component tests" under a combined heading, they are
now explicitly Tier 1 with the static-props constraint noted.

### `fetchWrapper` test placement

The revision document describes `fetchWrapper` as testable by mocking `window.fetch` — a
pure unit test with no MSW needed. This is placed at Tier 1 in the C1 testing section. It
does not appear in the curation testing section because `fetchWrapper` is a shared utility;
it belongs in one place. The Implementer should co-locate its test in `src/lib/__tests__/`.

### Hono route paths unchanged

The revision confirms that the route paths themselves are unchanged — only the layer
description changes from "Next.js API route" to "Hono route handler". The plan preserves
all existing paths (e.g. `/api/documents/upload`, `/api/curation/documents`) and updates
only the column heading and layer descriptions.

### `server.ts` automated coverage not added as a named section

The revision document (§3.2) notes that `server.ts` should have automated Tier 2 supertest
coverage for: startup smoke test and internal key leak assertion. This is a task-level
concern (it belongs in the task descriptions the PM writes) rather than a plan-level design
decision. The plan's testing sections describe what to test at each tier; the `server.ts`
startup tests will be covered by the Hono server setup task the PM writes. No additional
section was added to the plan for this — it is already implied by the Tier 2 route handler
test description ("supertest against the Hono app").

---

## Checklist — all required items addressed

1. **Status line updated** — Yes. Status line already reflected the 2026-03-23 revision when
   the revision was started (it had been pre-updated).

2. **Scope summary updated** — Yes. "Hono custom server that mounts Next.js as a catch-all"
   replaces the former "Next.js custom server" description.

3. **Custom server architecture section added** — Yes. New section documents:
   - Three-layer structure (route handler, handler, request functions) with a table
   - `server.ts` code pattern from §D4 of the revision document
   - Folder structure guide from §3.0 of the revision document
   - Framework agnosticism constraints with cross-reference to `development-principles.md`
   - HTTP library choices (useSWR/useSWRMutation + `fetchWrapper`; Ky server-side)

4. **Testing sections updated to three-tier model** — Yes. Both C1 and Curation testing
   sections now name tiers explicitly (Tier 1, Tier 2, Tier 3), state the MSW intercept
   boundary for each tier (Hono route boundary vs Express boundary), and reference
   `development-principles.md` as the canonical model definition.

5. **"Next.js API route" references updated** — Yes. All occurrences replaced with
   "Hono route handler" or "Hono route". Checked: data fetching narrative, API calls table
   column headings, authentication section, dependency injection section, OQ-001 resolution.

6. **`DuplicateConflictAlert` props updated** — Yes. `date` is now `string | null`.

7. **`DuplicateResponseSchema` note updated** — Yes. The validation section for DOC-002 now:
   - States that the schema is imported from `@institutional-knowledge/shared`
   - Specifies the correct 409 wire shape: `{ "error": "duplicate_detected", "data": { "existingRecord": { ... } } }`
   - States that frontend code must read `response.data.existingRecord`
   - Notes that `existingRecord.date` is `string | null`

8. **API calls tables updated** — Yes. Both C1 and Curation tables have "Hono route" as
   the column heading (replacing "Next.js route"), and the Caller/Notes text describes
   Hono route handlers.

9. **Cross-cutting concerns updated**:
   - Configuration: `express.internalKey` is now described as set once on the Ky instance
     in `server/requests/`, not per-call in route handlers. Config class moved to
     `server/config/index.ts`.
   - Authentication: `x-internal-key` is now described as injected by the Ky instance in
     `server/requests/`, replacing the former `apiClient.ts` helper description.
   - Dependency injection: `apiClient` helper replaced with the Ky instance pattern;
     `useSWR`/`useSWRMutation` described as calling through `fetchWrapper`; server-side
     request functions use the pre-configured Ky instance.

10. **OQ-001 resolution updated** — Yes. Now describes Hono handler orchestrating Express
    calls, not "Next.js API routes".

11. **Handoff checklist updated** — Yes. Added a checked item noting the 2026-03-23
    revision with a summary of all changes.

12. **Null date display rule added** — Yes. Added to:
    - `UploadSuccessMessage` — "Undated" for null date
    - `DuplicateConflictAlert` — "Undated" for null date
    - `DocumentQueueItem` — "Undated" for null date
    - `DocumentMetadataForm` — null initial value handled without triggering a validation error

---

## Items not changed (per instructions)

- User story coverage table — unchanged
- Pages/routes tables — unchanged
- Component responsibility descriptions beyond the specific items listed — unchanged

---

## Ambiguities resolved

None — all items were unambiguous based on the revision document.

---

## Items not in scope for this revision (noted for completeness)

The revision document also specifies changes to `frontend-tasks.md` (Step 4) and to
`development-principles.md` (Step 2). Those are separate steps and were not actioned here.
The plan revision is Step 3 only.

The revision document lists Zod v4 `z.uuid()` as a change (§1.4). This is applied in the
`AddTermSchema` section (`targetTermId: z.uuid()`). The `UploadFormSchema` and
`MetadataEditSchema` do not contain UUID fields, so no change was needed there.

---

The review is ready for the user to check.
