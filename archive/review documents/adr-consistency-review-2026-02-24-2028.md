# Architecture Decision Record (ADR) Consistency Review

Pre-approval review of `architecture-decisions.md` (ADR-001 to ADR-041), conducted
2026-02-24 after the graph-RAG Architecture Decision Records (ADR-037 to ADR-041) and
their revision notes were written. Each item requires a resolution decision before the
ADR document is finalised.

Items are grouped by priority: **Confirmed Issues** must be resolved before approval;
**Observations** are lower-priority and may be deferred.

---

## Confirmed Issues

---

### CI-001 — ADR-031 transaction description missing `entity_document_occurrences`

**ADRs involved**: ADR-031, ADR-028, ADR-038

**The issue**:
ADR-028's revision note states: "Written by Express as part of the processing results
transaction (ADR-031)." ADR-038's revision note repeats the same claim. However, ADR-031
itself lists the processing results transaction contents as:

> chunks + embeddings + pipeline step status updates + vocabulary terms
> (source: `llm_extracted`) + vocabulary relationships + quality scores

`entity_document_occurrences` is not listed. The component write ownership table in
ADR-031 also omits this table from Express's write responsibilities.

**Resolution options**:
Add a revision note to ADR-031 appending `entity_document_occurrences` rows to the
processing results transaction description and the write ownership table. No decision
required — this is a mechanical addition consistent with the existing transaction model.

**Status**: Open

---

### CI-002 — ADR-037 `source_document_id IS NOT NULL` filter is now inaccurate

**ADRs involved**: ADR-037, ADR-028 (revision note), ADR-038 (revision note)

**The issue**:
ADR-037's "Relationship to vocabulary tables" paragraph states:

> The `GraphStore` interface operates on `vocabulary_terms` rows filtered by
> `source_document_id IS NOT NULL` (document-linked entities)

The 2026-02-24 revision notes clarified that `source_document_id` is only an Large
Language Model (LLM) extraction marker, and `entity_document_occurrences` is the
universal source of truth for entity-document links. Seeded entities have
`source_document_id IS NULL` but can accumulate `entity_document_occurrences` rows
through processing. The current filter would exclude seeded entities from the graph
even when they have document links — which contradicts the intent of seeded entities
being "known and highly important" starting points.

**Resolution options**:
A decision is required on which entities the GraphStore operates on:

- **Option A**: Filter on entities with at least one `entity_document_occurrences` row —
  includes seeded entities once they appear in documents; excludes entities that have
  never been seen in a document
- **Option B**: Filter on `source IN ('seed', 'manual', 'candidate_accepted', 'llm_extracted')`
  — includes all accepted entities regardless of document links; the full vocabulary is
  the graph
- **Option C**: Keep `source_document_id IS NOT NULL` — graph contains only
  LLM-extracted entities; seeded entities are vocabulary-only until explicitly linked

**Status**: Open — decision required

---

### CI-003 — ADR-038 Rationale paragraph superseded by revision notes

**ADRs involved**: ADR-038

**The issue**:
ADR-038's Rationale paragraph still reads:

> The `source_document_id` column distinguishes document-linked entities (graph nodes)
> from general vocabulary terms (seed/manual).

This is directly superseded by the 2026-02-24 revision note, which clarifies that
`source_document_id` is only an LLM extraction marker and `entity_document_occurrences`
is the universal document link. A reader encountering the Rationale before the revision
notes gets the wrong mental model of how entity-document provenance works.

**Resolution options**:
Add a revision note to the Rationale paragraph pointing to the 2026-02-24 clarification.
No decision required — this is a clarification addition only.

**Status**: Open

---

## Observations

None identified.

---

## Resolution Tracker

| ID | Summary | Type | Status |
| --- | --- | --- | --- |
| CI-001 | ADR-031 transaction missing `entity_document_occurrences` | Mechanical fix | Resolved |
| CI-002 | ADR-037 GraphStore filter inaccurate after provenance model change | Decision required | Resolved |
| CI-003 | ADR-038 Rationale describes superseded provenance model | Mechanical fix | Resolved |
