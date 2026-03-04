# Task List — Python Processing Service

## Status

Draft — 2026-03-04

## Source plan

`documentation/tasks/senior-developer-python-plan.md` (Approved 2026-03-03)

## Flagged issues

**FLAG-01 — OQ-3: Embedding model choice blocks Task 15 and Task 22**

The Python plan explicitly flags (OQ-3) that the embedding model choice is deferred to
the implementer. `embedding.dimension` in `settings.json`, the `expected-outputs.json`
fixture file, and the `OllamaEmbeddingAdapter` implementation all depend on a concrete
model selection. Task 15 (embedding generation step) and Task 22 (pipeline integration
tests) cannot be fully implemented until this decision is made and documented. The decision
must be recorded as a decision log entry before those tasks can be closed.

**FLAG-02 — OQ-4: Initial regex patterns and completeness weights block Task 10 and US-040**

The Python plan explicitly flags (OQ-4) that initial regex pattern sets for step 3 and
initial completeness field weights for step 4 are implementer decisions. These values
populate `settings.json` and must be documented in a decision log before US-040
(US-040: Metadata completeness fields and scoring method) can be closed. Task 10 (completeness
scorer) can be implemented structurally, but the specific initial weights must be decided and
recorded before the story is verified closed.

**FLAG-03 — Cross-service dependency: Task 22 (pipeline integration tests) requires Ollama and Docling**

Integration tests at Task 22 are marked `@pytest.mark.integration` and require a running
Ollama instance and Docling installation. These are external dependencies outside the Python
service. The developer must confirm the local environment has these available before Task 22
can be started.

---

## Tasks

### Task 1: Service scaffolding and project structure

**Description**: Create the `services/processing/` directory tree exactly as specified in the
plan's module structure. This includes all subdirectory placeholders:
`pipeline/steps/`, `pipeline/interfaces/`, `pipeline/adapters/`, `pipeline/factories/`,
`query/interfaces/`, `query/implementations/`, `shared/interfaces/`, `shared/adapters/`,
`shared/factories/`, `fixtures/`, and `tests/pipeline/`, `tests/query/`, `tests/shared/`.

Create the root-level files: `app.py` (empty skeleton), `settings.json` (with all required
config keys from the plan's "Dynaconf keys required" section populated with placeholder or
default values), `requirements.txt` (listing `fastapi`, `uvicorn`, `dynaconf`, `pydantic`,
`httpx`, `pytest`, `pytest-asyncio`, `python-multipart`, `docling`, `pytesseract`, `ruff`),
`Dockerfile` (multi-stage: install dependencies, copy source, expose port 8000, run with
uvicorn), and `pytest.ini` (registers the `integration` marker).

Add `__init__.py` files in every Python package directory. Do not implement any logic yet —
the goal is a runnable (but empty) service skeleton that passes `pytest -m "not integration"
services/processing/tests/` with zero failures and zero errors.

**Depends on**: none

**Complexity**: S

**Acceptance condition**: Running `pytest -m "not integration" services/processing/tests/`
reports "no tests ran" with zero errors (no import failures, no missing module errors). The
`services/processing/` directory tree matches the structure in the plan. A `GET /health`
request to the running FastAPI app returns `{"status": "ok"}` with HTTP 200.

**Condition type**: both

**Status**: not_started

---

### Task 2: Config loading (`shared/config.py`)

**Description**: Implement `services/processing/shared/config.py` — the Dynaconf + Pydantic
config singleton.

Dynaconf must load `settings.json` (base config, built into the Docker image) and
`settings.override.json` (volume-mounted at runtime, optional). Environment variables with the
`DYNACONF_` prefix must override any key.

Pydantic models must validate the merged config at startup. If validation fails the app must
crash immediately with a descriptive error message (fail-fast). The following Pydantic model
hierarchy must be implemented (exact field names from the plan):

- `OCRConfig` — `provider`, `qualityThreshold`, `qualityScoring` (with `confidenceWeight`,
  `densityWeight`)
- `LLMConfig` — `provider`, `baseUrl`, `model`, `chunkingMinTokens`, `chunkingMaxTokens`
- `EmbeddingConfig` — `provider`, `baseUrl`, `model`, `dimension`
- `MetadataConfig` — `patterns` (per-field lists of regex strings), `completenessThreshold`,
  `completenessWeights` (per-field floats)
- `PipelineConfig` — `runningStepTimeoutMinutes`
- `QueryLLMConfig`, `VectorSearchConfig`, `ContextAssemblyConfig`, `SynthesisConfig`
- `QueryConfig` — `router`, `llm`, `vectorSearch`, `contextAssembly`, `synthesis`
- `AuthConfig` — `inboundKey`, `expressKey`
- `ServiceConfig` — `expressBaseUrl`, `http` (with `retryCount`, `retryDelayMs`)
- `AppConfig` — `processing`, `query`, `auth`, `service`

The singleton must be importable from all other modules as `from shared.config import config`.

**Depends on**: Task 1

**Complexity**: S

**Acceptance condition**: A pytest unit test in `tests/shared/test_config.py` confirms: (1)
valid `settings.json` produces a populated `AppConfig` instance with correct types; (2) a
missing required field (`auth.inboundKey`) causes a Pydantic `ValidationError` at load time;
(3) a `DYNACONF_AUTH__INBOUND_KEY` environment variable overrides the file value. All three
assertions pass.

**Condition type**: automated

**Status**: not_started

---

### Task 3: HTTP client (`shared/http_client.py`)

**Description**: Implement `services/processing/shared/http_client.py` — the single HTTP
client for all outbound Express calls.

Requirements:

- Use `httpx` (sync or async consistent with the FastAPI pattern chosen in Task 18)
- Read `auth.expressKey` from the config singleton and add it as the `x-internal-key` header
  on every outbound request
- Serialise all request bodies from Python snake_case to camelCase JSON (e.g.
  `document_id` → `documentId`, `top_k` → `topK`); this is the canonical serialisation rule
  for all Express-bound calls
- Deserialise all Express responses from camelCase JSON back to Python dataclasses
- Implement three public methods:
  - `post_processing_results(payload: ProcessingResultsRequest) -> ProcessingResultsResponse`
    — calls `POST /api/processing/results` (PROC-002)
  - `vector_search(embedding: list[float], top_k: int) -> VectorSearchResponse`
    — calls `POST /api/search/vector` (QUERY-001)
  - `graph_search(entity_names: list[str], max_depth: int) -> GraphSearchResponse`
    — Phase 2 stub; raises `NotImplementedError`
- Implement retry logic: retry on connection errors and 5xx responses up to
  `service.http.retryCount` times, with `service.http.retryDelayMs` delay between retries
- Raise a typed `ExpressCallError` (define this exception class in the same file) on
  non-2xx responses that exhaust retries or on non-retryable errors (4xx)

All other files in the service must call Express exclusively through this client. No raw HTTP
calls are permitted elsewhere.

**Depends on**: Task 2

**Complexity**: S

**Acceptance condition**: A pytest unit test in `tests/shared/test_http_client.py` confirms:
(1) the `x-internal-key` header is added to every outgoing request using the value from
config; (2) a request body with Python snake_case keys is serialised to camelCase JSON before
sending; (3) on a simulated 503 response the client retries up to `retryCount` times before
raising `ExpressCallError`; (4) on a simulated 401 response the client raises `ExpressCallError`
immediately (no retry). All assertions use mocked HTTP transport — no live Express server is
required.

**Condition type**: automated

**Status**: not_started

---

### Task 4: Auth middleware (`app.py` — inbound key validation)

**Description**: Implement the FastAPI auth middleware in `services/processing/app.py` that
validates the `x-internal-key` header on every route.

The middleware reads the expected key from `auth.inboundKey` in the config singleton. If the
header is absent or the value does not match, the middleware returns HTTP 401 Unauthorized and
does not invoke the route handler. The health endpoint (`GET /health`) is the only route that
bypasses auth validation.

The `GET /health` endpoint returns `{"status": "ok"}` with HTTP 200 regardless of auth.

The `POST /process` and `POST /query` route stubs (no business logic yet — return HTTP 501
Not Implemented) must be present so the auth middleware tests have targets to call.

**Depends on**: Task 2

**Complexity**: S

**Acceptance condition**: A pytest unit test in `tests/test_app.py` confirms: (1) `GET
/health` returns 200 with `{"status": "ok"}` without any auth header; (2) `POST /process`
with a correct `x-internal-key` header returns 501 (not 401); (3) `POST /process` with an
incorrect key returns 401; (4) `POST /process` with no `x-internal-key` header returns 401;
(5) `POST /query` with no `x-internal-key` header returns 401. All tests use
`httpx.AsyncClient` with the FastAPI `TestClient` pattern.

**Condition type**: automated

**Status**: not_started

---

### Task 5: `OCRService` interface and adapters (Step 1 interface layer)

**Description**: Implement the `OCRService` abstract base class and both Phase 1 adapters.

Files to create:

- `pipeline/interfaces/ocr_service.py` — `OCRService` abstract base class with:
  - `extract_text(file_path: str) -> OCRResult` (abstract)
  - `supports_file_type(file_extension: str) -> bool` (abstract)
  - `OCRResult` dataclass: `text_per_page: list[str]`, `confidence_per_page: list[float]`,
    `extraction_method: str`, `page_count: int`
- `pipeline/adapters/docling_ocr.py` — `DoclingAdapter` implementing `OCRService` using the
  Docling Python library; handles PDF and image types; preserves document structure per
  ADR-011; returns per-page text and per-page confidence scores
- `pipeline/adapters/tesseract_ocr.py` — `TesseractAdapter` implementing `OCRService` using
  pytesseract; handles TIFF, JPEG, PNG
- `pipeline/factories/ocr_factory.py` — `create_ocr_service()` function reading `ocr.provider`
  from config and returning the appropriate adapter; raises `ValueError` for unknown provider
  values

**Depends on**: Task 2

**Complexity**: M

**Acceptance condition**: A pytest unit test in `tests/pipeline/test_ocr_extraction.py`
confirms both adapters implement the `OCRService` interface (instantiation succeeds and all
abstract methods are present); `create_ocr_service()` returns a `DoclingAdapter` when config
sets `ocr.provider = "docling"` and a `TesseractAdapter` when `ocr.provider = "tesseract"`;
`create_ocr_service()` raises `ValueError` for an unrecognised provider string. These tests
use mock config values — no real document files are required at this step.

**Condition type**: automated

**Status**: not_started

---

### Task 6: OCR extraction step (`pipeline/steps/ocr_extraction.py`)

**Description**: Implement the OCR extraction pipeline step in
`pipeline/steps/ocr_extraction.py`.

The step receives a file path and an `OCRService` instance. It must:

1. Attempt to open and extract text from all pages (no fail-fast — all pages are iterated
   per UR-045/US-031)
2. Handle three catastrophic cases before returning, each resulting in step status `completed`
   with a `DocumentFlag` and no continuation to further steps:
   - Zero pages: flag type `"extraction_failure"`, reason `"Document opened but contains zero
     pages"` (UR-050/US-035)
   - All pages yield no text: flag type `"extraction_failure"`, reason `"No extractable text
     from any page"` (UR-048/US-033)
   - Some pages yield text, others do not: flag type `"partial_extraction"`, reason listing
     the zero-text page numbers (UR-049/US-034)
3. For individual page extraction failures (non-catastrophic): catch the exception, log it,
   treat the page as yielding empty text with confidence 0.0, and continue
4. If the file cannot be opened at all: return step status `failed` with an error message
   and `retry_on_next_trigger: True` (UR-068/UR-069/US-049)

The step returns an `ExtractionResult` dataclass:

- `text_per_page: list[str]`
- `confidence_per_page: list[float]`
- `extraction_method: str`
- `page_count: int`
- `document_flags: list[DocumentFlag]`
- `step_status: Literal['completed', 'failed']`
- `error_message: str | None`

The `DocumentFlag` dataclass (`type: str`, `reason: str`) must be defined in a shared
location importable by all pipeline steps (suggest `pipeline/interfaces/` or a dedicated
`shared/models.py`).

**Depends on**: Task 5

**Complexity**: M

**Acceptance condition**: Unit tests in `tests/pipeline/test_ocr_extraction.py` confirm all
four cases with a mocked `OCRService`: (1) zero-page document returns `step_status =
"completed"` with one flag of type `"extraction_failure"`; (2) all-empty-pages document
returns `step_status = "completed"` with one flag of type `"extraction_failure"`; (3)
partial-text document returns `step_status = "completed"` with one flag of type
`"partial_extraction"` whose reason names the zero-text pages; (4) file-open failure returns
`step_status = "failed"` with a non-empty error message. Each case is a separate test
function.

**Condition type**: automated

**Status**: not_started

---

### Task 7: `TextQualityScorer` interface and implementation (Step 2)

**Description**: Implement the text quality scoring step.

Files to create:

- `pipeline/interfaces/text_quality_scorer.py` — `TextQualityScorer` abstract base class with:
  - `score(text_per_page: list[str], confidence_per_page: list[float]) -> QualityResult`
    (abstract)
  - `QualityResult` dataclass: `per_page_scores: list[float]`, `document_score: float`,
    `passed_threshold: bool`, `failing_pages: list[int]` (1-indexed page numbers below
    threshold)
- `pipeline/steps/text_quality_scoring.py` — `WeightedTextQualityScorer` (no separate factory
  needed — this is the only Phase 1 implementation). The scoring formula:
  - Per-page score = OCR confidence (converted to 0–100) multiplied by
    `ocr.qualityScoring.confidenceWeight`, added to the text density score (characters per
    page scaled to 0–100) multiplied by `ocr.qualityScoring.densityWeight`. Text density
    score = `min(len(text_per_page[i]) / TARGET_CHARS_PER_PAGE, 1.0) × 100` (implementer
    chooses `TARGET_CHARS_PER_PAGE`).
  - Document score = average of per-page scores
  - A page fails if its score is below `ocr.qualityThreshold`
  - All weights and threshold are read from config — no hardcoded values
  - All pages are scored regardless of any individual page outcome (no fail-fast)
  - Flag type `"quality_threshold_failure"` is returned if any page fails; reason must list
    every failing page by 1-indexed number (UR-051/US-036)

**Depends on**: Task 2

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/pipeline/test_text_quality_scoring.py` confirm:
(1) a document where all pages score above the threshold returns `passed_threshold = True`
and empty `failing_pages`; (2) a document where one page is below the threshold returns
`passed_threshold = False` and `failing_pages = [<page_number>]`; (3) all pages are scored
regardless of any individual failure (no early exit); (4) the document score is the
arithmetic mean of per-page scores. Tests use hardcoded input values — no mock needed (pure
function).

**Condition type**: automated

**Status**: not_started

---

### Task 8: `PatternMetadataExtractor` interface and `RegexPatternExtractor` (Step 3)

**Description**: Implement the pattern metadata extraction step.

Files to create:

- `pipeline/interfaces/metadata_extractor.py` — `PatternMetadataExtractor` abstract base
  class with:
  - `extract(text: str, document_type_hint: str | None) -> MetadataResult` (abstract)
  - `MetadataResult` dataclass: `document_type: str | None`, `dates: list[str]`,
    `people: list[str]`, `organisations: list[str]`, `land_references: list[str]`,
    `description: str | None`, `detection_confidence: dict[str, float]`
- `pipeline/adapters/regex_pattern_extractor.py` — `RegexPatternExtractor` implementing
  `PatternMetadataExtractor`. Pattern sets are loaded from config keys:
  `metadata.patterns.documentType`, `metadata.patterns.dates`, `metadata.patterns.people`,
  `metadata.patterns.organisations`, `metadata.patterns.landReferences`,
  `metadata.patterns.description`. Each field's patterns are applied to the full document
  text; all unique matches are collected. `detection_confidence` is set per-field based on
  whether matches were found (implementer decides the confidence value scheme).
- `pipeline/factories/metadata_factory.py` — `create_metadata_extractor()` reading
  `metadata.extractor` from config (default `"regex"`); returns `RegexPatternExtractor`

Description overwrite rule (US-037/UR-053): the extraction step returns the detected
description as-is. The orchestrator applies the precedence rule (step 5 LLM description
takes priority; step 3 regex description used if step 5 yields nothing; intake description
preserved if neither detects one). The step itself does not apply this rule.

**Note**: The initial regex patterns in `settings.json` are an implementer decision (OQ-4).
They must be documented in a decision log before US-040 can be closed (see FLAG-02).

**Depends on**: Task 2

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/pipeline/test_pattern_metadata.py` confirm:
(1) a known text string containing a date pattern returns a non-empty `dates` list when the
matching pattern is configured; (2) a text string with no matching patterns returns all fields
as empty/None; (3) a technical failure in the regex engine (simulated via a malformed regex
in config) returns step status `failed` (not a flag — a retry-able technical failure). Tests
do not depend on OQ-4 decisions — they use test-specific inline pattern strings.

**Condition type**: automated

**Status**: not_started

---

### Task 9: `MetadataCompletenessScorer` interface and `WeightedFieldPresenceScorer` (Step 4)

**Description**: Implement the metadata completeness scoring step.

Files to create:

- `pipeline/interfaces/completeness_scorer.py` — `MetadataCompletenessScorer` abstract base
  class with:
  - `score(metadata_result: MetadataResult) -> CompletenessResult` (abstract)
  - `CompletenessResult` dataclass: `score: float`, `passed_threshold: bool`,
    `detected_fields: list[str]`, `missing_fields: list[str]`
- `pipeline/steps/completeness_scoring.py` — `WeightedFieldPresenceScorer` implementing
  `MetadataCompletenessScorer`. Formula:
  - For each field (`documentType`, `dates`, `people`, `organisations`, `landReferences`,
    `description`): if the field is non-empty/non-None, it is "detected"
  - `score = (sum of weights of detected fields / total weight of all fields) × 100`
  - All weights and `metadata.completenessThreshold` are read from config
  - `passed_threshold = score >= metadata.completenessThreshold`
  - `detected_fields` and `missing_fields` list the field names respectively

The completeness scorer must share no code paths with the text quality scorer — independent
assessment (UR-054/US-038). A document can fail one and pass the other.

**Note**: Initial completeness field weights are an implementer decision (OQ-4) — see FLAG-02.

**Depends on**: Task 8

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/pipeline/test_completeness_scoring.py` confirm:
(1) a `MetadataResult` with all fields populated scores 100; (2) a `MetadataResult` with no
fields populated scores 0; (3) a `MetadataResult` with a subset of fields detected scores
proportionally to the configured weights; (4) a score at or above the threshold returns
`passed_threshold = True` and a score below returns `passed_threshold = False`. Tests use
inline weight values — no dependency on OQ-4 decisions.

**Condition type**: automated

**Status**: not_started

---

### Task 10: `LLMService` interface and `OllamaLLMAdapter` (shared — Step 5 and C3)

**Description**: Implement the `LLMService` abstract base class and the Ollama adapter.
This lives in `shared/` (not `pipeline/`) so both the pipeline and query modules can import
it without violating the ADR-042 module boundary.

Files to create:

- `shared/interfaces/llm_service.py` — `LLMService` abstract base class with:
  - `combined_pass(text: str, document_type: str | None) -> LLMCombinedResult` (abstract)
  - `LLMCombinedResult` dataclass: `chunks: list[ChunkResult]`,
    `metadata_fields: dict`, `entities: list[EntityResult]`,
    `relationships: list[RelationshipResult]`
  - `ChunkResult` dataclass: `text: str`, `chunk_index: int`, `token_count: int`
  - `EntityResult` dataclass: `name: str`, `type: str`, `confidence: float`,
    `normalised_name: str`
  - `RelationshipResult` dataclass: `source_entity_name: str`, `target_entity_name: str`,
    `relationship_type: str`, `confidence: float`
- `shared/adapters/ollama_llm.py` — `OllamaLLMAdapter` implementing `LLMService`. Calls the
  Ollama HTTP API at `llm.baseUrl` with model `llm.model`. Constructs the combined-pass
  prompt as described in the plan (chunking with min/max token constraints, entity and
  relationship extraction per ADR-038 types, metadata fields included but not used in
  Phase 1 per ADR-036). Parses the structured JSON response with Pydantic. On JSON parse
  failure returns step status `failed`.
- `shared/factories/llm_factory.py` — `create_llm_service()` reading `llm.provider` from
  config; returns `OllamaLLMAdapter` for `"ollama"`; raises `ValueError` for unknown provider

**Depends on**: Task 2

**Complexity**: M

**Acceptance condition**: Unit tests in `tests/pipeline/test_llm_combined_pass.py` confirm
using a mocked `LLMService`: (1) a valid structured JSON LLM response is parsed into
`LLMCombinedResult` with correct field values; (2) a malformed JSON response causes the step
to return status `failed` (not raise an unhandled exception); (3) a missing required field
in the LLM response causes Pydantic `ValidationError` and returns status `failed`; (4)
`create_llm_service()` returns `OllamaLLMAdapter` when config sets `llm.provider = "ollama"`.

**Condition type**: automated

**Status**: not_started

---

### Task 11: LLM combined pass step — chunk post-processing (`pipeline/steps/llm_combined_pass.py`)

**Description**: Implement the pipeline step file `pipeline/steps/llm_combined_pass.py` that
wraps the `LLMService.combined_pass()` call and applies chunk post-processing.

After receiving `LLMCombinedResult` from the adapter, the step applies:

1. **Merge**: any chunk with `token_count < llm.chunkingMinTokens` is merged with an adjacent
   chunk (prefer next; if last chunk, merge with previous)
2. **Split**: any chunk with `token_count > llm.chunkingMaxTokens` is split on paragraph
   boundaries first; if still over limit, split on sentence boundaries
3. **Re-index**: assign final sequential `chunk_index` values starting from 0

The step returns an updated `LLMCombinedResult` with the post-processed `chunks` list.
`metadata_fields` (discarded in Phase 1 per ADR-036), `entities`, and `relationships` pass
through unchanged.

Step status `failed` is returned if the LLM call itself fails. Post-processing failures
(e.g. no paragraph or sentence boundary found during split) do not fail the step — the
implementer must choose a safe fallback (e.g. hard split at character count).

**Depends on**: Task 10

**Complexity**: M

**Acceptance condition**: Unit tests in `tests/pipeline/test_llm_combined_pass.py` (same file
as Task 10 tests) confirm: (1) a chunk below `chunkingMinTokens` is merged with the next
chunk to form one chunk; (2) a chunk above `chunkingMaxTokens` is split into two or more
chunks; (3) after post-processing all chunks are assigned sequential 0-based `chunk_index`
values; (4) `entities` and `relationships` are unchanged by post-processing. Tests use inline
min/max values — no live LLM required.

**Condition type**: automated

**Status**: not_started

---

### Task 12: `EmbeddingService` interface and `OllamaEmbeddingAdapter` (shared — Step 6 and C3)

**Description**: Implement the `EmbeddingService` abstract base class and the Ollama adapter.
This lives in `shared/` (not `pipeline/`) so both the pipeline (step 6) and query handler
(C3 query embedding) can import it without violating the ADR-042 module boundary.

Files to create:

- `shared/interfaces/embedding_service.py` — `EmbeddingService` abstract base class with:
  - `embed(text: str) -> EmbeddingResult` (abstract)
  - `EmbeddingResult` dataclass: `embedding: list[float]`, `dimension: int`, `model: str`
- `shared/adapters/ollama_embedding.py` — `OllamaEmbeddingAdapter` implementing
  `EmbeddingService`. Calls the Ollama embeddings API at `embedding.baseUrl` with model
  `embedding.model`. Validates that the returned vector length matches `embedding.dimension`
  config value; raises `ValueError` if the dimension does not match.
- `shared/factories/embedding_factory.py` — `create_embedding_service()` reading
  `embedding.provider` from config; returns `OllamaEmbeddingAdapter` for `"ollama"`; raises
  `ValueError` for unknown provider

**Note**: The `embedding.dimension` value in `settings.json` must match the selected model's
output dimension. This value cannot be finalised until OQ-3 is resolved (see FLAG-01).
Task 12 can be implemented structurally with a placeholder dimension value; the actual
dimension must be confirmed and `settings.json` updated before Task 15 and Task 22 can be
completed.

**Depends on**: Task 2

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/shared/test_embedding_service.py` confirm using
a mocked `EmbeddingService`: (1) a returned embedding with dimension matching config passes
validation; (2) a returned embedding with a mismatched dimension raises `ValueError`; (3)
`create_embedding_service()` returns `OllamaEmbeddingAdapter` when config sets
`embedding.provider = "ollama"`. All tests use mocked HTTP transport — no live Ollama server
required.

**Condition type**: automated

**Status**: not_started

---

### Task 13: `QueryRouter` interface and `PassthroughQueryRouter` (C3)

**Description**: Implement the `QueryRouter` abstract base class and the Phase 1
pass-through implementation.

Files to create:

- `query/interfaces/query_router.py` — `QueryRouter` abstract base class (ADR-040) with:
  - `route(query_text: str) -> RouteDecision` (abstract)
  - `RouteDecision` dataclass: `strategy: Literal['vector', 'graph', 'both']`,
    `extracted_entities: list[str]`, `reasoning: str | None`
- `query/implementations/passthrough_router.py` — `PassthroughQueryRouter` implementing
  `QueryRouter`. `route()` ignores input and always returns
  `RouteDecision(strategy='vector', extracted_entities=[], reasoning=None)`.
- `query/router_factory.py` — `create_query_router()` reading `query.router` from config;
  returns `PassthroughQueryRouter` for `"passthrough"`; raises `ValueError` for unknown
  values

This module lives in `query/` and must not import from `pipeline/` (ADR-042 boundary).

**Depends on**: Task 2

**Complexity**: S

**Acceptance condition**: Unit test in `tests/query/test_query_router.py` confirms: (1) the
pass-through router always returns `strategy = "vector"` regardless of the input query text;
(2) `extracted_entities` is always an empty list; (3) `reasoning` is always `None`; (4)
`create_query_router()` returns `PassthroughQueryRouter` when config sets
`query.router = "passthrough"`. Four test functions, each covering one assertion.

**Condition type**: automated

**Status**: not_started

---

### Task 14: Query understanding (`query/query_understanding.py`)

**Description**: Implement `query/query_understanding.py` — the first step of the C3 query
pipeline. Uses `LLMService` from `shared/` (ADR-042 compliant import path).

The module exposes a function (or class method) that:

1. Constructs a query-understanding prompt (distinct from the combined-pass prompt) instructing
   the LLM to return structured JSON with: `intent` (string), `refined_search_terms` (string),
   `extracted_entities` (list of dicts with name and type), `routing_hint` (string or null),
   `confidence` (float)
2. Calls `LLMService.combined_pass()` — or adds a separate `understand_query()` method to
   the `LLMService` interface if the implementer determines a separate method is needed to
   satisfy OQ-2; if a separate method is added, the plan's recommendation (single shared
   `LLMService`) must be preserved and any separate interface must also live in `shared/`
3. Parses the response with Pydantic into `QueryUnderstandingResult` dataclass: `intent: str`,
   `refined_search_terms: str`, `extracted_entities: list[dict]`, `routing_hint: str | None`,
   `confidence: float`
4. On JSON parse failure: uses safe fallback — returns `QueryUnderstandingResult` with
   `refined_search_terms = original query text`, `intent = "unknown"`,
   `extracted_entities = []`, `routing_hint = None`, `confidence = 0.0`

Config keys used: `query.llm.provider`, `query.llm.baseUrl`, `query.llm.model`.

**Depends on**: Task 10, Task 13

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/query/test_query_understanding.py` confirm
using a mocked `LLMService`: (1) a valid structured JSON response is parsed into
`QueryUnderstandingResult` with correct field values; (2) a malformed JSON response triggers
the safe fallback and returns `intent = "unknown"` and `refined_search_terms = <original
query>`; (3) the fallback does not raise an unhandled exception.

**Condition type**: automated

**Status**: not_started

---

### Task 15: Embedding generation step (`pipeline/steps/embedding_generation.py`)

**Description**: Implement `pipeline/steps/embedding_generation.py` — Step 6 of the C2
pipeline.

The step receives the `LLMCombinedResult` from step 5 (chunks list with `chunk_index` and
`text`) and an `EmbeddingService` instance. It must:

1. Iterate all chunks from the post-processed list
2. Call `embedding_service.embed(chunk.text)` for each chunk
3. Validate that the returned `EmbeddingResult.dimension` matches `embedding.dimension` from
   config; if a mismatch is detected for any chunk, the entire step returns `failed`
4. Collect all embeddings as a list of `ChunkEmbedding` objects: `chunk_index`, `text`,
   `token_count`, `embedding: list[float]`
5. Return all collected embeddings to the orchestrator — the step does not call Express
   directly; the orchestrator includes them in the PROC-002 payload

If any chunk embedding fails (provider unavailable or dimension mismatch), the entire step
returns `failed` — partial embeddings are not written (UR-065/UR-066/US-047).

**Note**: This task depends on OQ-3 being resolved for its dimension validation to be
meaningful. The step can be implemented structurally before OQ-3 is resolved, but integration
testing (Task 22) cannot be completed until the actual model and dimension are confirmed.
See FLAG-01.

**Depends on**: Task 11, Task 12

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/pipeline/test_embedding_generation.py` confirm
using a mocked `EmbeddingService`: (1) all chunks produce embeddings and the step returns
`step_status = "completed"` with a list matching the input chunk count; (2) a dimension
mismatch on any single chunk causes the step to return `step_status = "failed"` with no
partial results; (3) a provider failure (simulated exception from the mock) causes the step to
return `step_status = "failed"`. Three test functions.

**Condition type**: automated

**Status**: not_started

---

### Task 16: Context assembly (`query/context_assembly.py`)

**Description**: Implement `query/context_assembly.py` — the context preparation step in the
C3 query pipeline.

The module accepts a list of `SearchResult` objects (from the vector search step) and returns
an `AssembledContext`. Requirements:

- Accept a list of `SearchResult` dataclasses: `chunk_id: str`, `document_id: str`,
  `text: str`, `chunk_index: int`, `token_count: int`, `similarity_score: float`,
  `document: DocumentMetadata` (with `description: str`, `date: str`, `document_type: str |
  None`)
- Iterate results in similarity score order (highest first)
- Estimate tokens per chunk: `len(chunk.text) // 4` (or actual tokenizer if available;
  implementer decision)
- Accumulate chunks until the token budget is reached or all chunks are included
- Return `AssembledContext` dataclass: `chunks: list[SearchResult]`, `total_tokens: int`,
  `truncated: bool` (True if budget caused exclusion of at least one chunk)

Config keys: `query.contextAssembly.tokenBudget`, `query.contextAssembly.includeParentMetadata`

When `includeParentMetadata` is True, the document-level metadata fields (description, date,
document_type) are included alongside chunk text in the assembled context (used when
constructing the synthesis prompt in Task 17).

This is a pure function with no external calls. Failure propagates as an exception to the
caller (`query_handler.py`).

**Depends on**: Task 13

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/query/test_context_assembly.py` confirm (all
pure function, no mock needed): (1) results are ordered by similarity score descending; (2)
chunks are accumulated until the token budget is reached and `truncated = True` is set when
the budget causes exclusion; (3) when all chunks fit within the budget `truncated = False`;
(4) an empty input list returns `AssembledContext` with empty `chunks` and `total_tokens = 0`.

**Condition type**: automated

**Status**: not_started

---

### Task 17: Response synthesis (`query/response_synthesis.py`)

**Description**: Implement `query/response_synthesis.py` — the final LLM call in the C3
query pipeline. Uses `LLMService` from `shared/`.

The module accepts `AssembledContext` and the original query text and:

1. Formats chunks with citation markers (`[Citation 1]`, `[Citation 2]`, etc.)
2. Sends a system prompt to the LLM instructing it to:
   - Answer using only the provided context (no general knowledge — US-069/UR-101)
   - Not give legal advice or legal interpretation (UR-100)
   - State explicitly if no relevant documents exist (UR-099)
   - Cite using the provided markers
3. Parses the LLM response to extract which citation markers appear in the response text
4. Maps citation markers back to their source `SearchResult` chunks
5. Returns `SynthesisResult` dataclass: `response_text: str`,
   `citations: list[CitationResult]`, `no_results: bool` (True when LLM indicates no
   relevant documents)
   - `CitationResult` dataclass: `chunk_id: str`, `document_id: str`,
     `document_description: str`, `document_date: str`
     (archive reference is NOT computed here — the caller derives it per ADR-023)

On LLM failure: returns an error response to the caller (no fallback synthesis).

**Depends on**: Task 16

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/query/test_response_synthesis.py` confirm
using a mocked `LLMService`: (1) citation markers in the LLM response are mapped to the
correct source chunks; (2) when the LLM response contains no citation markers, `citations`
is an empty list; (3) when the assembled context is empty (no relevant documents), `no_results
= True` and `response_text` explicitly states no relevant documents were found (UR-099).

**Condition type**: automated

**Status**: not_started

---

### Task 18: Pipeline orchestrator (`pipeline/orchestrator.py`)

**Description**: Implement `pipeline/orchestrator.py` — the single entry point for the C2
pipeline.

The `PipelineOrchestrator` class receives a `ProcessingRequest` (matching the PROC-003
contract: `document_id: str`, `file_reference: str`, `incomplete_steps: list[str]`,
`previous_outputs: dict | None`) and:

1. Determines which steps to run based on `incomplete_steps` (re-entrancy mechanism — ADR-027)
2. If step 1 (`text_extraction`) is not in `incomplete_steps`, uses `previous_outputs` for
   the already-extracted text and confidence values
3. Sequences steps 1–6, passing outputs from each step as inputs to the next
4. Applies the flag gate: if steps 1 or 2 produce a `DocumentFlag`, the orchestrator halts
   and does not run steps 3–6
5. Applies the combined-flag rule (US-039/UR-055): if both text quality and completeness
   thresholds fail on the same document, combines them into a single flag with both reasons;
   this is assembled after step 4 completes
6. Builds a `ProcessingResponse` (matching the PROC-002 request schema):
   - `step_results`: dict mapping step name to `StepResult` (status + error message)
   - `flags`: list of `DocumentFlag`
   - `metadata`: the detected metadata from step 3 (or None if pipeline halted before step 3)
   - `chunks`: list of chunk data with embeddings from steps 5 and 6 (or None if pipeline
     halted earlier)
   - `entities` and `relationships`: from step 5 (or None)
7. Calls `http_client.post_processing_results()` (PROC-002) with the `ProcessingResponse`

The orchestrator must serialise Python snake_case field names to camelCase JSON before
sending to Express (delegating to `http_client.py` as per Task 3).

Description overwrite precedence (OQ-5, resolved): if step 5 yields a description, use it;
if not, use step 3's description; if neither, preserve the original intake description
(passed in `previous_outputs.metadata.description`).

**Depends on**: Task 6, Task 7, Task 9, Task 11, Task 15, Task 3

**Complexity**: M

**Acceptance condition**: Unit tests in `tests/pipeline/test_orchestrator.py` confirm using
mocked step implementations: (1) when `incomplete_steps` does not include `text_extraction`,
step 1 is skipped and `previous_outputs` text is used for step 2; (2) a document flag from
step 1 or 2 halts the pipeline and steps 3–6 do not run; (3) when both text quality and
completeness fail, the `ProcessingResponse` contains exactly one flag with both reasons; (4)
when neither threshold fails, steps 1–6 all run and the response includes non-None `chunks`
and `entities`. Four test functions.

**Condition type**: automated

**Status**: not_started

---

### Task 19: Query handler (`query/query_handler.py`)

**Description**: Implement `query/query_handler.py` — the orchestrator for the C3 query
pipeline.

The `QueryHandler` class orchestrates the full query pipeline for a single query request:

1. Calls `QueryRouter.route()` to get a `RouteDecision` (always `vector` in Phase 1)
2. Calls `query_understanding.py` to get `QueryUnderstandingResult`
3. Embeds `refined_search_terms` using `EmbeddingService` (from `shared/`)
4. Calls `http_client.vector_search(embedding, top_k)` (QUERY-001) to get a list of
   `SearchResult` objects from Express
5. Calls `context_assembly.py` with the search results to get `AssembledContext`
6. Calls `response_synthesis.py` with `AssembledContext` and the original query text to get
   `SynthesisResult`
7. Returns `SynthesisResult` to the FastAPI route handler

For the Phase 2 stub: a private `_graph_search()` method that raises `NotImplementedError`
must be present. The `PassthroughQueryRouter` ensures it is never called in Phase 1.

All dependencies (`QueryRouter`, `LLMService`, `EmbeddingService`, `HttpClient`) are injected
at construction — not created inside the handler — to enable testing with mocks.

**Depends on**: Task 13, Task 14, Task 12, Task 3, Task 16, Task 17

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/query/test_query_handler.py` confirm using
mocked dependencies: (1) the full pipeline runs in correct sequence (router → understanding
→ embedding → vector search → assembly → synthesis) and returns a `SynthesisResult`; (2)
when vector search returns an empty list, `SynthesisResult.no_results = True`; (3)
`_graph_search()` raises `NotImplementedError`. Three test functions.

**Condition type**: automated

**Status**: not_started

---

### Task 20: FastAPI route wiring and dependency injection (`app.py`)

**Description**: Complete `app.py` by wiring up real route handlers and FastAPI dependency
injection for both the C2 and C3 pipelines.

Requirements:

- All service instances (`OCRService`, `LLMService`, `EmbeddingService`, `QueryRouter`,
  `HttpClient`) are created once at application startup using their respective factory
  functions and injected into route handlers via FastAPI's `Depends()` mechanism (or a
  startup event)
- `POST /process` route: validates the request body against the `ProcessDocumentRequest`
  schema (matching PROC-003), calls `PipelineOrchestrator.process()`, returns the
  `ProcessingResponse` as JSON; returns HTTP 400 on validation failure
- `POST /query` route: validates the request body against `QueryRequest` schema (matching
  QUERY-003: `queryText: str`), calls `QueryHandler.handle()`, returns `QueryResponse` as
  JSON (matching QUERY-003: `responseText`, `citations`, `noResults`); returns HTTP 400 on
  empty query text; returns HTTP 503 on LLM service unavailability
- Auth middleware from Task 4 is active on both POST routes (401 on invalid key)
- `GET /health` returns `{"status": "ok"}` with HTTP 200 (no auth required)
- Response bodies must serialise Python snake_case to camelCase JSON to comply with the
  QUERY-003 contract (e.g. `response_text` → `responseText`, `no_results` → `noResults`)

**Depends on**: Task 4, Task 18, Task 19

**Complexity**: S

**Acceptance condition**: Unit tests in `tests/test_app.py` confirm using fully mocked
orchestrator and query handler: (1) `POST /process` with a valid body and correct auth header
returns HTTP 200 with a JSON body matching the `ProcessingResponse` shape; (2) `POST /process`
with an invalid body returns HTTP 400; (3) `POST /query` with a valid body and correct auth
header returns HTTP 200 with `responseText`, `citations`, and `noResults` fields in the
response JSON; (4) `POST /query` with an empty `queryText` returns HTTP 400; (5) all
previously passing auth middleware tests from Task 4 still pass.

**Condition type**: automated

**Status**: not_started

---

### Task 21: C2 and C3 pipeline unit test suite completion

**Description**: Complete all remaining unit test files that are not already covered by Tasks
1–20. Each step and component should have its own test file as specified in the plan.

Files to create or complete (each must have at least the test cases described in the plan):

- `tests/pipeline/test_ocr_extraction.py` — catastrophic cases and file-open failure
  (partially covered by Task 6; verify completeness)
- `tests/pipeline/test_text_quality_scoring.py` — all cases from Task 7
- `tests/pipeline/test_pattern_metadata.py` — cases from Task 8
- `tests/pipeline/test_completeness_scoring.py` — cases from Task 9
- `tests/pipeline/test_llm_combined_pass.py` — cases from Tasks 10 and 11
- `tests/pipeline/test_embedding_generation.py` — cases from Task 15
- `tests/pipeline/test_orchestrator.py` — cases from Task 18
- `tests/query/test_query_router.py` — cases from Task 13
- `tests/query/test_query_understanding.py` — cases from Task 14
- `tests/query/test_context_assembly.py` — cases from Task 16
- `tests/query/test_response_synthesis.py` — cases from Task 17
- `tests/query/test_query_handler.py` — cases from Task 19
- `tests/shared/test_config.py` — cases from Task 2
- `tests/shared/test_embedding_service.py` — cases from Task 12
- `tests/shared/test_http_client.py` — cases from Task 3

This task ensures every test described in the plan exists and passes. It is a completeness
sweep — most tests will already exist from earlier tasks; this task fills any gaps.

**Depends on**: Tasks 2–20 (all prior implementation tasks)

**Complexity**: S

**Acceptance condition**: Running `pytest -m "not integration" services/processing/tests/`
reports all test files present and all tests passing with zero failures, zero errors, and zero
warnings. The output shows at least one test function per test file listed above.

**Condition type**: automated

**Status**: not_started

---

### Task 22: Pipeline integration tests (`tests/pipeline/test_integration_pipeline.py`)

**Description**: Implement integration tests for the full C2 pipeline against real fixture
documents. These tests are marked `@pytest.mark.integration` and require a running Ollama
instance and Docling installation.

Steps:

1. Create the `services/processing/fixtures/` directory with four representative documents:
   - `scanned-typewritten.pdf` — historical typewritten document
   - `modern-digital.pdf` — born-digital PDF
   - `scanned-tiff.tif` — TIFF image scan
   - `scanned-jpeg.jpg` — JPEG photograph of a document
2. Create `services/processing/fixtures/expected-outputs.json` recording the expected
   structure (not exact content) per step per fixture: minimum/maximum text length,
   minimum/maximum chunk count, chunk size range, embedding dimension. These values depend on
   OQ-3 being resolved for the embedding dimension entry (see FLAG-01).
3. Implement `tests/pipeline/test_integration_pipeline.py` with tests that:
   - Run the full C2 pipeline against each fixture document with real Docling/Ollama/embedding
   - Validate output structure matches `expected-outputs.json` (structure, not exact content)
   - Validate step status is `completed` for each step on clean fixture documents
   - Validate no flags are raised for clean fixture documents
   - Mock the Express HTTP call (`post_processing_results`) — no live Express server required

**Note**: `expected-outputs.json` embedding dimension entries cannot be finalised until OQ-3
is resolved (see FLAG-01). The fixture documents themselves must be representative of the real
archive's document types.

**Depends on**: Task 18 (orchestrator), Task 21 (unit test suite complete)

**Complexity**: L

**Acceptance condition**: Running `pytest -m integration services/processing/tests/pipeline/`
with a live Ollama instance and Docling installed produces passing tests for all four fixture
documents. Each fixture's output structure matches `expected-outputs.json`. Step statuses are
all `completed`. No flags are raised for clean fixtures. The Express HTTP call is mocked.

**Condition type**: both

**Status**: not_started

---

### Task 23: Query integration tests (`tests/query/test_integration_query.py`)

**Description**: Implement integration tests for the full C3 query pipeline. These tests are
marked `@pytest.mark.integration` and require a running Ollama instance and real embedding
model.

Implement `tests/query/test_integration_query.py` with two tests:

1. When the mock vector search returns a list of relevant chunks (pre-defined fixture strings
   representing archive document excerpts), the `SynthesisResult` has non-empty `response_text`
   and at least one `citation`
2. When the mock vector search returns an empty list, `SynthesisResult.no_results = True` and
   `response_text` explicitly states that no relevant documents were found (UR-099/US-069)

Express HTTP callbacks (vector search) are mocked — no live Express server is required.
A live Ollama instance with the configured model is required for both tests.

**Depends on**: Task 19 (query handler), Task 21 (unit test suite complete)

**Complexity**: M

**Acceptance condition**: Running `pytest -m integration services/processing/tests/query/`
with a live Ollama instance produces two passing tests. The relevant-chunks test returns a
non-empty `response_text` and at least one citation. The empty-results test returns
`no_results = True` and a `response_text` that explicitly states no relevant documents were
found.

**Condition type**: both

**Status**: not_started

---

### Task 24: Ruff linting and formatting quality gate

**Description**: Configure Ruff as the linter and formatter for the Python processing service
(ADR-046 mandates Ruff for `services/processing/`). Create `services/processing/ruff.toml`
(or a `[tool.ruff]` section in `pyproject.toml`) with the following configuration:

- `line-length = 100`
- `select = ["E", "F", "I"]` — pycodestyle errors, Pyflakes, and isort
- `target-version` set to match the Python version in the Dockerfile

All source files must pass `ruff check` with zero violations. All source files must be
formatted with `ruff format`. Document the lint and format commands in the project
`README` or `Makefile`.

**Depends on**: Task 21 (unit test suite complete — all source files exist)

**Complexity**: S

**Acceptance condition**: Running `ruff check services/processing/` from the repository root
reports zero violations. Running `ruff format --check services/processing/` reports zero
unformatted files. A `ruff.toml` or equivalent config file exists in `services/processing/`.

**Condition type**: automated

**Status**: not_started
