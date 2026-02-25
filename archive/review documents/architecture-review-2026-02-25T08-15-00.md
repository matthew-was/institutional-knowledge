# Architecture Document Review

Pre-approval review of `documentation/project/architecture.md` conducted 2026-02-25 against all 41 approved Architecture Decision Records (ADR-001 through ADR-041), `documentation/project/system-diagrams.md`, and `documentation/project/pipeline-diagram.mermaid`.

## Summary Assessment

| Dimension | Score | Notes |
| --- | --- | --- |
| **Completeness** | 8/10 | Covers all 41 ADRs with references; all four components documented; some gaps in ADR-specific detail |
| **Consistency** | 7/10 | Several inconsistencies with system-diagrams.md and pipeline-diagram.mermaid; one stale ADR reference; mostly aligned with ADRs |
| **Clarity** | 9/10 | Well-structured; terminology consistent; appropriate technical depth; minimal ambiguity |

---

## Critical Issues

Items in this section **must** be resolved before architecture.md can be approved.

### C-01 — Pipeline-diagram.mermaid shows outdated 7-step pipeline

**Files involved**: `documentation/project/pipeline-diagram.mermaid`, `documentation/project/system-diagrams.md`, `documentation/project/architecture.md`, `documentation/decisions/architecture-decisions.md`

**The issue**:

`pipeline-diagram.mermaid` (lines 129-137) shows a separate "Vocabulary Candidates" step as step 5 of 7, followed by "Semantic Chunking" (step 6) and "Embedding Generation" (step 7).

ADR-038 explicitly states: "The previous separate 'vocabulary candidate identification' step is removed from the C2 pipeline" and confirms a **6-step pipeline**:

1. Text Extraction
2. Quality Scoring
3. Metadata Extraction
4. Completeness Scoring
5. LLM Combined Pass (replaces both old vocabulary candidate step and old chunking step)
6. Embedding Generation

`system-diagrams.md` (Diagram 3, lines 111-160) correctly shows the 6-step pipeline and labels LLM Combined Pass at step 5.

`architecture.md` (lines 224-240) correctly describes the 6-step pipeline.

Additionally, `pipeline-diagram.mermaid` transaction write node (line 140) does not mention entities, relationships, or `entity_document_occurrences`, while `system-diagrams.md` correctly includes these.

**Resolution options**:

**Option A (Recommended)**: Delete `pipeline-diagram.mermaid` entirely and commit the deletion. `system-diagrams.md` is the current canonical diagram file and is consistent with the ADRs and architecture.md. This eliminates the source of confusion.

**Option B**: Rewrite `pipeline-diagram.mermaid` to match `system-diagrams.md` and the ADRs. This is more work but maintains backward compatibility if external references to the file exist.

**Status**: Open — awaiting developer decision on Option A or Option B.

---

### C-02 — Pipeline-diagram.mermaid missing QueryRouter interface in C3 diagram

**Files involved**: `documentation/project/pipeline-diagram.mermaid`, `documentation/project/system-diagrams.md`, `documentation/project/architecture.md`, `documentation/decisions/architecture-decisions.md` (ADR-040)

**The issue**:

The C3 diagram in `pipeline-diagram.mermaid` (lines 168-211) shows the query flow going directly from `API` to `QueryEmbed` (line 194) with no `QueryRouter` node.

`system-diagrams.md` (Diagram 4, lines 164-214) correctly includes a `QueryRouter` node (lines 186-188) with Phase 1/Phase 2 behavior annotations:

```text
Phase 1: vector only
Phase 2: LLM classifier
```

`architecture.md` (lines 281-296) correctly describes the QueryRouter routing step and its role in Phase 1 vs Phase 2.

`pipeline-diagram.mermaid` does not reflect ADR-040 (Query Routing), which defines the QueryRouter interface as a first-class component.

**Resolution options**:

**Option A (Recommended)**: Delete `pipeline-diagram.mermaid` (same as C-01 Option A). `system-diagrams.md` is correct and current.

**Option B**: Add QueryRouter node to `pipeline-diagram.mermaid` C3 diagram with phase annotations.

**Status**: Open — dependent on C-01 resolution.

---

### C-03 — System-diagrams.md Diagram 1 shows direct DB→Processor data flow

**Files involved**: `documentation/project/system-diagrams.md`, `documentation/decisions/architecture-decisions.md` (ADR-031)

**The issue**:

Line 38 of `system-diagrams.md` Diagram 1:

```text
DB -.->|"Data"| Processor
```

ADR-031 is explicit: "The Python processing service has no direct database connection" and "Python has no awareness of database tables."

The dotted arrow from DB to Processor suggests the Python service reads from the database, which **directly contradicts** the architectural decision.

`pipeline-diagram.mermaid` Diagram 1 (line 42) correctly shows only:

```text
FileStore -.->|"File ref"| Processing
```

The system overview diagram should not imply direct database access to the Python service.

**Resolution options**:

**Option A (Recommended)**: Remove the `DB -.->|"Data"| Processor` arrow entirely. The Python service accesses files via storage references only. The `FileStore -.->|"File ref"| Processor` arrow is already correct and sufficient.

**Option B**: Reroute the arrow through the API: show DB→API and API data passed to Processor (but this is implicit in the fire-and-forget trigger, so may add noise).

**Status**: Open — requires edit to `system-diagrams.md` Diagram 1.

---

## High-Priority Issues

Items in this section should be resolved before architecture.md is approved; they represent gaps or inconsistencies that could confuse implementers.

### H-01 — StorageService interface not mentioned in architecture.md

**Files involved**: `documentation/project/architecture.md`, `documentation/decisions/architecture-decisions.md` (ADR-008)

**The issue**:

ADR-008 (lines 184-188 of the ADRs) defines a `StorageService` interface for file storage abstraction.

`architecture.md` Configuration Architecture table (line 143) lists "Document storage" with config key `storage.provider` but does not name the interface as `StorageService`.

The Provider Interfaces section (lines 159-183) documents three provider interfaces:

- `VectorStore` (ADR-033)
- `GraphStore` (ADR-037)
- `QueryRouter` (ADR-040)

But omits `StorageService` (ADR-008).

There are **four** provider interfaces, not three. An implementer reading only the architecture document would not know the storage abstraction has a named interface or the expected pattern it follows.

**Resolution options**:

**Option A (Recommended)**: Add a fourth row to the Provider Interfaces table or a note explicitly mentioning `StorageService` (ADR-008) and its role in the Infrastructure as Configuration pattern. List it with the same level of detail as the other three interfaces.

**Option B**: Add a footnote to the Provider Interfaces section acknowledging that `StorageService` follows the same pattern and is documented in ADR-008.

**Status**: Open — requires edit to `architecture.md`.

---

### H-02 — GraphStore not shown as visual node in system-diagrams C3 diagram

**Files involved**: `documentation/project/system-diagrams.md`, `documentation/project/architecture.md`, `documentation/decisions/architecture-decisions.md` (ADR-037, ADR-040)

**The issue**:

`architecture.md` Provider Interfaces section (lines 162-166) lists `GraphStore` alongside `VectorStore` and `QueryRouter`.

The C3 diagram in `system-diagrams.md` (Diagram 4, lines 164-214) shows `VectorStore` (line 196) and `QueryRouter` (line 204) as styled nodes but has **no visual `GraphStore` node**.

The Diagram 1 description in `architecture.md` (line 438) claims the system overview shows "GraphStore and QueryRouter interfaces", but the actual Diagram 1 in `system-diagrams.md` (lines 12-43) contains neither interface as a visible node.

The C3 query flow text in `architecture.md` (line 293) correctly describes `GraphStore.traverse()` for Phase 2 retrieval, but the diagram has no corresponding visual representation.

An implementer tracing the diagram would not see where GraphStore appears or how it integrates into the Phase 2 query flow.

**Resolution options**:

**Option A (Recommended)**: Add `GraphStore` as a visual node in the C3 diagram in `system-diagrams.md`, styled consistently with `VectorStore` (purple, `#e8d5ff`). Position it in the Phase 2 query path as an alternative to or complement to VectorSearch. Add a note explaining it is used for graph traversal in Phase 2 (ADR-040).

**Option B**: Add a Phase 2 subgraph to the C3 diagram showing the alternative graph-based query path with GraphStore as a node. This would show both Phase 1 (vector-only) and Phase 2 (graph-capable) flows in a single diagram.

**Option C**: Add a note or callout to the diagram section stating "GraphStore interface is Phase 2; see ADR-037 and ADR-040 for details."

**Status**: Open — requires edit to `system-diagrams.md` and/or `architecture.md`.

---

### H-03 — ADR-041 Phase 1 table references removed source_document_id column

**Files involved**: `documentation/decisions/architecture-decisions.md` (ADR-028, ADR-038, ADR-041)

**The issue**:

`architecture.md` line 346 correctly states that vocabulary schema is extended with `confidence` column and `source` enum includes `llm_extracted`. It correctly does **not** mention `source_document_id`.

However, ADR-041's Phase 1 schema table (line 1392 of the ADR file) still lists:

```text
| Extended vocabulary schema | ADR-028 (revised), ADR-038 | source_document_id, confidence columns; llm_extracted source enum value |
```

But ADR-028's revision (following ADR-038's decision to use `entity_document_occurrences` for universal provenance) explicitly removed `source_document_id`.

This is an **internal ADR inconsistency**: ADR-028 was revised to remove `source_document_id`, but ADR-041's Phase 1 summary table was not updated to reflect this change.

The `architecture.md` is correct in its interpretation, but an implementer cross-referencing ADR-041 to verify Phase 1 scope would encounter conflicting information.

**Resolution options**:

**Option A**: Update ADR-041 Phase 1 table to remove `source_document_id` reference and confirm only `confidence` column and `llm_extracted` source enum value are Phase 1 extensions.

**Option B**: Flag as a known errata item in ADR-041 with a note explaining the removal rationale from ADR-028.

**Status**: Open — requires either an ADR update or an errata note.

---

### H-04 — Pipeline-diagram.mermaid and system-diagrams.md both exist; approvals.md references pipeline-diagram.mermaid

**Files involved**: `documentation/project/pipeline-diagram.mermaid`, `documentation/project/system-diagrams.md`, `documentation/approvals.md`

**The issue**:

Git status shows `pipeline-diagram.mermaid` is tracked but deleted (`D documentation/project/pipeline-diagram.mermaid`), yet the file still exists on disk and was successfully read during this review.

Two diagram files now exist in `documentation/project/`:

- `pipeline-diagram.mermaid` (stale, reflects old 7-step pipeline and missing QueryRouter)
- `system-diagrams.md` (current, reflects 6-step pipeline and includes QueryRouter)

`architecture.md` references only `system-diagrams.md` (line 433), which is correct.

However, `documentation/approvals.md` line 40 references `pipeline-diagram.mermaid` as a Head of Development output document:

```text
- documentation/project/pipeline-diagram.mermaid
```

Line 12 does correctly reference `system-diagrams.md`:

```text
- documentation/project/system-diagrams.md
```

This is a naming transition that needs to be resolved: either delete `pipeline-diagram.mermaid` and commit the deletion (with `approvals.md` updated), or reconcile the two files.

**Resolution options**:

**Option A (Recommended)**: Delete `pipeline-diagram.mermaid` and commit the deletion. Update `approvals.md` to remove the `pipeline-diagram.mermaid` reference (line 40) and confirm only `system-diagrams.md` is the canonical diagram file. This is the simplest resolution.

**Option B**: Keep `pipeline-diagram.mermaid` as a legacy reference document but move it to `archive/previous-documentation/project/` to clearly mark it as superseded. Update `approvals.md` accordingly.

**Status**: Open — dependent on C-01 and C-02 resolution.

---

## Low-Priority Issues

Items in this section are minor; they do not block approval but should be addressed for completeness.

### L-01 — Architecture.md Phase 1 list does not explicitly defer Web UI query to Phase 2

**Location**: `architecture.md` line 339

**Issue**: The Phase 1 deliverables bullet list states "CLI for query and bulk ingestion" but does not explicitly state that web UI query is deferred to Phase 2.

The Data Flow section (line 279) correctly states: "the Primary Archivist asks a natural language question via the CLI (Phase 1) or web UI (Phase 2)", and the Phase 2 list (line 355) does say "Web UI for query".

However, the Phase 1 list could be clearer by adding a complementary note.

**Recommendation**: Add to the Phase 1 list (after the CLI query bullet): "(Web UI for query is deferred to Phase 2)"

**Status**: Low priority — current text is traceable but could be more explicit.

---

### L-02 — Architecture.md does not reference ADR-006 (Human-in-the-Loop Development)

**Location**: `architecture.md` Cross-Cutting Decisions Summary table (lines 397-427)

**Issue**: ADR-006 (Human-in-the-Loop Development with Claude Agents) is the only ADR between 001 and 041 with no reference in the architecture.md table.

ADR-006 is a process decision rather than a system architecture decision, so omitting it is defensible. However, no explicit exclusion note is provided.

**Recommendation**: Either add a note stating "ADR-006 (process decision; not architecture-relevant)" or add a row to the table with a note explaining its process-only scope.

**Status**: Low priority — omission is defensible, but an explicit note would make completeness auditable.

---

### L-03 — Architecture.md mentions UR-038 without ADR reference

**Location**: `architecture.md` line 372 (Phase 2 candidates section)

**Issue**: The Phase 2 candidate list mentions "try-all validation mode for grouped ingestion (UR-038)" but does not reference an ADR.

This is consistent with its status as a **candidate** rather than a decided feature; no ADR exists for UR-038 yet.

**Recommendation**: This is correct behavior — candidates should not have ADRs. No change needed; this is a note for the implementer that UR-038 is tracked but not yet designed.

**Status**: Not an issue — confirmed as expected behavior.

---

### L-04 — Inconsistent em dash vs. double hyphen in citations

**Locations**: `architecture.md` lines 215, 410; `documentation/decisions/architecture-decisions.md` (ADR-023); `system-diagrams.md` line 200

**Issue**:

Line 215: `YYYY-MM-DD -- [description]` (double hyphen)
Line 410: `YYYY-MM-DD -- [description]` (also double hyphen)
ADR-023 (line 573): specifies "em dash" (`—`), but architecture.md uses `--` (double hyphen in markdown)

In rendered markdown, `--` may or may not become an em dash depending on the renderer. ADR-023 explicitly distinguishes the em dash character `—` from the hyphen-minus used in filenames.

**Recommendation**: Decide on canonical format (em dash `—` or double hyphen `--`) and apply consistently across all three documents. ADR-023 specifies em dash, so recommend updating `architecture.md` to use `—` if renderer supports it, or document the markdown convention.

**Status**: Low priority — minor rendering consistency issue.

---

### L-05 — System-diagrams.md and pipeline-diagram.mermaid use different C1 step numbering

**Files involved**: `system-diagrams.md`, `pipeline-diagram.mermaid`

**Issue**:

`system-diagrams.md` Diagram 2 labels the web upload steps as:

- "1. Initiate"
- "2. Upload"
- "3a. Store"
- "3b. Finalize"

`pipeline-diagram.mermaid` Diagram 2 labels them as:

- "1. Initiate"
- "2. Upload"
- "3. Store"
- "4. Finalize"

ADR-007 describes a "three API calls" model with four statuses. The "3a/3b" numbering in `system-diagrams.md` suggests Store and Finalize are sub-steps of a single API call (call #3). The "3/4" numbering in `pipeline-diagram.mermaid` treats them as separate steps (calls #3 and #4).

The "3a/3b" numbering in `system-diagrams.md` is correct and aligns with ADR-007's description that step 3 has substeps.

**Recommendation**: This is resolved if `pipeline-diagram.mermaid` is deleted (per C-01 and C-02). If `pipeline-diagram.mermaid` is retained, update its step numbers to match `system-diagrams.md`.

**Status**: Low priority — will be resolved by C-01 deletion.

---

## Observations

Items in this section are positive observations or clarifications; no action required.

### O-01 — Architecture.md is well-structured for implementer lookup

The separation of Component Ownership (lines 83-106) from Data Flow (lines 187-327) is clean and avoids duplication. An implementer can easily locate any decision by following the ADR cross-references.

### O-02 — Cross-Cutting Decisions Summary table is comprehensive

The Cross-Cutting Decisions Summary table (lines 397-427) covers all 41 ADRs either directly or by grouping. This is an effective index for quick lookup.

### O-03 — Phased Build Approach clearly delineates scope

The Phased Build Approach section (lines 330-394) clearly distinguishes:

- Phase 1 deliverables (committed)
- Phase 2 additions (committed)
- Phase 3+ additions (committed)
- Candidates (noted but not decided)

The "candidate" label is used consistently, and all items can be traced to either an ADR or the architectural flags.

### O-04 — Processing section accurately reflects ADR-038 complexity

The Processing section (lines 218-275) correctly reflects the 6-step pipeline from ADR-038, including entity types, relationship types, and LLM combined pass output structure. This is the most detail-dense section and correctly mirrors the ADRs.

---

## Resolution Tracker

| ID | Summary | Type | Priority | Status |
| --- | --- | --- | --- | --- |
| C-01 | pipeline-diagram.mermaid shows outdated 7-step pipeline | Deletion or rewrite | Critical | Open |
| C-02 | pipeline-diagram.mermaid missing QueryRouter in C3 | Deletion or addition | Critical | Open |
| C-03 | system-diagrams.md Diagram 1 shows direct DB→Processor arrow | Edit | Critical | Open |
| H-01 | StorageService interface not mentioned in architecture.md | Edit | High | Open |
| H-02 | GraphStore not visual node in system-diagrams C3 | Edit | High | Open |
| H-03 | ADR-041 Phase 1 table references removed source_document_id | ADR errata or update | High | Open |
| H-04 | pipeline-diagram.mermaid and system-diagrams.md both exist | Deletion and approvals.md edit | High | Open |
| L-01 | Phase 1 list does not defer Web UI query | Documentation clarification | Low | Open |
| L-02 | ADR-006 not referenced in architecture.md | Documentation note | Low | Open |
| L-04 | Inconsistent em dash vs. double hyphen | Format consistency | Low | Open |
| L-05 | C1 step numbering differs between diagram files | Dependent on C-01 | Low | Open |

---

## Next Steps

Work through the Critical and High-Priority issues in order:

1. **C-01**: Decide whether to delete or rewrite `pipeline-diagram.mermaid`
2. **C-02**: Dependent on C-01 decision
3. **C-03**: Remove or reroute the DB→Processor arrow in `system-diagrams.md` Diagram 1
4. **H-01**: Add StorageService to architecture.md Provider Interfaces section
5. **H-02**: Add or document GraphStore in system-diagrams.md C3 diagram
6. **H-03**: Update ADR-041 Phase 1 table or add errata note
7. **H-04**: Delete `pipeline-diagram.mermaid` and update `approvals.md` (dependent on C-01 = deletion)
8. **Low-priority items**: Address as time permits
