# V2 Enhancement Options — RAG-Anything / LightRAG

**Status**: Reference document — not approved, not scheduled. Written at end of V1 implementation
to capture reasoning while it is fresh. Revisit when V1 is in use and real document characteristics
are known.

---

## Background

During V1 implementation (April 2026) the [RAG-Anything](https://github.com/HKUDS/RAG-Anything)
library was evaluated as a potential replacement or enhancement for the Institutional Knowledge
project. The conclusion was: **not a replacement for V1, but a strong candidate for two specific
V2 enhancements**.

RAG-Anything is a Python library built on top of [LightRAG](https://github.com/HKUDS/LightRAG).
It provides end-to-end multimodal document processing — parsing, chunking, knowledge graph
construction, and hybrid graph-vector retrieval — as a single integrated system. It does not
provide document intake, curation, metadata management, audit trails, or a web interface.

---

## Why It Is Not a V1 Replacement

RAG-Anything covers the extraction-to-retrieval pipeline (parts of C2 and all of C3) but has
no equivalent for:

- Document intake, deduplication, and lifecycle management (C1)
- Structured metadata extraction and human curation (the whole VOC/curation flow)
- Vocabulary management
- The Express backend, PostgreSQL schema, and audit trail
- The Next.js frontend and curation UI

Swapping it in would mean rebuilding most of the project on top of it. The V1 architecture is
the right foundation; RAG-Anything is a component-level enhancement, not a system-level one.

---

## Two V2 Enhancement Options

These are independent — neither requires the other.

---

### Option A — Replace the C3 retrieval backend with LightRAG (graph-vector hybrid)

#### What changes

The V1 query handler ([`query/query_handler.py`](../../services/processing/query/query_handler.py))
calls Express's pgvector endpoint for vector similarity search (QUERY-001 contract). In Phase 1
this is the only retrieval strategy: `PassthroughQueryRouter` always returns `vector`, and
`_graph_search()` is stubbed to raise `NotImplementedError`.

In V2, Option A replaces that vector search call and the graph search stub with calls to a
LightRAG instance. LightRAG's hybrid retrieval combines dense vector similarity with graph
traversal across extracted entities — closer to the graph-aware retrieval described in ADR-037
and ADR-040.

#### The integration seam

The `QueryRouter` ABC ([`query/interfaces/`](../../services/processing/query/interfaces/)) and
the `_graph_search()` stub in `QueryHandler` are deliberate Phase 2 placeholders. The ADR-040
decision on `QueryRouter` was made with the explicit intent that routing logic and search backends
could be swapped independently. No V1 code needs to change to accommodate this — the router
returns a different `RouteDecision` and `_graph_search()` gets a real implementation.

#### What is preserved

Everything built in V1 is kept:

- The entire Express backend and PostgreSQL schema
- The entire frontend and curation UI
- The entire C2 pipeline (OCR, quality scoring, metadata extraction, LLM combined pass,
  embedding generation)
- Document intake, orchestration, auth, config, HTTP client layers
- Query understanding (Task 14) and response synthesis (Task 17) — these sit either side of
  the retrieval call and are unaffected

#### Key open question for V2

Whether LightRAG's pluggable storage layer points at the existing PostgreSQL instance (it
supports PostgreSQL as a graph/KV backend) or runs as a separate index that is kept in sync
as C2 processes documents. This is the main integration complexity — not the retrieval call
itself.

---

### Option B — Replace or extend the OCR/extraction step with multimodal parsing

#### The gap in V1

The V1 C2 pipeline is text-focused. Docling extracts text from PDFs; Tesseract handles scanned
fallback. Both return a text string. If a document contains embedded images, hand-drawn maps,
structured tables, or financial columns, the pipeline processes only the surrounding text — the
visual or tabular content is lost.

RAG-Anything uses MinerU (with Docling and PaddleOCR as alternatives) to extract structured
content blocks — typed as text, image, table, or equation — and routes each block type through
a specialist processor before reassembling into a unified chunk list with modality metadata.

#### Two sub-options

**B1 — New `OCRService` adapter**

The `OCRService` ABC in
[`pipeline/interfaces/ocr_service.py`](../../services/processing/pipeline/interfaces/ocr_service.py)
is the correct seam. A `RAGAnythingAdapter` (or `MinerUAdapter`) could implement `OCRService`,
call the multimodal parser internally, and return an extended `OCRResult` that carries typed
content blocks alongside the plain text string. `create_ocr_service()` gains a new branch;
the rest of the pipeline is unaffected unless downstream steps are extended to consume the
extra structure.

**B2 — Copy the pattern natively**

Implement the multimodal routing pattern within the existing `pipeline/steps/` structure —
additional step types alongside `ocr_extraction.py` — without taking RAG-Anything as a
dependency. This gives full control and keeps the dependency surface small.

#### Whether this matters depends on the documents

This decision should be made with real V1 documents in hand. If the archive is mostly typed
or handwritten correspondence, letters, and contracts, the V1 text-focused pipeline is
sufficient. If a significant portion are tabular records (livestock counts, field boundary
tables, financial ledgers), maps, or mixed-layout documents, the multimodal gap will show up
in retrieval quality.

#### Caveat

RAG-Anything's own research paper notes that its cross-modal retrieval still has a text-centric
bias — retrieved results preferentially favour text over visual content even when a visual
element is more relevant. The multimodal machinery is real but imperfect.

---

## Recommended V2 Sequencing

1. **Run V1 with real documents first.** Retrieval quality and document characteristics in
   practice are the inputs to this decision — not assumptions made during design.

2. **Evaluate Option A first.** It touches fewer moving parts (one integration seam in
   `query_handler.py`) and directly addresses the graph-aware retrieval that was deferred
   from Phase 1 by ADR-040.

3. **Evaluate Option B separately**, informed by which document types in the real archive
   are underserved by the V1 text pipeline.

4. **Options A and B are independent.** Either can be adopted without the other.

---

## Relevant Architecture References

| Reference | Relevance |
| --- | --- |
| [ADR-037](../decisions/architecture-decisions.md) | Graph storage behind `GraphStore` interface — the V1 foundation Option A builds on |
| [ADR-040](../decisions/architecture-decisions.md) | `QueryRouter` ABC — the explicit Phase 2 extension point for Option A |
| [ADR-042](../decisions/architecture-decisions.md) | `pipeline/` vs `query/` module boundary — governs where new code lives |
| [ADR-011](../decisions/architecture-decisions.md) | Docling (primary) / Tesseract (fallback) OCR decision — the V1 baseline Option B extends |
| [ADR-024](../decisions/architecture-decisions.md) | Interface-driven embeddings — same pattern applies to any new retrieval backend |
| [python-tasks.md Task 13](../tasks/python-tasks.md) | `QueryRouter` ABC and `PassthroughQueryRouter` — the Phase 2 stub |
| [python-tasks.md Task 19](../tasks/python-tasks.md) | `QueryHandler` — contains `_graph_search()` stub and the vector search call |
| [pipeline/interfaces/ocr_service.py](../../services/processing/pipeline/interfaces/) | The OCR seam for Option B |
