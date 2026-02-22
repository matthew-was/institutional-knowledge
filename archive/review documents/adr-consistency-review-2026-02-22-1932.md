# ADR Consistency Review

Pre-approval review of `architecture-decisions.md` (ADR-001 to ADR-033), conducted
2026-02-22 before the document is formally approved. Each item requires a resolution
decision before the ADR document is finalised.

Items are grouped by priority: **Confirmed Issues** must be resolved before approval;
**Observations** are lower-priority and may be deferred.

---

## Confirmed Issues

---

### CI-001 — ADR-032 mislabels ADR-015 in its Source line

**ADRs involved**: ADR-032, ADR-015

**The issue**:
ADR-032 Source reads:

> "Cross-references ADR-015 (pytest as test runner)"

ADR-015 is about Python placement in the monorepo — not about pytest specifically. Its
Tradeoffs section says "two test runners (Vitest and pytest)". ADR-032 is the ADR that
actually decides to use pytest. The annotation mischaracterises what ADR-015 decided.

**Resolution options**:

- Fix the annotation to read "ADR-015 (Python service structure, Vitest and pytest as
  test runners)" or similar accurate description.

**Status**: Open

---

### CI-002 — ADR-018 and ADR-019 contradict each other on whether a report exists after an interrupted run

**ADRs involved**: ADR-018, ADR-019

**The issue**:
ADR-018 Context states:

> "UR-020 requires no summary report for an interrupted run (the report is only written
> as part of the `completed` transition)."

ADR-019 Risk Accepted states:

> "The report file from an interrupted run may contain per-file outcomes for files that
> were subsequently rolled back by ADR-018."

ADR-019 Rationale also states:

> "Note that the partial report from an interrupted run survives even though the ingestion
> itself is rolled back."

These are opposite conclusions. ADR-018 asserts UR-020 requires no report file for an
interrupted run. ADR-019 decides a partial report file does exist on disk after an
interrupted run (it just lacks a summary totals section).

An implementer following ADR-018 would delete or never create a report file on interruption.
An implementer following ADR-019 would leave a partial report file in place.

The root ambiguity is in UR-020 itself: does "no summary report" mean "no file at all" or
"no complete/final summary section"?

**Resolution needed**:

- Which interpretation of UR-020 is correct?
  - Option A: No file at all on interruption — ADR-019's streaming approach must be
    revised so the file is either deleted on interruption or not created until the run
    completes.
  - Option B: Partial file is acceptable — ADR-018's characterisation of UR-020 must be
    corrected to clarify that "no summary report" means no complete summary section, not
    no file.

**Status**: Open — requires decision

---

### CI-003 — ADR-018 uses two different names for the same sweep mechanism

**ADRs involved**: ADR-018, ADR-017

**The issue**:
Within ADR-018, step 4 is labelled "Run-start sweep":

> "4. Run-start sweep (per UR-019): at the start of every ingestion run..."

The summary paragraph immediately after calls the same mechanism a "startup sweep":

> "...the next run's startup sweep removes all artifacts from the incomplete run."

ADR-017's mechanism is correctly named "Startup sweep" — it fires on **application startup**.
ADR-018's mechanism fires at the **start of each ingestion run**, which is a different event.
Using "startup sweep" for both risks an implementer conflating the two and implementing
ADR-018's per-run pre-check as an application-level startup hook.

**Resolution options**:

- Fix ADR-018's summary paragraph to use "run-start sweep" consistently throughout.

**Status**: Open

---

### CI-004 — `running` step status (ADR-027) is unreachable given ADR-031's constraint

**ADRs involved**: ADR-027, ADR-031

**The issue**:
ADR-027 defines the `pipeline_steps` status enum as:

> "status (`pending`, `running`, `completed`, `failed`)"

ADR-031 Tradeoffs states:

> "Pipeline step status updates are not written until Python returns its response to
> Express. This means the `pipeline_steps` table does not reflect real-time progress
> during processing — it is updated after each document completes, not after each step
> within a document."

Under ADR-031, no step can transition to `running` in the database during normal operation.
Steps go directly from `pending` to `completed` or `failed` when Python responds. The
`running` value is defined in the schema enum but has no mechanism to be written.

Because the enum lives in `packages/shared/` (ADR-027), this is also dead schema from day
one — it is a harder-to-remove type than a plain text column.

**Resolution needed**:

- Option A: Remove `running` from the enum. Steps are `pending`, `completed`, or `failed`.
  Simpler schema; no dead values. ADR-027 is updated to remove `running` and explain why
  real-time progress is not tracked (cross-reference ADR-031).
- Option B: Retain `running` but add a documented use case and the mechanism for writing it
  (e.g. Express marks the step `running` before sending the HTTP request to Python, and
  updates to `completed` or `failed` on response). This requires acknowledging that ADR-031's
  "updated after document completes" statement is imprecise and that one additional write per
  document occurs before Python responds.
- Option C: Retain `running` as reserved for a future phase and add a comment in ADR-027
  stating it is unused in Phase 1 with an explicit note that it is a deliberate exception
  to UR-137's prohibition on unused future fields (as ADR-027 already does for
  `pipeline_version`).

**Status**: Open — requires decision

---

### CI-005 — Archive reference separator is inconsistent within ADR-023

**ADRs involved**: ADR-023

**The issue**:
ADR-023 Decision specifies the format using an em dash:

> `` `YYYY-MM-DD — [description]` ``

ADR-023 Rationale then states the format "mirrors" the bulk ingestion naming convention:

> `` "mirrors the bulk ingestion naming convention (`YYYY-MM-DD - short description` per UR-014)" ``

UR-014 uses a hyphen-minus with spaces (`-`). The archive reference uses an em dash (`—`).
The ADR says the format "mirrors" the convention but the separator characters differ.

An implementer may assume both use the same character and implement one format for both,
producing a display mismatch.

**Resolution needed**:

- Option A: The em dash is intentional (archive reference is a more formal display label
  than a filename). Update the Rationale to say the format is *inspired by* rather than
  *mirrors* the naming convention, and note the deliberate separator difference.
- Option B: The hyphen-minus is intended throughout. Update the Decision format to use
  `` `YYYY-MM-DD - [description]` `` (hyphen-minus) to match UR-014.

**Status**: Open — requires decision

---

### CI-006 — ADR-004 overstates the VectorStore abstraction: migrating to a dedicated vector DB does require Express/C3 changes

**ADRs involved**: ADR-004, ADR-033

**The issue**:
ADR-004 states:

> "can migrate to dedicated vector DB if needed — the `VectorStore` abstraction (ADR-033)
> makes this swap possible without changing C3 or C2"

ADR-033 Tradeoffs states:

> "Cross-store joins (relational metadata + vector results in one SQL query) are only
> possible with the pgvector implementation. If a dedicated vector DB is adopted in Phase 4,
> similarity search results must be fetched from the vector store first, then joined to
> relational data in application code."

Joining in application code is a change to the C3 query handling logic inside Express.
ADR-004's claim that migration requires "no changes to C3" is too strong. ADR-033's Tradeoffs
section quietly corrects this without flagging the inconsistency in ADR-004.

**Resolution options**:

- Update ADR-004's risk accepted section to say "C2 requires no changes; C3 query logic in
  Express may require changes to handle application-level joins when pgvector is replaced by
  a dedicated vector DB (see ADR-033 Tradeoffs)."

**Status**: Open

---

### CI-007 — architecture.md does not reflect ADR-033

**Files involved**: `documentation/project/architecture.md`, ADR-033

**The issue**:
[documentation/project/architecture.md](../project/architecture.md) states:

> "This document is a synthesis of all decisions recorded in decisions/architecture-decisions.md
> (ADR-001 through ADR-032)."

ADR-033 was added after architecture.md was written. As a result:

- The header still says ADR-001 through ADR-032
- The vector storage row in the Configuration Architecture table reads "pgvector config /
  pgvector on local PostgreSQL (ADR-004)" with no reference to the VectorStore interface
- The VectorStore interface — which governs how embeddings are written (C2 path) and how C3
  performs search — is absent from the architecture synthesis document

**Resolution options**:

- Update architecture.md to include ADR-033: update the header range, add the VectorStore
  interface to the vector storage row, and add ADR-033 to the cross-cutting decisions summary
  table.

**Status**: Open

---

## Observations

Lower-priority items. May be addressed now or deferred to implementation.

---

### OB-001 — Text quality scoring has no ADR

ADR-021 explicitly covers metadata completeness scoring and notes it is "assessed
independently of text quality" (UR-054) — confirming text quality scoring is a separate
concern. ADR-031 lists "quality scoring" as one of the outputs Python returns to Express.

No ADR defines what text quality scoring is architecturally: whether it is pluggable, what
its interface contract looks like, what the 0-100 scale represents, or what thresholds govern
it. An implementer must invent this component without architectural guidance.

**Options**: Add a brief ADR (or an addendum to ADR-021) defining the text quality scoring
interface contract. Or document it as a deliberate implementer decision.

---

### OB-002 — `running` status has no documented future use case

Separate from CI-004: even if `running` is retained (CI-004 Option B or C), ADR-027 never
explains *when* it would be written or what downstream behaviour depends on it. If it is
Phase 2+ scaffolding, this should be stated explicitly — as ADR-027 already does for
`pipeline_version`.

---

### OB-003 — ADR-031 leaves "file location or file content" unresolved

ADR-031 processing contract states Express sends:

> "(document ID, file location or file content)"

"Or" without specifying which applies and under what conditions. The two options have
different infrastructure implications:

- **File location**: Python must have filesystem access to the same storage volume as Express
  (a Docker Compose volume mount). Smaller HTTP payload.
- **File content**: Python needs no filesystem access. Larger HTTP payload for binary files.

This is an implementer decision left unresolved at the architecture level, but it has
meaningful consequences for the Docker Compose volume topology.

---

### OB-004 — Single shared config file vs. two files in the same format is not resolved

ADR-015 says "each language uses its own idiomatic configuration library to load a shared
runtime configuration file" (singular) but later says "shared config file format" (implying
format, not necessarily one file). ADR-016 says "the config file is the single control plane".

The intent appears to be one file, but "shared format" could mean two files in the same
schema. This matters for Docker Compose: one file = one mount point; two files = two mount
points that must be kept in sync.

---

### OB-005 — `reprocess` command has no defined interface

ADR-027 enrichment reprocessing section references:

> "A 'reprocess' command selects documents at the old version and resets specific steps
> to `pending`"

No ADR defines whether this is a CLI command, API endpoint, web UI action, or database
operation. Given ADR-026's decision that processing is triggered via an Express API endpoint
callable from both CLI and web UI, the same pattern would be consistent here — but it is
not stated.

---

### OB-006 — ADR-010's "immediately delete" language does not describe how bulk ingestion cleanup actually works

ADR-010 states:

> "On any error during upload or ingestion, immediately delete all partial state"

For bulk ingestion, ADR-018 prescribes a deferred run-start sweep, not immediate deletion.
ADR-010 cross-references ADR-017 and ADR-007 but not ADR-018. An implementer reading
ADR-010 as a general policy statement would apply immediate deletion to both paths, which
contradicts ADR-018's design.

The ADR-010 cleanup policy should clarify that "immediately" applies to web UI uploads
(ADR-007/ADR-017) and that bulk ingestion follows the run-start sweep pattern (ADR-018).

---

## Resolution Tracker

| ID | Summary | Type | Status |
| --- | --- | --- | --- |
| CI-001 | ADR-032 mislabels ADR-015 in Source line | Mechanical fix | Resolved |
| CI-002 | ADR-018/ADR-019 contradict on interrupted-run report | Decision required | Resolved |
| CI-003 | ADR-018 uses two names for its sweep mechanism | Mechanical fix | Resolved |
| CI-004 | `running` status is unreachable given ADR-031 | Decision required | Resolved |
| CI-005 | Archive reference separator inconsistent in ADR-023 | Decision required | Resolved |
| CI-006 | ADR-004 overstates VectorStore migration scope | Mechanical fix | Resolved |
| CI-007 | architecture.md missing ADR-033 | Mechanical fix | Resolved |
| OB-001 | Text quality scoring has no ADR | Gap — document or defer | Resolved |
| OB-002 | `running` status has no future use case documented | Clarification | Resolved — via CI-004 (Option B) |
| OB-003 | "file location or file content" unresolved in ADR-031 | Implementer decision | Resolved |
| OB-004 | Single config file vs. two files in same format unclear | Clarification | Resolved |
| OB-005 | `reprocess` command interface undefined | Implementer decision | Resolved |
| OB-006 | ADR-010 "immediately delete" doesn't cover ingestion path | Mechanical fix | Resolved |
