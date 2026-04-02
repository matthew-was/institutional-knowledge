# Senior Developer Plan — Python Processing Service

## Status

Approved — 2026-03-03

## Scope summary

This plan covers the complete Phase 1 implementation of `services/processing/` — the Python
processing service that hosts both the C2 document pipeline and the C3 query module within a
single Docker container (ADR-042).

The plan covers:

- **C2 — Processing Pipeline**: all six pipeline steps (OCR extraction, text quality scoring,
  pattern metadata extraction, completeness scoring, LLM combined pass, embedding generation),
  pipeline orchestration, step status tracking, and flag generation
- **C3 — Query and Retrieval**: QueryRouter interface and pass-through implementation, query
  understanding, vector search via Express callback, context assembly, response synthesis, and
  the FastAPI endpoint that serves query requests
- **Shared utilities**: EmbeddingService interface, HTTP client for Express calls, config
  loading, and auth middleware
- **Testing**: interface-driven unit tests and integration tests against fixture documents
  (ADR-032)

**ADR-042 module boundary confirmation**: The plan enforces strict separation throughout.
`processing/pipeline/` and `processing/query/` have no imports between them. All shared code
lives in `processing/shared/`. Any coupling risk is called out explicitly. This boundary
exists to allow future splitting into separate Docker deployments without code restructuring.

**Integration Lead contracts status**: All HTTP calls to Express have been reviewed and
approved by the Integration Lead. See `documentation/tasks/integration-lead-contracts.md`
(Approved 2026-03-03) for full contract definitions. Contract references: PROC-002, PROC-003,
QUERY-001, QUERY-002.

---

## Module structure

```text
services/processing/
  pipeline/                     # C2 — text extraction, processing, embedding (ADR-042)
    steps/                      # One file per pipeline step (steps 1–6)
    interfaces/                 # Abstract base classes for each step's service
    adapters/                   # Concrete implementations (Docling, Tesseract, Ollama)
    factories/                  # Factory functions reading provider from config
    orchestrator.py             # Sequences all six steps; single entry point for C2

  query/                        # C3 — query and retrieval (ADR-042)
    interfaces/                 # QueryRouter abstract base class (ADR-040)
    implementations/            # Phase 1: PassthroughQueryRouter
    router_factory.py           # Creates QueryRouter from config
    query_understanding.py      # LLM call for intent + refined terms
    context_assembly.py         # Token budget assembly of retrieved chunks
    response_synthesis.py       # LLM call producing cited response
    query_handler.py            # Orchestrates the full C3 query pipeline

  shared/                       # Utilities shared by pipeline/ and query/ (ADR-042)
    interfaces/                 # EmbeddingService and LLMService abstract base classes
    adapters/                   # Ollama and API-based concrete implementations
    factories/                  # Embedding and LLM factory functions
    http_client.py              # HTTP client for all Express callback calls (auth header)
    config.py                   # Dynaconf + Pydantic config loading singleton

  app.py                        # FastAPI application: routes, health endpoint, auth middleware
  fixtures/                     # Representative documents for integration testing (ADR-032)
  tests/                        # pipeline/, query/, shared/ subdirectories; test_app.py
  settings.json
  requirements.txt
  Dockerfile
  pytest.ini
```

**ADR-042 boundary enforcement**: No file under `pipeline/` may import from `query/`, and no
file under `query/` may import from `pipeline/`. Both may import from `shared/`. The `app.py`
file at the root wires up both modules but does not itself contain pipeline or query logic.
This structure must be enforced by Code Review; any cross-module import is a blocking finding.

---

## C2 — Processing Pipeline

### Step 1: OCR text extraction

**Interface**

`OCRService` is a Python abstract base class in `pipeline/interfaces/ocr_service.py`. The
interface has two abstract methods:

- `extract_text(file_path: str) -> OCRResult` — extracts text from a document; returns an
  `OCRResult` dataclass containing `text_per_page: list[str]`,
  `confidence_per_page: list[float]`, `extraction_method: str`, and
  `page_count: int`
- `supports_file_type(file_extension: str) -> bool` — returns True if this engine handles
  the given extension

A concrete `ExtractionResult` dataclass is produced by the orchestration layer (not the
interface itself) and contains:

- `text_per_page: list[str]`
- `confidence_per_page: list[float]`
- `extraction_method: str`
- `page_count: int`
- `document_flags: list[DocumentFlag]` — populated for the three catastrophic cases
- `step_status: Literal['completed', 'failed']`
- `error_message: str | None`

**Phase 1 implementation**

Two concrete adapters:

- `DoclingAdapter` (`pipeline/adapters/docling_ocr.py`) — calls the Docling Python library
  directly (installed via pip); handles PDF and image types; preserves document structure
  (headings, paragraphs, signatures) per ADR-011; returns per-page text and confidence scores
- `TesseractAdapter` (`pipeline/adapters/tesseract_ocr.py`) — calls pytesseract; handles
  TIFF, JPEG, PNG; fallback when Docling is unavailable or fails per ADR-011

The factory function `create_ocr_service()` in `pipeline/factories/ocr_factory.py` reads
`ocr.provider` from config and returns the appropriate adapter. Config value `"docling"` or
`"tesseract"`.

The extraction step in `pipeline/steps/ocr_extraction.py` opens the document, iterates all
pages (no fail-fast — all pages are evaluated per UR-045), and handles three catastrophic
failure modes before moving to quality scoring:

1. Zero-page document (UR-050): flag with type `"extraction_failure"`, reason
   `"Document opened but contains zero pages"`; return step status `completed`; do not continue
   to step 2
2. All pages yield no text (UR-048): flag with type `"extraction_failure"`, reason
   `"No extractable text from any page"`; return step status `completed`; do not continue
3. Some pages yield text, others do not (UR-049): flag with type `"partial_extraction"`,
   reason naming the pages with no text; no embeddings are generated; return step status
   `completed`; do not continue

For individual page extraction failures (non-catastrophic), the page exception is caught and
logged; the page is treated as yielding empty text with confidence 0.0; processing continues
to the next page.

If the file cannot be opened at all, return step status `failed` with an error message and
`retry_on_next_trigger: True` — Express will increment the attempt count and retry on the
next processing run (UR-068, UR-069).

**Step status recording**

Express owns all step status writes (ADR-031). Python returns the `step_status` value
(`"completed"` or `"failed"`) in its response for this step. Express reads this and writes:

```text
pipeline_steps row: (document_id, step_name='text_extraction', status, started_at,
completed_at, error_message, attempt_count)
```

Express marks the step as `running` before forwarding to Python (ADR-027). On receiving the
Python response, Express updates to `completed` or `failed` within the processing results
transaction.

**Failure handling**

- File open failure: step status `failed`; Express retries up to the configurable limit
- Page iteration failure: individual page exception is swallowed (logged); processing
  continues; if all pages end up empty the catastrophic case 2 above applies
- Catastrophic cases (zero pages, all empty, partial): step status `completed`; document
  flagged; pipeline halts for this document; flag is written by Express in the same
  transaction

---

### Step 2: Text quality scoring

**Interface**

`TextQualityScorer` is a Python abstract base class in
`pipeline/interfaces/text_quality_scorer.py`. The interface has one abstract method:

- `score(text_per_page: list[str], confidence_per_page: list[float]) -> QualityResult`

`QualityResult` dataclass contains:

- `per_page_scores: list[float]` — score per page (0–100)
- `document_score: float` — overall score (0–100)
- `passed_threshold: bool`
- `failing_pages: list[int]` — 1-indexed page numbers that fell below the threshold

**Phase 1 implementation**

`WeightedTextQualityScorer` (default implementation, not behind a separate factory — it is
the only implementation in Phase 1). The scoring formula is a weighted combination of OCR
confidence (converted to 0–100) and text density (characters per page scaled to 0–100). All
weights and the quality threshold are read from config keys:

- `ocr.qualityScoring.confidenceWeight` (float, default 0.6)
- `ocr.qualityScoring.densityWeight` (float, default 0.4)
- `ocr.qualityThreshold` (float, default 60.0)

The document score is the average of per-page scores. A page fails if its score falls below
the threshold.

**No-fail-fast rule (UR-045, US-031)**: All pages are scored regardless of the outcome of any
preceding page. The scorer does not stop early on a failing page.

**Threshold handling (UR-046, UR-051, US-032, US-036)**: If any page score falls below the
threshold, the document is flagged. The flag reason must list every failing page by number
(1-indexed). Including scores per page is an implementer decision at implementation time.

**Step status recording**: The quality scoring step does not have its own row in
`pipeline_steps` in Phase 1 — it runs within the same invocation as step 1 and its outcome
is encoded in the flags returned. The `text_extraction` and `text_quality_scoring` step
statuses are both returned from the same Python call. Express writes both rows.

**Note for Integration Lead**: The exact structure of the per-step status in the HTTP
response body needs to be agreed. The plan assumes each step name maps to a status object in
the response payload.

**Failure handling**

- Quality threshold failure: step status `completed`; document flagged; pipeline halts for
  this document (steps 3–6 do not run); flag type `"quality_threshold_failure"` (US-032)
- When both text quality and metadata completeness fail on the same document, a single flag
  with multiple reasons is raised (US-039); this is assembled at the point where both scoring
  results are available (after step 4)

---

### Step 3: Pattern metadata extraction

**Interface**

`PatternMetadataExtractor` is a Python abstract base class in
`pipeline/interfaces/metadata_extractor.py`. The interface has one abstract method:

- `extract(text: str, document_type_hint: str | None) -> MetadataResult`

`MetadataResult` dataclass contains:

- `document_type: str | None`
- `dates: list[str]` — detected date strings
- `people: list[str]` — detected person names
- `organisations: list[str]` — detected organisation names
- `land_references: list[str]` — detected land parcel or field references
- `description: str | None` — auto-detected description (overwrites intake description if
  present; intake description is preserved if detection yields nothing — US-037, UR-053)
- `detection_confidence: dict[str, float]` — per-field confidence (used by completeness
  scoring in step 4)

**Phase 1 implementation**

`RegexPatternExtractor` — a concrete implementation using configurable regex patterns per
field. Pattern sets are loaded from config as lists of regex strings per field:

- `metadata.patterns.documentType` — list of patterns with named capture groups
- `metadata.patterns.dates` — date pattern list
- `metadata.patterns.people` — person name pattern list
- `metadata.patterns.organisations` — organisation name pattern list
- `metadata.patterns.landReferences` — land reference pattern list
- `metadata.patterns.description` — description pattern list

This satisfies ADR-012 (pattern-based, no LLM dependency for category detection in Phase 1).
Pattern sets are configurable without code changes. Initial patterns are an implementer
decision, expected to be tuned as real documents are processed.

Archive reference derivation (ADR-023) is **not** performed in Python. The derivation
function (`YYYY-MM-DD — [description]` or `[undated] — [description]`) lives in
`packages/shared/` as a TypeScript utility function and is called at display time. Python
returns the detected date and description fields; Express stores them; the frontend derives
the archive reference at display time. Python does not generate the archive reference.

**Step status recording**: Express marks `pattern_metadata_extraction` as `completed` or
`failed` based on the Python response for this step.

**Failure handling**: A technical failure in pattern extraction (exception in regex engine)
returns step status `failed` for retry. Partial detection (some fields found, others not) is
not a failure — it is normal and scored in step 4. No flag is raised by step 3 alone.

---

### Step 4: Completeness scoring

**Interface**

`MetadataCompletenessScorer` is a Python abstract base class in
`pipeline/interfaces/completeness_scorer.py`. The interface has one abstract method:

- `score(metadata_result: MetadataResult) -> CompletenessResult`

`CompletenessResult` dataclass contains:

- `score: float` — completeness score (0–100)
- `passed_threshold: bool`
- `detected_fields: list[str]` — field names that were detected
- `missing_fields: list[str]` — field names that were not detected

**Phase 1 implementation**

`WeightedFieldPresenceScorer` — scores by (sum of detected field weights / total possible
weight) * 100. Field weights are configurable in the runtime config:

- `metadata.completenessWeights.documentType` (float)
- `metadata.completenessWeights.dates` (float)
- `metadata.completenessWeights.people` (float)
- `metadata.completenessWeights.organisations` (float)
- `metadata.completenessWeights.landReferences` (float)
- `metadata.completenessWeights.description` (float)
- `metadata.completenessThreshold` (float, default 50.0)

Initial weights are an implementer decision, to be tuned against real documents. This
satisfies ADR-021.

**Independence from text quality (UR-054, US-038)**: The completeness scorer runs
independently of the quality scorer. A document can fail metadata completeness while passing
text quality or vice versa. The two assessments share no code paths.

**Combined flag rule (US-039, UR-055)**: The orchestrator combines text quality and
completeness failures into a single flag with multiple reasons if both fail. The orchestrator
(not the scorer) is responsible for this aggregation.

**Step status recording**: Express marks `metadata_completeness_scoring` as `completed` or
`failed` based on the Python response.

**Failure handling**: A technical failure returns step status `failed` for retry. A
completeness threshold failure returns step status `completed` with a flag in the response.

---

### Step 5: LLM combined pass

**Interface**

`LLMService` is a Python abstract base class in `shared/interfaces/llm_service.py` (see
ADR-042 boundary note below — `LLMService` lives in `shared/` so both `pipeline/` and
`query/` can import it without coupling). The interface has one abstract method:

- `combined_pass(text: str, document_type: str | None) -> LLMCombinedResult`

`LLMCombinedResult` dataclass contains:

- `chunks: list[ChunkResult]` — each with `text: str`, `chunk_index: int`,
  `token_count: int`
- `metadata_fields: dict` — metadata returned by the LLM (document type, dates, people,
  land references, description); **discarded in Phase 1** per ADR-036; stored as a field in
  the response for Phase 2 use without requiring a prompt change
- `entities: list[EntityResult]` — each with `name: str`, `type: str`,
  `confidence: float`, `normalised_name: str`
- `relationships: list[RelationshipResult]` — each with `source_entity_name: str`,
  `target_entity_name: str`, `relationship_type: str`, `confidence: float`

`ChunkResult`, `EntityResult`, and `RelationshipResult` are dataclasses in
`shared/interfaces/llm_service.py`.

**Phase 1 implementation**

`OllamaLLMAdapter` (`shared/adapters/ollama_llm.py`) — calls the local Ollama HTTP API.
Config keys:

- `llm.provider` — `"ollama"` for Phase 1
- `llm.baseUrl` — Ollama server URL (e.g. `http://localhost:11434`)
- `llm.model` — model name (implementer decision; not specified at architecture level)
- `llm.chunkingMinTokens` — minimum tokens per chunk (default 100 per embedding-chunking
  skill)
- `llm.chunkingMaxTokens` — maximum tokens per chunk (default 1000)

The factory function `create_llm_service()` in `shared/factories/llm_factory.py` reads
`llm.provider` and returns the appropriate adapter.

**LLM prompt design**

The prompt instructs the LLM to:

1. Identify semantically meaningful chunk boundaries; minimum and maximum token counts are
   applied as post-processing constraints (merge below minimum, split above maximum on
   paragraph then sentence boundaries)
2. For each chunk, extract entities by type (People, Organisation, Organisation Role, Land
   Parcel / Field, Date / Event, Legal Reference — ADR-038)
3. For each chunk, identify relationships between extracted entities (owned_by, transferred_to,
   witnessed_by, adjacent_to, employed_by, referenced_in, performed_by, succeeded_by —
   ADR-038)
4. Return the full document metadata fields (document type, dates, people, land references,
   description) — these are returned in the response but discarded at processing time in
   Phase 1 (ADR-036); the prompt is designed to return them so Phase 2 can use them without
   a prompt change

The prompt requests structured JSON output. The response is parsed and validated with Pydantic
before being used. Parse failures are treated as technical step failures and retried.

**LLM response validation**: The raw LLM output is parsed into `LLMCombinedResult` using
Pydantic validation. If parsing fails (malformed JSON, missing required fields), the step
returns status `failed` for retry. This handles LLM non-determinism gracefully.

**Post-processing**: After parsing, the orchestrator applies:

- Merge chunks below `llm.chunkingMinTokens` with adjacent chunks
- Split chunks above `llm.chunkingMaxTokens` on paragraph then sentence boundaries
- Assign final sequential `chunk_index` values (0-indexed)

**Entity deduplication**: The Python service does not deduplicate entities against the
existing vocabulary. Python returns all extracted entities with their `normalised_name`. Express
performs deduplication against `vocabulary_terms.normalised_term` (case-insensitive,
punctuation-stripped) within the transaction write (US-065, UR-093). Python returns the raw
extraction; Express decides what to insert.

**Step status recording**: Express marks `llm_combined_pass` as `completed` or `failed`
based on the Python response.

**Failure handling**: LLM unavailability or response parse failure returns step status
`failed`; Express retries up to the configurable limit. There is no heuristic fallback
chunking (ADR-025).

---

### Step 6: Embedding generation

**Interface**

`EmbeddingService` is a Python abstract base class in
`shared/interfaces/embedding_service.py`. It lives in `shared/` because it is used by both
C2 (embedding document chunks) and C3 (embedding query text).

The interface has one abstract method:

- `embed(text: str) -> EmbeddingResult`

`EmbeddingResult` dataclass contains:

- `embedding: list[float]` — float vector of dimension N
- `dimension: int` — length of the vector (must match config key `embedding.dimension`)
- `model: str` — which model was used

**Phase 1 implementation**

`OllamaEmbeddingAdapter` (`shared/adapters/ollama_embedding.py`) — calls the local Ollama
embeddings API. Config keys:

- `embedding.provider` — `"ollama"` for Phase 1
- `embedding.baseUrl` — Ollama server URL
- `embedding.model` — embedding model name (implementer decision; ADR-024 defers model
  selection to implementation time; candidates include e5-small, BGE-M3)
- `embedding.dimension` — integer; must match the selected model's output dimension; used
  to validate each embedding returned before including it in the response

The factory function `create_embedding_service()` in `shared/factories/embedding_factory.py`
reads `embedding.provider` and returns the appropriate adapter.

**Generation workflow**: The pipeline step in `pipeline/steps/embedding_generation.py`
iterates all chunks returned by step 5, calls `embedding_service.embed(chunk.text)` for
each, and validates that the returned dimension matches `embedding.dimension`. All embeddings
are collected into a list. The step does not write to any store — it returns embeddings to
the orchestrator which includes them in the HTTP response to Express.

**One embedding per chunk**: Each chunk text produces exactly one embedding vector. The
`chunk_index` from step 5 is preserved as the ordering key.

**Step status recording**: Express marks `embedding_generation` as `completed` or `failed`
based on the Python response. A document is invisible to search until this step completes
successfully (ADR-027, UR-065).

**Failure handling**: If any individual chunk embedding fails (provider unavailable,
dimension mismatch), the entire step returns `failed` for retry. Partial embeddings are not
written — the document remains out of the search index until all chunks are embedded (UR-065,
UR-066).

**EmbeddingService location (ADR-042 boundary note)**: `EmbeddingService` lives in
`shared/` and is used by both `pipeline/steps/embedding_generation.py` (step 6) and
`query/query_understanding.py` (query embedding in C3). This is the intended sharing pattern
per ADR-042. There is no import from `pipeline/` to `query/` or vice versa — both import
`EmbeddingService` from `shared/`. This is safe.

---

### Pipeline orchestration

**Orchestrator** (`pipeline/orchestrator.py`)

The `PipelineOrchestrator` class is the only entry point into the C2 pipeline. It is invoked
by the FastAPI route handler when Express sends a processing request. The orchestrator:

1. Receives a `ProcessingRequest` object containing `document_id: str`, `file_path: str`,
   and `incomplete_steps: list[str]` (the step names that Express has determined are
   incomplete and need to run)
2. Checks `incomplete_steps` to determine where to start — this is the re-entrancy mechanism
   (ADR-027); if `text_extraction` is not in `incomplete_steps`, step 1 is skipped along
   with all its outputs (Express supplies the previously extracted text in the request for
   downstream steps to use)
3. Sequences the six steps, passing outputs from each step to the next
4. Collects flags from all steps that ran
5. Applies the combined-flag rule: if both text quality and completeness thresholds fail,
   a single flag with both reasons is raised (US-039)
6. Returns a `ProcessingResponse` object containing all step results, flags, and step
   statuses

**Re-entrancy mechanism (ADR-027)**

When Express triggers processing, it determines which steps are incomplete by consulting the
`pipeline_steps` table. Express sends the step names that need to run (`incomplete_steps`)
plus any previously collected outputs needed as inputs for the starting step (e.g. if step 3
is the first incomplete step, Express sends the extracted text from step 1 so the orchestrator
can run steps 3–6 without re-running steps 1–2).

**Stale running steps**: Express handles stale running steps. Before calling Python, Express
resets any `running` steps older than `pipeline.runningStepTimeoutMinutes` to `failed` and
includes them in `incomplete_steps`. Python is not responsible for detecting stale steps.

**Processing scope**: When a processing run is triggered, Express decides which documents
to process and calls Python once per document. Python processes one document at a time — it
is stateless. Python does not query for pending documents; Express does.

**Flag gate**: If steps 1 or 2 produce a document flag, the orchestrator returns immediately
and does not run steps 3–6. The same applies to catastrophic extraction cases. The document
remains out of the search index until the flag is cleared and processing resumes.

**Processing trigger (ADR-026)**: The processing trigger is Express calling Python via
internal HTTP. Python does not poll or initiate work. The trigger fires on the Express
endpoint and Express forwards to Python. Python's role is purely reactive.

**HTTP calls to Express (from orchestrator)**

After all steps complete, the orchestrator calls Express once via HTTP POST with all results.
This single call covers: chunk data, embeddings, entities, relationships, metadata field
updates, step statuses, and flags. Express writes everything atomically in a single
transaction (ADR-031).

---

### HTTP calls to Express required (C2)

The following Express endpoints are called from the C2 pipeline. All contracts have been
reviewed and approved by the Integration Lead. See
`documentation/tasks/integration-lead-contracts.md` for full TypeScript interface definitions.

**C2-E1: Express calls Python to process a document (contract PROC-003)**

- **Direction**: Express → Python (Express initiates the call to Python's `POST /process`
  endpoint)
- **Pattern**: Express sends the document's filesystem path as `fileReference` in the JSON
  request body. Python reads the file directly from the shared Docker Compose volume mount.
  No binary file content is transferred over HTTP.
- **Contract**: PROC-003 (`POST /process` on the Python FastAPI server). Express sends a
  `ProcessDocumentRequest` containing `documentId`, `fileReference` (filesystem path in
  Phase 1), `incompleteSteps` (step names to run), and `previousOutputs` (data from
  previously completed steps for re-entrancy). The response body matches the
  `ProcessingResultsRequest` schema defined in PROC-002.
- **Auth**: `x-internal-key` header with `auth.pythonServiceKey` from Express config
  (ADR-044)
- **Status**: Approved — see PROC-003 in
  `documentation/tasks/integration-lead-contracts.md`

**C2-E2: POST processing results (contract PROC-002)**

- **Caller**: Python `pipeline/orchestrator.py` via `shared/http_client.py`
- **Direction**: Python → Express
- **Purpose**: After all six steps complete (or the pipeline halts at an earlier step due to
  a flag), Python POSTs all results to Express in a single call. Express writes everything
  atomically in one transaction (ADR-031).
- **Contract**: PROC-002 (`POST /api/processing/results`). Request body is
  `ProcessingResultsRequest` containing `documentId`, `stepResults` (record of step name to
  status), `flags`, `metadata`, `chunks` (with embeddings), `entities`, and `relationships`.
  Response is `ProcessingResultsResponse` with `documentId` and `status`.
- **Auth**: `x-internal-key` header with `auth.expressKey` from Python config (ADR-044)
- **Status**: Approved — see PROC-002 in
  `documentation/tasks/integration-lead-contracts.md`

Indicative request body:

```json
{
  "document_id": "<uuid>",
  "step_results": {
    "text_extraction": { "status": "completed", "error_message": null },
    "text_quality_scoring": { "status": "completed", "error_message": null },
    "pattern_metadata_extraction": { "status": "completed", "error_message": null },
    "metadata_completeness_scoring": { "status": "completed", "error_message": null },
    "llm_combined_pass": { "status": "completed", "error_message": null },
    "embedding_generation": { "status": "completed", "error_message": null }
  },
  "flags": [
    { "type": "quality_threshold_failure", "reason": "Pages 3, 7 below threshold" }
  ],
  "metadata": {
    "document_type": "deed",
    "dates": ["1967-03-15"],
    "people": ["John Smith"],
    "organisations": [],
    "land_references": ["East Meadow"],
    "description": "Transfer of East Meadow to John Smith"
  },
  "chunks": [
    {
      "chunk_index": 0,
      "text": "...",
      "token_count": 250,
      "embedding": [0.1234, -0.5678]
    }
  ],
  "entities": [
    { "name": "John Smith", "type": "People", "confidence": 0.95,
      "normalised_name": "john smith" }
  ],
  "relationships": [
    { "source_entity_name": "John Smith", "target_entity_name": "East Meadow",
      "relationship_type": "owned_by", "confidence": 0.88 }
  ]
}
```

Expected response: `200 OK` with `ProcessingResultsResponse`; `400` on validation failure;
`401` on invalid auth; `500` on write failure.

---

## C3 — Query and Retrieval

### QueryRouter

**Interface**

`QueryRouter` is a Python abstract base class in `query/interfaces/query_router.py` (ADR-040,
ADR-042).

The interface has one abstract method:

- `route(query_text: str) -> RouteDecision`

`RouteDecision` dataclass contains:

- `strategy: Literal['vector', 'graph', 'both']`
- `extracted_entities: list[str]` — entity names identified in the query (used by graph
  retrieval in Phase 2; empty in Phase 1)
- `reasoning: str | None` — LLM classifier reasoning (Phase 2 only; None in Phase 1)

**Phase 1 implementation**

`PassthroughQueryRouter` in `query/implementations/passthrough_router.py`:

- `route(query_text: str) -> RouteDecision` — ignores the input and always returns
  `RouteDecision(strategy='vector', extracted_entities=[], reasoning=None)`

Config key: `query.router` — `"passthrough"` for Phase 1. The factory function
`create_query_router()` in `query/router_factory.py` reads this key and returns the
appropriate implementation.

**Phase 2 extension point**: Phase 2 introduces an `LLMQueryRouter` implementation that
classifies the query using an LLM call and returns `vector`, `graph`, or `both`. The
`QueryRouter` interface and factory are designed to accept this without any changes to call
sites in `query/query_handler.py`. The factory adds one new case to its switch; all other
code is unchanged.

**ADR-042 boundary note**: `QueryRouter` lives in `query/` and is used only by
`query/query_handler.py`. It has no connection to `pipeline/`. This is correct — the routing
decision is a query-phase concern, not a pipeline concern.

---

### Query understanding

**Purpose and scope**

A single LLM call that analyses the user's query and returns structured output to guide
retrieval. This is the first step in the C3 query pipeline (Phase 1).

**LLM call contract**

Implemented in `query/query_understanding.py`. Uses the `LLMService` interface from
`shared/interfaces/llm_service.py`. Both `pipeline/` and `query/` import `LLMService` from
`shared/` — this is the ADR-042-compliant pattern (see Shared utilities section for
explanation).

The LLM call uses a separate query-understanding prompt (distinct from the pipeline combined
pass prompt). Config keys:

- `query.llm.provider` — may be the same as `llm.provider` or different; allows independent
  optimisation of query LLM vs pipeline LLM
- `query.llm.baseUrl`, `query.llm.model` — provider-specific

**QueryUnderstandingResult** dataclass contains:

- `intent: str` — intent category (e.g. `"find_content"`, `"find_relationships"`,
  `"timeline_search"`)
- `refined_search_terms: str` — a cleaned or expanded version of the query for embedding
- `extracted_entities: list[dict]` — entity names and types identified in the query
- `routing_hint: str | None` — preliminary routing suggestion (`"vector"`, `"graph"`,
  `"both"`); used by Phase 2 `LLMQueryRouter`; ignored in Phase 1
- `confidence: float` — LLM's confidence in the analysis

The result is validated with Pydantic. JSON parse failures use a safe fallback: return the
original query as `refined_search_terms` and `intent = "unknown"`.

**Failure handling**: If the LLM call fails (service unavailable), the query pipeline returns
an error response to the caller (Next.js or CLI). There is no flag mechanism for query
failures — the query path is synchronous and the caller receives the error directly.

---

### Vector search

**Purpose**

Python calls Express to perform the pgvector similarity search. Express owns the VectorStore
interface (ADR-033); Python does not query pgvector directly.

**Implementation**

In `query/query_handler.py`, after `QueryUnderstanding` returns:

1. Embed the `refined_search_terms` using `EmbeddingService` (from `shared/`) — same model
   and same vector space as document chunk embeddings, so similarity comparisons are valid
2. Call Express via HTTP POST (see C3-E1 below) with the query embedding and `top_k` parameter
3. Receive a list of matching chunks with similarity scores and chunk metadata

**Parameters**:

- `top_k` — configurable; `query.vectorSearch.topK` (default 20 per rag-implementation
  skill)
- No similarity threshold in Phase 1 — all top-K results are returned regardless of score

**Failure handling**: HTTP failure calling Express returns an error response to the caller.

---

### Context assembly

**Purpose**

Gather retrieved chunks into a context payload within a token budget, ordered by similarity
score descending.

**Implementation**

In `query/context_assembly.py`:

- Accepts the list of `SearchResult` objects from the vector search step
- Iterates in similarity score order (highest first)
- Estimates tokens per chunk (simple: `len(chunk.text) // 4`, or actual tokenizer if
  available)
- Accumulates chunks until the token budget is reached or all chunks are included
- Returns an `AssembledContext` dataclass containing:
  - `chunks: list[SearchResult]` — the selected chunks in order
  - `total_tokens: int` — estimated token count
  - `truncated: bool` — True if the budget caused some chunks to be excluded

**Config keys**:

- `query.contextAssembly.tokenBudget` — integer (default 4000 tokens)
- `query.contextAssembly.includeParentMetadata` — bool; if True, include document-level
  metadata (description, date, archive reference hint) alongside chunk text in context

**No reranking in Phase 1**: Chunks are used in similarity score order without reranking,
deduplication, or graph enrichment. Phase 2 will add graph entity context for `graph` and
`both` routes.

**Failure handling**: Context assembly is a pure function (no external calls). A failure here
propagates as an error response to the caller.

---

### Response synthesis

**Purpose**

A second LLM call generates a natural language response grounded in the assembled context,
with citations referencing specific chunks.

**Implementation**

In `query/response_synthesis.py`:

- Accepts `AssembledContext` and the original query text
- Formats chunks with citation markers (`[Citation 1]`, `[Citation 2]`, etc.)
- Sends a system prompt instructing the LLM to:
  - Answer using only the provided context (no general knowledge or inference beyond document
    content — US-069, UR-101)
  - Not give legal advice or legal interpretation (UR-100)
  - State explicitly if no relevant documents exist (UR-099)
  - Cite using the provided markers
- Extracts which citation markers appear in the response and maps them back to chunks
- Returns a `SynthesisResult` dataclass containing:
  - `response_text: str` — the synthesised response
  - `citations: list[CitationResult]` — each with `chunk_id`, `document_description`,
    `document_date`, `archive_reference_hint` (date + description fields for the client to
    derive the archive reference; the derivation function lives in `packages/shared/`
    TypeScript, not in Python — ADR-023)

**Citation fields (UR-098, US-069)**: Each citation must include document description, date,
and human-readable archive reference. Python returns the raw date and description fields.
The CLI formats the archive reference using the derivation rule; the Next.js frontend
derives it using the `packages/shared/` TypeScript function. Python does not compute the
archive reference string.

**Config keys**:

- `query.synthesis.llm.provider`, `query.synthesis.llm.baseUrl`, `query.synthesis.llm.model`
  — may be the same as query understanding LLM or different
- `query.synthesis.citationFields` — list of metadata fields to include in citations
  (default: `["description", "date"]`)

**Failure handling**: LLM synthesis failure returns an error response to the caller. There is
no fallback synthesis.

---

### FastAPI endpoint

**Purpose**

Python exposes a FastAPI HTTP server that receives query requests from Next.js (web UI path)
and the CLI (ADR-042, ADR-044, ADR-045).

**Endpoints**:

- `POST /query` — accepts a JSON body with `query_text: str`; runs the full C3 pipeline;
  returns `SynthesisResult` as JSON
- `POST /process` — accepts a `ProcessingRequest`; runs the C2 pipeline for one document;
  returns `ProcessingResponse` as JSON
- `GET /health` — returns `{"status": "ok"}`

**Auth middleware**: Every route validates the `x-internal-key` header against the configured
shared key (ADR-044). Requests without a valid key receive `401 Unauthorized`. The key is
read from config key `auth.inboundKey`.

**FastAPI** is the web framework (confirmed technology constraint). The app is created in
`app.py` and wired to both the pipeline orchestrator and the query handler at startup. All
service instances (OCRService, LLMService, EmbeddingService, QueryRouter) are created once
at startup and injected into route handlers via FastAPI dependency injection.

---

### HTTP calls to Express required (C3)

All contracts have been reviewed and approved by the Integration Lead. See
`documentation/tasks/integration-lead-contracts.md` for full TypeScript interface definitions.

**C3-E1: Vector search callback (contract QUERY-001)**

- **Caller**: Python `query/query_handler.py` via `shared/http_client.py`
- **Direction**: Python → Express
- **Purpose**: Python sends a query embedding to Express; Express performs the pgvector
  similarity search via the `VectorStore` interface and returns matching chunks
- **Contract**: QUERY-001 (`POST /api/search/vector`). Request body is `VectorSearchRequest`
  containing `embedding` (float array) and `topK` (max results). Response is
  `VectorSearchResponse` containing `results` array, where each result includes `chunkId`,
  `documentId`, `text`, `chunkIndex`, `tokenCount`, `similarityScore`, and a `document`
  object with `description`, `date`, and `documentType`. Document metadata fields are joined
  from the `documents` table so Python can assemble citations without a separate lookup.
- **Auth**: `x-internal-key` header with `auth.expressKey` from Python config (ADR-044)
- **Status**: Approved — see QUERY-001 in
  `documentation/tasks/integration-lead-contracts.md`

Indicative request body:

```json
{
  "embedding": [0.1234, -0.5678],
  "top_k": 20
}
```

Indicative response body:

```json
{
  "results": [
    {
      "chunk_id": "<uuid>",
      "document_id": "<uuid>",
      "text": "...",
      "similarity_score": 0.92,
      "chunk_index": 0,
      "token_count": 250,
      "document": {
        "description": "Transfer of East Meadow",
        "date": "1967-03-15",
        "document_type": null
      }
    }
  ]
}
```

**C3-E2: Graph traversal callback (contract QUERY-002 — Phase 2 stub)**

- **Caller**: Python `query/query_handler.py` (Phase 2 only)
- **Direction**: Python → Express
- **Purpose**: Python calls Express to perform graph traversal via the `GraphStore` interface
  (ADR-037); not called in Phase 1 (pass-through router always returns `vector`)
- **Contract**: QUERY-002 (`POST /api/search/graph`). Request body is `GraphSearchRequest`
  containing `entityNames`, `maxDepth`, and optional `relationshipTypes`. Response is
  `GraphSearchResponse` containing `entities` and `relationships` arrays. Both the Express
  route and the Python stub are implemented in Phase 1 for testing, but the
  `PassthroughQueryRouter` ensures this endpoint is never called in Phase 1 production.
- **Phase 1 plan**: Define the interface contract in `query/query_handler.py` as a stub
  method `_graph_search()` that raises `NotImplementedError`; the pass-through router
  ensures it is never called in Phase 1
- **Auth**: `x-internal-key` header with `auth.expressKey` from Python config (ADR-044)
- **Status**: Approved (Phase 2 stub) — see QUERY-002 in
  `documentation/tasks/integration-lead-contracts.md`

---

## Shared utilities

### EmbeddingService

`shared/interfaces/embedding_service.py` — abstract base class as described in Step 6.
`shared/adapters/ollama_embedding.py` — Ollama concrete implementation.
`shared/factories/embedding_factory.py` — factory function reading `embedding.provider`.

Used by:

- `pipeline/steps/embedding_generation.py` — embeds document chunks (C2 step 6)
- `query/query_handler.py` — embeds query text for vector search (C3)

This is the intended ADR-042 shared utility pattern. Both users import from `shared/`; no
pipeline-to-query or query-to-pipeline imports result.

### LLMService (in shared — ADR-042 compliance)

`LLMService` lives in `shared/interfaces/llm_service.py`. This is the ADR-042-compliant
placement: both `pipeline/steps/llm_combined_pass.py` and `query/query_understanding.py`
need an LLM service. If `LLMService` lived in `pipeline/interfaces/`, the query module would
need to import from `pipeline/` — an ADR-042 boundary violation. Placing it in `shared/`
allows both modules to import it without any cross-module coupling.

`shared/adapters/ollama_llm.py` — Ollama LLM concrete implementation.
`shared/factories/llm_factory.py` — factory function reading `llm.provider`.

The module structure diagram at the top of this plan reflects this placement: `LLMService`
and its adapters and factory are all under `shared/`, not `pipeline/`.

### HTTP client

`shared/http_client.py` — a thin wrapper around `httpx` (or `aiohttp`) that:

- Reads the outbound key from config (`auth.expressKey`) for all Express-bound requests
- Adds the `x-internal-key` header to every outgoing request
- Provides methods for each Express callback: `post_processing_results(...)`,
  `vector_search(...)`, and (Phase 2 stub) `graph_search(...)`
- Handles retry logic for transient failures (configurable: `http.retryCount`,
  `http.retryDelayMs`)
- Raises a typed `ExpressCallError` on non-2xx responses or connection failures

All Express HTTP calls go through this single client. No other file in the service makes raw
HTTP calls.

### Config loading

`shared/config.py` — Dynaconf + Pydantic config singleton per ADR-015 and ADR-016.

**Dynaconf setup**: Loads `settings.json` (base, built into Docker image) and
`settings.override.json` (volume-mounted at runtime, optional). Environment variables with
the `DYNACONF_` prefix can override any key.

**Pydantic models** validate the merged config at startup. If validation fails, the app
crashes immediately with a descriptive error (fail-fast principle). The validated config
singleton is imported by all modules.

**Pydantic model structure** (indicative; exact fields are implementer decisions):

```python
class ProcessingConfig(BaseModel):
    ocr: OCRConfig
    llm: LLMConfig
    embedding: EmbeddingConfig
    metadata: MetadataConfig
    pipeline: PipelineConfig

class QueryConfig(BaseModel):
    router: str
    llm: QueryLLMConfig
    vectorSearch: VectorSearchConfig
    contextAssembly: ContextAssemblyConfig
    synthesis: SynthesisConfig

class AuthConfig(BaseModel):
    INBOUND_KEY: str   # validates incoming x-internal-key headers
    EXPRESS_KEY: str   # used on outbound calls to Express

class ServiceConfig(BaseModel):
    express_base_url: str
    http: HttpConfig

class AppConfig(BaseModel):
    processing: ProcessingConfig
    query: QueryConfig
    auth: AuthConfig
    service: ServiceConfig
```

The config singleton is created once in `shared/config.py` and imported by all other modules.

---

## Configuration

### Dynaconf keys required

The following config keys are required in `settings.json` or `settings.override.json`:

**OCR**

- `ocr.provider` — `"docling"` or `"tesseract"`
- `ocr.qualityThreshold` — float (0–100); page score below this triggers a flag
- `ocr.qualityScoring.confidenceWeight` — float
- `ocr.qualityScoring.densityWeight` — float

**LLM (shared — used by pipeline and query)**

- `llm.provider` — `"ollama"` or `"api"`
- `llm.baseUrl` — LLM server URL
- `llm.model` — model name
- `llm.chunkingMinTokens` — integer
- `llm.chunkingMaxTokens` — integer

**Embedding**

- `embedding.provider` — `"ollama"` or `"api"`
- `embedding.baseUrl` — embedding server URL
- `embedding.model` — model name
- `embedding.dimension` — integer; must match model output

**Metadata patterns**

- `metadata.patterns.documentType` — list of regex strings
- `metadata.patterns.dates` — list of regex strings
- `metadata.patterns.people` — list of regex strings
- `metadata.patterns.organisations` — list of regex strings
- `metadata.patterns.landReferences` — list of regex strings
- `metadata.patterns.description` — list of regex strings

**Metadata completeness weights**

- `metadata.completenessThreshold` — float (0–100)
- `metadata.completenessWeights.documentType` — float
- `metadata.completenessWeights.dates` — float
- `metadata.completenessWeights.people` — float
- `metadata.completenessWeights.organisations` — float
- `metadata.completenessWeights.landReferences` — float
- `metadata.completenessWeights.description` — float

**Pipeline**

- `pipeline.runningStepTimeoutMinutes` — integer; stale running steps older than this are
  reset to failed by Express before the next run

**Query**

- `query.router` — `"passthrough"` for Phase 1
- `query.llm.provider`, `query.llm.baseUrl`, `query.llm.model`
- `query.vectorSearch.topK` — integer (default 20)
- `query.contextAssembly.tokenBudget` — integer (default 4000)
- `query.contextAssembly.includeParentMetadata` — bool
- `query.synthesis.llm.provider`, `query.synthesis.llm.baseUrl`,
  `query.synthesis.llm.model`
- `query.synthesis.citationFields` — list of strings

**Auth**

- `AUTH.INBOUND_KEY` — the shared key for validating inbound requests from Next.js, Express,
  and CLI (ADR-044); Python checks this against the `x-internal-key` header on incoming
  requests
- `AUTH.EXPRESS_KEY` — the shared key used on outbound calls to Express (processing results,
  vector search, graph search); a different per-pair key that Express validates against
  `auth.pythonKey` in its own config

**Service**

- `service.expressBaseUrl` — base URL for Express HTTP callbacks
- `service.http.retryCount` — integer
- `service.http.retryDelayMs` — integer

---

## Testing approach

### Unit tests

Unit tests run without external dependencies. External services (OCR, LLM, embedding model,
Express HTTP) are mocked using `unittest.mock` or pytest fixtures that return mock
implementations of the abstract base classes.

**C2 pipeline unit tests**

Each step has its own test file in `tests/pipeline/`:

- `test_ocr_extraction.py` — tests the three catastrophic cases (zero pages, all empty,
  partial); page-level exception handling; step status logic; mocks `OCRService`
- `test_text_quality_scoring.py` — tests scoring math (confidence weight, density weight,
  threshold); failing page list assembly; document score as average; pure function, no mock
  needed
- `test_pattern_metadata.py` — tests regex pattern matching against known text strings;
  description overwrite rule (US-037); pure function, no mock needed for regex logic
- `test_completeness_scoring.py` — tests weighted scoring formula; threshold evaluation; field
  weight configuration; pure function, no mock needed
- `test_llm_combined_pass.py` — tests LLM response parsing and Pydantic validation; chunk
  post-processing (merge below min, split above max); entity extraction field validation;
  relationship structure validation; mocks `LLMService`
- `test_embedding_generation.py` — tests dimension validation; partial failure handling;
  mocks `EmbeddingService`
- `test_orchestrator.py` — tests step sequencing; flag gate (halt after catastrophic step 1
  outcome); combined flag rule (both quality and completeness fail); re-entrancy (start from
  step 3 when steps 1–2 are already complete); mocks all step implementations

**C3 query unit tests**

Each component has its own test file in `tests/query/`:

- `test_query_router.py` — tests that pass-through router always returns `vector` strategy
- `test_query_understanding.py` — tests LLM response parsing; Pydantic validation; fallback
  on parse failure; mocks `LLMService`
- `test_context_assembly.py` — tests token budget accumulation; truncation flag; ordering
  by score; pure function, no mock needed
- `test_response_synthesis.py` — tests citation marker extraction; no-relevant-documents
  case; mocks `LLMService`
- `test_query_handler.py` — tests full C3 pipeline sequencing; mocks all components

**Shared utility unit tests**

- `test_embedding_service.py` — tests dimension validation; mocks `EmbeddingService`
- `test_http_client.py` — tests auth header attachment; retry logic; error handling; mocks
  the HTTP transport layer (not an external HTTP server)

### Integration tests

Integration tests are marked `@pytest.mark.integration` and are not run on every commit.
They use real Docling, real Ollama, and real embedding models against fixture documents.
No database fixtures are needed (Python has no database connection — ADR-031).

**Fixture documents** in `services/processing/fixtures/`:

- `scanned-typewritten.pdf` — historical typewritten document
- `modern-digital.pdf` — born-digital PDF
- `scanned-tiff.tif` — TIFF image scan
- `scanned-jpeg.jpg` — JPEG photograph of a document

`expected-outputs.json` records the expected structure (not exact content) per step per
fixture: minimum/maximum text length, minimum/maximum chunk count, chunk size range,
embedding dimension type.

**Pipeline integration tests** (`tests/pipeline/test_integration_pipeline.py`):

- End-to-end C2 pipeline against each fixture document using real Docling/Ollama/embedding
- Validates output structure matches `expected-outputs.json` (structure not exact content,
  because LLM output is non-deterministic per ADR-025 and ADR-032)
- Validates step status is `completed` for each step on clean fixture documents
- Validates no flags are raised for clean fixture documents

**Query integration tests** (`tests/query/test_integration_query.py`):

- C3 pipeline with real LLM and real embedding model; Express HTTP callbacks mocked (no live
  Express server required for integration tests)
- Validates `SynthesisResult` has non-empty `response_text` and at least one `citation`
  when mock vector search returns relevant chunks
- Validates no-results response when mock vector search returns an empty list

### FastAPI endpoint tests

`tests/test_app.py` — tests the FastAPI application using `httpx.AsyncClient` with
`TestClient`. These are unit-level tests (all services mocked):

- `POST /query` — validates auth header rejection (401), valid request returns 200 with
  synthesis result shape
- `POST /process` — validates auth header rejection, valid request returns 200 with processing
  response shape
- `GET /health` — always 200

### Running tests

```bash
# Unit tests only (fast, no external deps)
pytest -m "not integration" services/processing/tests/

# Integration tests only (requires Ollama and Docling)
pytest -m integration services/processing/tests/

# All tests
pytest services/processing/tests/
```

---

## Open questions

**OQ-1 (Resolved — 2026-03-03)**: All four HTTP calls to Express are now covered by approved
Integration Lead contracts in `documentation/tasks/integration-lead-contracts.md`:

- C2-E1 → PROC-003: Express calls Python at `POST /process` with the document's filesystem
  path (`fileReference`). Python reads the file from the shared Docker Compose volume mount.
  No binary transfer over HTTP.
- C2-E2 → PROC-002: Python POSTs processing results to `POST /api/processing/results` with
  `ProcessingResultsRequest` schema (step results, flags, metadata, chunks with embeddings,
  entities, relationships). Express writes atomically.
- C3-E1 → QUERY-001: Python calls `POST /api/search/vector` with query embedding and `topK`.
  Response includes chunk text, similarity score, and document metadata (description, date,
  documentType) for citation assembly.
- C3-E2 → QUERY-002 (Phase 2 stub): Python calls `POST /api/search/graph` with entity names
  and traversal depth. Stubbed in Phase 1 (`_graph_search()` raises `NotImplementedError`);
  the `PassthroughQueryRouter` ensures it is never called.

**OQ-2 (Developer — note)**: The plan places `LLMService` in `shared/interfaces/` to satisfy
the ADR-042 boundary. If the developer wishes to use different LLM interfaces for pipeline
and query, they must explain in a decision log how the query module's LLM interface avoids
importing from `pipeline/`. The plan as written does not require a separate decision here —
the recommended placement is clear.

**OQ-3 (Developer — note)**: The embedding model choice (ADR-024 defers to implementation
time) determines the `embedding.dimension` config value and the `expected-outputs.json`
fixture entries. This decision must be made and documented before the embedding step or
integration tests can be implemented.

**OQ-4 (Developer — note)**: Initial regex pattern sets for step 3 (pattern metadata
extraction) and initial completeness field weights for step 4 are implementer decisions. They
should be documented in a decision log before the stories are closed (US-040).

**OQ-5 (Resolved — 2026-03-03)**: Description overwrite precedence confirmed. LLM combined
pass (step 5) takes precedence; if step 5 yields no description, step 3 (pattern extraction)
result is used; if neither detects a description, the original intake description is
preserved.

**OQ-6 (Resolved — 2026-03-03)**: The Integration Lead confirmed that the Python service
config requires two keys (see Python OQ-6 resolution in
`documentation/tasks/integration-lead-contracts.md`):

- `auth.inboundKey` — validates inbound requests from Next.js, Express, and CLI. Python
  checks this against the `x-internal-key` header on incoming requests. One key covers all
  inbound callers in Phase 1.
- `auth.expressKey` — used by Python on outbound calls to Express (processing results,
  vector search, graph search). This is a different per-pair key that Express validates
  against `auth.pythonKey` in its config.

Per-pair key independence is preserved at the config level. The AuthConfig Pydantic model
and the HTTP client have been updated in this plan to reflect the two-key model.

---

## Handoff checklist

- [x] Integration Lead has reviewed all flagged HTTP calls to Express (OQ-1, C2-E1, C2-E2,
      C3-E1, C3-E2 stub) — all contracts approved 2026-03-03
- [ ] ADR-042 module boundary respected throughout the plan — LLMService placement confirmed
      in shared/ (OQ-2)
- [x] Integration Lead open questions resolved (OQ-1, OQ-6) — contracts and auth keys
      confirmed 2026-03-03
- [ ] Developer open questions resolved (OQ-2, OQ-3, OQ-4)
- [ ] Developer has approved this plan
