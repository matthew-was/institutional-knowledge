# Task List Self-Review — Frontend Service

Reviewing: `documentation/tasks/frontend-tasks.md`
Source plan: `documentation/tasks/senior-developer-frontend-plan.md` (Approved 2026-03-03)
Date: 2026-03-04

---

## Completeness

Every distinct implementation unit in the source plan has been mapped to a task. The
coverage is as follows:

| Plan section | Tasks |
| --- | --- |
| Next.js App Router scaffolding, custom server (ADR-044), Biome (ADR-046) | Task 1 |
| Configuration module (`Config` class, nconf, Zod, fail-fast) | Task 2 |
| Internal API client helper (`apiClient`, `x-internal-key` injection) | Task 3 |
| Zod schemas — upload and duplicate response (`UploadFormSchema`, `DuplicateResponseSchema`) | Task 4 |
| `parseFilename` utility | Task 5 |
| App layout (`AppNav`), root redirect, curation sub-layout (`CurationNav`) | Task 6 |
| C1 upload components (`FilePickerInput`, `MetadataFields`, `ValidationFeedback`, `DuplicateConflictAlert`, `SubmitButton`, `UploadSuccessMessage`, `DocumentUploadForm`) | Task 7 |
| Upload pages (`/upload`, `/upload/success`) | Task 8 |
| Next.js API route — composite upload DOC-004 (with DOC-001/002/003/005 orchestration) | Task 9 |
| Curation document queue components (`DocumentQueueList`, `DocumentQueueItem`, `ClearFlagButton`) | Task 10 |
| Curation document queue page + API routes (DOC-006, DOC-008) | Task 11 |
| Document metadata edit components (`MetadataEditFields`, `DocumentMetadataForm`) | Task 12 |
| Curation Zod schemas (`MetadataEditSchema`, DOC-006/DOC-007 response schemas) + API routes (DOC-007, DOC-009) | Task 13 |
| Document metadata edit page (`/curation/documents/[id]`) | Task 14 |
| Vocabulary review queue components (`VocabularyQueueList`, `VocabularyQueueItem`, `AcceptCandidateButton`, `RejectCandidateButton`) | Task 15 |
| Vocabulary review queue page + API routes (VOC-001, VOC-002, VOC-003) | Task 16 |
| Manual vocabulary term entry components (`TermRelationshipsInput`, `AddVocabularyTermForm`) + `AddTermSchema` | Task 17 |
| Manual vocabulary term entry page + API route (VOC-004) | Task 18 |
| Pino logging in all API route handlers | Task 19 |
| Cross-cutting error handling (queue fetch failure states, 5xx browser messages, network errors) | Task 20 |
| End-to-end MSW integration test suite | Task 21 |

**Plan sections confirmed covered**: All components, pages, API routes, Zod schemas,
configuration, logging, error handling, and testing approaches described in the plan
are represented. The plan explicitly defers the C3 query proxy (OQ-005) to Phase 2;
no task for that has been created, which is correct.

**No plan section is silently omitted.**

---

## Consistency

### Task number references in dependency fields

| Task | Depends on (declared) | Verification |
| --- | --- | --- |
| 1 | none | Correct — no prerequisites |
| 2 | Task 1 | Correct — needs scaffolding |
| 3 | Task 2 | Correct — needs Config |
| 4 | Task 1 | Correct — only needs project skeleton |
| 5 | Task 1 | Correct — pure utility, no other deps |
| 6 | Task 1 | Correct — layout only needs project skeleton |
| 7 | Task 4, Task 5, Task 6 | Correct — needs schemas, parseFilename, layout |
| 8 | Task 6, Task 7 | Correct — needs layout and upload components |
| 9 | Task 3 | Correct — needs apiClient |
| 10 | Task 6 | Correct — components only need layout |
| 11 | Task 3, Task 10 | Correct — needs apiClient and queue components |
| 12 | Task 6 | Correct — components only need layout |
| 13 | Task 3, Task 4 | Correct — needs apiClient and base schemas |
| 14 | Task 12, Task 13 | Correct — needs form component and schemas/API routes |
| 15 | Task 6 | Correct — components only need layout |
| 16 | Task 3, Task 15 | Correct — needs apiClient and queue components |
| 17 | Task 6 | Correct — components only need layout |
| 18 | Task 3, Task 17 | Correct — needs apiClient and form components |
| 19 | Task 9, Task 11, Task 13, Task 16, Task 18 | Correct — logging added to all API route handlers; all handler tasks must exist first |
| 20 | Task 7, Task 10, Task 12, Task 15, Task 17 | Correct — error handling sweep of all component tasks |
| 21 | Task 9, Task 11, Task 13, Task 16, Task 18 | Correct — consolidates individual route tests |

All dependency references are to real task numbers. No broken references found.

### Status values

All 21 tasks have `Status: not_started`. Correct.

### Condition type values

All condition types are one of `automated`, `manual`, or `both`. Verified:

- Tasks 1, 6, 8, 14, 19: `manual`
- Tasks 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 15, 16, 17, 20, 21: `automated`
- Task 18: `both`

No invalid values.

---

## Ambiguity

### Potential ambiguity: Task 12 vs Task 13 dependency

Task 12 (`DocumentMetadataForm`) references `MetadataEditSchema` which is formally
defined in Task 13. Task 12 states "the schema file can be extended from the one
created in Task 4" and directs the Implementer to Task 13. However, Task 12 has no
dependency on Task 13 in its `Depends on` field, and Task 13 has no dependency on
Task 12.

**Assessment**: This is intentional. The two tasks are peer tasks with no strict
ordering dependency — the schema can be defined in Task 13 but placed in the same
`schemas.ts` file that already exists from Task 4. The Implementer may either:
(a) implement Task 12 and Task 13 in sequence (Task 13 first adds the schema, then
Task 12 uses it), or (b) implement them in the same session. The task descriptions
make the relationship clear. This is not a blocking ambiguity.

**Recommendation**: Add a note to Task 12's `Depends on` field to clarify the
ordering. However, since the plan does not mandate a strict dependency here and the
task description is explicit, this is flagged as an observation rather than an error.

### Potential ambiguity: Task 19 dependency on Task 9 which depends on Task 3

Task 9 depends on Task 3 (apiClient). Task 19 adds logging to the handlers created in
Tasks 9, 11, 13, 16, 18. The logging task comes after all route tasks are complete.
This is correct and unambiguous.

### Observation: Task 20 overlaps with Tasks 10 and 15

Task 20 is a cross-cutting error-handling sweep. Its acceptance condition explicitly
notes that cases (a) and (b) may already be covered by Tasks 10 and 15. The task
description is clear that if those tests exist, this task confirms them without
duplication. This is by design and is not ambiguous.

### No other ambiguity found

All component names, file paths, API routes, contract IDs (DOC-001 to DOC-009,
VOC-001 to VOC-004), and schema names are specific and consistent with the approved
plan and the Integration Lead contracts document.

---

## Ordering

The dependency chain is:

```text
Task 1 (scaffold)
  → Task 2 (config)
      → Task 3 (apiClient)
          → Task 9 (upload API route)
          → Task 11 (doc queue API routes)
          → Task 13 (metadata schemas + API routes)
          → Task 16 (vocab queue API routes)
          → Task 18 (add term API route)
              → Task 19 (logging)
              → Task 21 (e2e test suite)
  → Task 4 (upload schemas)
      → Task 7 (upload components)
          → Task 8 (upload pages)
          → Task 20 (error handling sweep)
  → Task 5 (parseFilename)
      → Task 7
  → Task 6 (layout/nav)
      → Task 7, Task 8
      → Task 10 (doc queue components)
          → Task 11
          → Task 20
      → Task 12 (metadata edit components)
          → Task 14 (metadata edit page)
          → Task 20
      → Task 15 (vocab queue components)
          → Task 16
          → Task 20
      → Task 17 (add term components)
          → Task 18
          → Task 20
```

No circular dependencies. The first implementable tasks with no prerequisites are Task 1
only. Task 1 unblocks Tasks 2, 4, 5, and 6. This is a valid starting point.

**One ordering note**: Task 12 (`DocumentMetadataForm`) uses `MetadataEditSchema` which
is defined in Task 13. Since neither depends on the other, an Implementer working on
Task 12 alone would need to stub the schema. This is workable but worth noting. The
Implementer should implement Task 13 before or concurrently with Task 12.

---

## Summary

The task list is structurally sound:

- All 21 tasks cover every implementation unit in the approved plan.
- No plan section is silently omitted.
- All dependency references are to real task numbers; no broken references.
- All status values, complexity values, and condition type values are valid.
- All acceptance conditions are specific and verifiable without subjective judgement.
- One minor ordering note: the Implementer should address Task 13 before or
  concurrently with Task 12 (not enforced by a dependency field, but made explicit in
  the task descriptions).
- No flagged issues require resolution before work can begin.
