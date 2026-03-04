# Self-Review — Backend Task List

Reviewed: 2026-03-04
Task list: `documentation/tasks/backend-tasks.md`
Source plan: `documentation/tasks/integration-lead-backend-plan.md`

---

## Completeness

Every implementation unit in the backend plan has a corresponding task:

| Plan section | Task(s) |
| --- | --- |
| Route structure (20 handlers across 7 route groups) | Tasks 8–15 |
| Middleware (logger, auth, validation, error handler) | Task 4 |
| Service layer — document upload (DOC-001 to DOC-003, DOC-005) | Task 8 |
| Service layer — document curation (DOC-006 to DOC-009) | Task 9 |
| Service layer — vocabulary curation (VOC-001 to VOC-004) | Task 10 |
| Service layer — processing trigger (PROC-001) | Task 11 |
| Service layer — processing results (PROC-002) | Task 12 |
| Service layer — search (QUERY-001, QUERY-002) | Task 13 |
| Service layer — ingestion (ING-001 to ING-004) | Task 14 |
| Service layer — health + admin (ADMIN-001) | Task 15 |
| Startup operations (upload sweep + ingestion sweep) | Task 16 |
| VectorStore interface + PgVectorStore | Task 6 |
| GraphStore interface + PostgresGraphStore | Task 7 |
| Knex migrations (001–006) | Task 2 |
| nconf configuration | Task 3 |
| StorageService interface + LocalStorageService | Task 5 |
| Biome tooling quality gate | Task 19 |
| Integration test suite | Task 18 |
| Project scaffold | Task 1 |
| Database seed | Task 17 |

**Assessment**: All 20 handlers, both store implementations, all 6 migrations, all middleware,
startup sweeps, config, storage, integration tests, seed, scaffold, and tooling gate are
covered. No plan section is silently omitted.

**One implementation note**: The backend plan specifies that `receiveProcessingResults` must
be both an Express route handler (PROC-002) and a service function called internally by the
async processing loop in `triggerProcessing`. Task 12 explicitly requires the service to be
implemented as a reusable function. Task 11 depends on Task 12 to reflect this ordering. This
is consistent with the plan.

---

## Consistency

**Dependency field correctness**:

| Task | Stated dependencies | Correct? |
| --- | --- | --- |
| Task 1 | none | Correct |
| Task 2 | Task 1 | Correct |
| Task 3 | Task 1 | Correct |
| Task 4 | Task 3 | Correct |
| Task 5 | Task 3 | Correct |
| Task 6 | Task 2, Task 3 | Correct |
| Task 7 | Task 2, Task 3 | Correct |
| Task 8 | Task 2, 3, 4, 5 | Correct |
| Task 9 | Task 2, 3, 4 | Correct |
| Task 10 | Task 2, 3, 4 | Correct |
| Task 11 | Task 2, 3, 4, 12 | Correct — Task 12 must exist before Task 11 can call the service function |
| Task 12 | Task 2, 3, 4, 6 | Correct |
| Task 13 | Task 2, 3, 4, 6, 7 | Correct |
| Task 14 | Task 2, 3, 4, 5 | Correct |
| Task 15 | Task 2, 3, 4 | Correct |
| Task 16 | Task 2, 3, 4, 5 | Correct — fixed from initial draft (Task 3 was missing) |
| Task 17 | Task 2 | Correct |
| Task 18 | Task 2, 6, 7, 8, 9, 12, 15, 16 | Correct |
| Task 19 | Task 1 | Correct |

**Status values**: All 19 tasks have `Status: not_started`. Correct.

**Condition types**: All tasks use `automated`, `manual`, or `both`. All values are valid.

---

## Ambiguity

**Task 8 — archive reference dependency**: The task description flags F-003 (the
`packages/shared/` dependency for the archive reference function) and instructs the
implementer to confirm the package is available before starting. This is explicit and
actionable.

**Task 1 — ESM/CJS decision block**: The task explicitly states the module format decision
must be made before the task can be completed and references F-001. This correctly surfaces
the blocker without embedding a decision.

**Task 17 — vocabulary seed content**: The task description acknowledges the seed content
is illustrative and can be replaced during the curation phase. The acceptance condition is
manual (checking a test database) which is appropriate given the subjective nature of the
initial vocabulary content.

**Task 11 and Task 12 ordering**: Task 11 depends on Task 12. This may initially seem
backwards (triggering before results?), but is correct: the service function from Task 12
must exist before Task 11's async loop can call it. The description in Task 11 makes this
explicit. The dependency field records the constraint correctly.

**Assessment**: No task description requires reading the full backend plan to begin work. All
acceptance conditions are verifiable without subjective judgement (with the exception of
Task 17 seed content, which is appropriately flagged as manual).

---

## Ordering

Tasks are ordered from scaffold → infrastructure → handlers → tests → quality gate. The
dependency graph is acyclic. Task 1 has no dependencies and can be started immediately once
the ESM/CJS decision (F-001) is resolved.

The Task 11 → Task 12 dependency means Task 12 must be implemented before Task 11. An
implementer working sequentially should implement Task 12 before Task 11. The dependency
field makes this constraint explicit.

---

## Issues requiring developer action before implementation

**Issue 1 (Blocking — F-001)**: ESM vs CommonJS must be decided before Task 1 can be
completed. This decision should be captured as ADR-047.

**Issue 2 (Non-blocking — F-003)**: The `packages/shared/` archive reference function
cross-service dependency should be confirmed against the frontend task list before Task 8
begins.

---

## Verdict

The task list is complete and consistent. One dependency omission (Task 16 missing Task 3)
was found during review and corrected in the task list before presenting to the developer.
One pre-implementation decision is required (F-001, ESM/CJS). One cross-service dependency
requires confirmation (F-003 in Task 8). The task list is ready for developer review.
