# System Diagrams Review

**Date**: 2026-02-25
**Reviewer**: Head of Development
**Document**: `documentation/project/system-diagrams.md`
**Against**: Architecture Decisions ADR-001 through ADR-041

**Overall Status**: Requires fixes before approval. Issues categorized by severity and priority.

---

## Issues Requiring Fixes

### Critical Issues (Must fix before approval)

#### I-6: QueryRouter Interface Missing from C3 Diagram

**Severity**: Critical
**Location**: Diagram 4 (C3 - Query and Retrieval Detail)
**ADR Reference**: ADR-040, ADR-041

**Finding**: The QueryRouter interface is completely absent from the C3 query flow diagram. Per ADR-040 and ADR-041, QueryRouter is a mandatory interface that all queries pass through:

- **Phase 1**: Pass-through implementation that returns `vector` for all queries
- **Phase 2**: LLM classifier that returns `vector`, `graph`, or `both` depending on query type

Even in Phase 1, the QueryRouter interface should be visible in the diagram so that the Phase 2 enhancement is a config change, not a structural addition.

**Current diagram flow**: API → QueryEmbed → VectorStore → VectorSearch → ...

**Expected diagram flow**: API → QueryRouter → (routes based on query type) → QueryEmbed → VectorStore → VectorSearch → ...

**Action Required**:

1. Add a `QueryRouter` node/box after the API
2. Add a decision diamond or routing node showing "Phase 1: vector only" → "Phase 2: LLM classifier (graph/both)"
3. Update edges so QueryRouter is the entry point to the query processing path

**Tradeoff**: Adding QueryRouter increases diagram complexity. Consider whether Phase 1 and Phase 2 implementations should be shown on separate diagrams, or if a single diagram can accommodate both with clear Phase markers.

---

#### I-7: GraphStore Interface and Phase 2 Graph Retrieval Path Missing from C3

**Severity**: Critical
**Location**: Diagram 4 (C3 - Query and Retrieval Detail)
**ADR Reference**: ADR-037, ADR-041

**Finding**: The diagram does not show any graph retrieval or GraphStore interface. Per ADR-037 and ADR-041, in Phase 2, graph-aware retrieval is introduced as an alternative/supplement to vector search. The diagram shows some Phase 2 elements (Web UI marked as Phase 2, FileStore for source documents marked as Phase 2), but omits the graph path entirely.

**Current diagram**: Shows only vector retrieval path (VectorStore → VectorSearch)

**Expected diagram**: Should include:

- GraphStore interface (similar positioning/styling to VectorStore)
- Graph traversal via SQL + recursive CTEs
- Entity-to-document lookup via `entity_document_occurrences`
- Result merge step (when QueryRouter returns `both`)

**Action Required**:

1. Add a GraphStore interface node (Phase 2 annotation)
2. Add a graph retrieval path with traversal step and entity-document lookup
3. Add a result merge step that combines vector and graph results when QueryRouter returns `both`
4. Update routing from QueryRouter to branch into: vector-only path (Phase 1), graph-only path (Phase 2), or merged path (Phase 2)

---

### High Priority Issues (Should fix before approval)

#### I-1: C1 Diagram - Store/Finalize Confusion

**Severity**: High
**Location**: Diagram 2 (C1 - Document Intake Detail), Web UI Upload route
**ADR Reference**: ADR-007, ADR-017

**Finding**: The diagram shows four separate boxes (Initiate, Upload, Store, Finalize) with the implication that there are four API calls. However, ADR-007 defines only three API calls:

1. Initiate (creates DB record, status: initiated)
2. Upload (writes to staging, status: uploaded)
3. Finalize (moves to permanent storage, validates hash, updates to stored; then once all files are stored and metadata confirmed, updates to finalized)

The diagram splits the Finalize call into two substeps: "Store" (move + hash, status: stored) and "Finalize" (all confirmed, status: finalized). This is architecturally correct but could mislead an implementer into thinking there are four separate API calls instead of three.

**Action Required**: Clarify the relationship between Store and Finalize. Options:

- Label boxes as "3a. Store" and "3b. Finalize" to show they are substeps of the third API call
- Add a visual grouping (dashed box or annotation) around Store and Finalize indicating they are one API call
- Add a note below the diagram explaining the mapping between boxes and API calls

---

#### I-3: C2 Diagram - Transaction Write Missing `entity_document_occurrences`

**Severity**: High
**Location**: Diagram 3 (C2 - Processing Pipeline Detail), Express Transaction Write subgraph
**ADR Reference**: ADR-031 (revised), ADR-038

**Finding**: The TxWriter box lists the transaction write contents as: "Chunks + embeddings / Entities + relationships / Pipeline step status / Quality scores". However, ADR-031 (revised by ADR-038) specifies that the transaction also writes `entity_document_occurrences` rows, which record every document in which an entity appears. This is the universal source of truth for entity-document provenance.

**Current list**: Chunks, embeddings, entities, relationships, pipeline step status, quality scores

**Expected list**: Chunks, embeddings, entities, relationships, entity_document_occurrences, pipeline step status, quality scores

**Action Required**:

Add `entity_document_occurrences` to the TxWriter description. Options:

- Expand "Entities + relationships" to "Entities + relationships + entity_document_occurrences"
- Add a separate line: "Entity-document provenance: entity_document_occurrences"

---

#### I-5: C2 Diagram - LLM Combined Pass Metadata Fields Not Noted

**Severity**: High
**Location**: Diagram 3 (C2 - Processing Pipeline Detail), LLM Combined Pass box
**ADR Reference**: ADR-036, ADR-038

**Finding**: The LLM Combined Pass step returns four categories of output per ADR-038:

1. Chunk boundaries and labels
2. Metadata fields (document type, dates, people, land references, description)
3. Graph entities (type, name, confidence)
4. Graph relationships (source, target, relationship type, confidence)

The diagram only shows: "Returns: chunks + entities + relationships". It does not mention metadata fields or the fact that in Phase 1, these fields are discarded (per ADR-036) in favour of pattern-based metadata extraction results.

This omission could mislead an implementer who might not realize that:

- The LLM returns metadata in addition to chunks/entities/relationships
- This metadata is intentionally discarded in Phase 1
- Pattern-based metadata (step 3) is the single source of truth for Phase 1

**Action Required**:

Update the LLM Combined Pass box label to clarify:

- "5. LLM Combined Pass<br />ADR-025, ADR-036, ADR-038<br />Returns: chunks + entities<br />+ relationships + metadata<br />(metadata discarded Phase 1)"

---

#### I-2: C1 Diagram - Batch Move Missing Run-Level Status

**Severity**: Medium-High
**Location**: Diagram 2 (C1 - Document Intake Detail), Bulk Ingestion CLI route, BatchMove box
**ADR Reference**: ADR-018

**Finding**: The BatchMove box describes per-file status transitions ("uploaded to stored") but does not mention the run-level status transition. Per ADR-018, during the batch move phase, the run status transitions to `moving`. This is critical for the run-start cleanup sweep to identify interrupted batch moves.

**Current description**: "Batch Move<br />staging to permanent storage<br />Per-file: uploaded to stored"

**Expected description**: Should include run-level status `moving`

**Action Required**:

Add run-level status to the BatchMove box. Options:

- "Batch Move<br />staging to permanent storage<br />Run status: moving<br />Per-file: uploaded to stored"
- Add a separate annotation below the diagram explaining run-level status transitions

---

## Observations (Lower Priority)

### OB-1: System Overview - DB-to-Processor Line Potentially Misleading

**Severity**: Low
**Location**: Diagram 1 (System Overview)
**ADR Reference**: ADR-031

**Finding**: The diagram shows a dotted line `DB -.->|"Data"| Processor`. ADR-031 is explicit: "The Python processing service has no direct database connection." This line could be misread as Python having read access to the database. In reality, Python receives a document ID and file reference from Express via HTTP; the data flow comes from the API request, not from direct DB access.

**Recommendation**: Consider removing the `DB -.->|"Data"| Processor` line, or relabeling it to flow through the API node to make the dependency clear: `API -.-> Processor` and `DB -.-> API` (separate arrows to show the indirect relationship).

**Priority**: Low — the line is technically showing data flow, but the wording could be clearer.

---

### OB-2: System Overview - CLI Actor Not Shown

**Severity**: Low
**Location**: Diagram 1 (System Overview)
**ADR Reference**: General architecture

**Finding**: The diagram shows `Archivist -->|"Bulk ingest / query"| API` without explicitly showing the CLI as a separate actor. While this is architecturally correct (the CLI calls the API directly), Diagram 2 shows the CLI as a distinct box. For visual consistency across diagrams, the System Overview could optionally include CLI as a separate node.

**Priority**: Low — presentation preference, not an inconsistency.

---

### OB-3: C3 - Rerank/Context Assembly Step Not Defined in ADRs

**Severity**: Low
**Location**: Diagram 4 (C3 - Query and Retrieval Detail)

**Finding**: The diagram shows a "Chunk + Document Context Assembly" step between VectorSearch and RAG. This step is not explicitly defined in any ADR. It is implied by the retrieval flow (vector results need metadata/context before LLM synthesis) but is an implementation detail that falls between ADRs.

**Assessment**: This is not an inconsistency — it is reasonable implementation detail. No action required.

---

### OB-4: C3 - Citation Format Uses Hyphen-Minus

**Severity**: Low
**Location**: Diagram 4 (C3 - Query and Retrieval Detail), Response box
**ADR Reference**: ADR-023

**Finding**: ADR-023 specifies the archive reference format as `YYYY-MM-DD — [description]` with an em dash. The diagram shows `YYYY-MM-DD - description` with a hyphen-minus. This is likely a Mermaid rendering simplification for special characters.

**Priority**: Low — acceptable simplification for diagram readability.

---

## Cross-Diagram Interface Consistency Check

| Interface | D1 Overview | D2 C1 | D3 C2 | D4 C3 | Status |
| --- | --- | --- | --- | --- | --- |
| VectorStore (ADR-033) | Not shown | N/A | ✓ Shown | ✓ Shown | Consistent |
| GraphStore (ADR-037) | Not shown | N/A | Not shown (correct) | ✗ Missing (Issue I-7) | Gap in D4 |
| QueryRouter (ADR-040) | Not shown | N/A | N/A | ✗ Missing (Issue I-6) | Gap in D4 |

---

## Phase Placement Verification

| Capability | ADR Phase | Diagram Phase | Status |
| --- | --- | --- | --- |
| Entity extraction in C2 | Phase 1 (ADR-041) | Shown (implicitly Phase 1) | ✓ Correct |
| GraphStore interface | Phase 1 definition (ADR-041) | Not shown | ✗ Missing |
| QueryRouter interface | Phase 1 definition (ADR-041) | Not shown | ✗ Missing |
| Graph rebuild trigger | Phase 2 (ADR-039, ADR-041) | Not shown | — Phase 2 capability |
| LLM query classifier | Phase 2 (ADR-040, ADR-041) | Not shown | ✗ Missing |
| Graph-aware retrieval | Phase 2 (ADR-041) | Not shown | ✗ Missing |
| Web UI query | Phase 2 | Marked Phase 2 | ✓ Correct |
| CLI query | Phase 1 | Marked Phase 1 | ✓ Correct |

---

## Summary by Diagram

### Diagram 1: System Overview

**Status**: Mostly Consistent (minor observations)

- ✓ Three services correctly shown
- ✓ Data flows accurate
- ✓ Shared infrastructure correct
- OB-1: DB-to-Processor line could be clearer
- OB-2: CLI actor not shown (visual consistency)

---

### Diagram 2: C1 - Document Intake

**Status**: Mostly Consistent (moderate clarifications needed)

- ✓ 4-status lifecycle correct
- ✓ Bulk CLI route correct
- ✓ Cleanup sweep logic correct
- **I-1**: Store/Finalize boxes need clarification (3 API calls, not 4)
- **I-2**: BatchMove missing run-level `moving` status

---

### Diagram 3: C2 - Processing Pipeline

**Status**: Mostly Consistent (minor additions needed)

- ✓ 6-step pipeline correct
- ✓ No vocabulary candidate step (correct per ADR-038)
- ✓ Fire-and-forget pattern correct
- ✓ Step tracker correct
- **I-3**: Transaction write missing `entity_document_occurrences`
- **I-5**: LLM Combined Pass should note metadata fields (discarded Phase 1)

---

### Diagram 4: C3 - Query and Retrieval

**Status**: Incomplete (critical interfaces missing)

- ✓ Query embedding correct
- ✓ VectorStore interface shown
- ✓ Citation format correct
- ✓ Phase markers for CLI/WebUI correct
- **I-6**: QueryRouter interface missing (critical)
- **I-7**: GraphStore interface and Phase 2 graph path missing (critical)
- OB-3: Context assembly step is reasonable implementation detail
- OB-4: Citation format uses hyphen-minus (rendering simplification)

---

## Recommended Fix Priority

### Must Fix (Blocking Approval)

1. **I-6**: Add QueryRouter interface to C3 (ADR-040)
2. **I-7**: Add GraphStore interface and Phase 2 graph retrieval to C3 (ADR-037, ADR-041)

### Should Fix (Before Approval)

1. **I-1**: Clarify Store/Finalize relationship in C1 (ADR-007)
2. **I-3**: Add `entity_document_occurrences` to C2 transaction write (ADR-031)
3. **I-5**: Note metadata field discard in C2 LLM step (ADR-036, ADR-038)
4. **I-2**: Add run-level `moving` status to C1 BatchMove (ADR-018)

### Nice to Have (Can defer)

- OB-1: Clarify DB-to-Processor data flow
- OB-2: Show CLI actor for consistency
- OB-4: Consider em dash in citation format

---

## Questions for Resolution

1. **Diagram 4 Complexity**: Adding QueryRouter routing logic and GraphStore paths will increase Diagram 4 complexity significantly. Should Phase 1 and Phase 2 implementations be shown on separate diagrams, or combined with clear phase annotations?

2. **Diagram 1 - Data Flow**: Should the `DB -.->|"Data"| Processor` line be removed entirely, or relabeled to show the flow goes through the API?

3. **Diagram 2 - API Call Mapping**: Is the current 4-box representation (Initiate, Upload, Store, Finalize) helpful for understanding, or should it map 1:1 to the 3 API calls defined in ADR-007?
