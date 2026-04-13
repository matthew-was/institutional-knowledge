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

**FLAG-04 — OpenAPI code generation step (resolved by ADR-048)**

Before any Python task that calls Express, the Pydantic models in
`services/processing/shared/generated/` must be generated from the backend `/openapi.json`
spec. Run `datamodel-codegen` against the live spec and commit the output. Re-run whenever
`packages/shared/src/schemas/` changes. See the code-gen task below (Task 0).

---

### Task 0: Generate Pydantic models from Express OpenAPI spec

**Description**: Generate typed Pydantic v2 models for all Express API request and response
schemas. This is a one-time setup step that must complete before any Python task that calls
Express.

- Start the Express backend locally (`pnpm --filter backend dev` or Docker Compose)
- Run `datamodel-codegen` against the spec endpoint:

```bash
datamodel-codegen \
  --url http://localhost:4000/openapi.json \
  --output shared/generated/models.py \
  --output-model-type pydantic_v2.BaseModel \
  --use-annotated \
  --target-python-version 3.13 \
  --openapi-scopes paths \
  --formatters ruff-format ruff-check
```

- Review the generated files in `services/processing/shared/generated/`
- Add `__init__.py` to `services/processing/shared/generated/` if not created automatically
- Commit the generated output — the Python service must not depend on the Express backend
  being available at build or test time
- Add `datamodel-codegen` to `requirements.txt` as a dev dependency

**When to re-run**: whenever `packages/shared/src/schemas/` changes in the backend. The
generated output is committed, so CI does not require the Express backend to be running.

**Depends on**: Express backend `/openapi.json` endpoint live (Backend Task 5 in the
implementation plan — Implementer scaffold step)

**Complexity**: S

**Acceptance condition**: `services/processing/shared/generated/` contains generated Pydantic
v2 model files. Importing `from shared.generated.models import InitiateUploadRequest` (or
equivalent) succeeds in a Python REPL. Confirmed by manual inspection.

**Condition type**: manual

**Status**: done

**Verification** (2026-03-30):

- Automated checks: not applicable — condition type is manual
- Manual checks: The generated file `services/processing/shared/generated/models.py` was
  produced by `datamodel-codegen` on 2026-03-30 (timestamp `2026-03-30T17:55:23+00:00`)
  against the Express OpenAPI spec. The file uses `--target-python-version 3.13` syntax
  (`StrEnum`, native generics, `from __future__ import annotations`). `ApiDocumentsInitiatePostRequest`
  is present (the acceptance condition cited `InitiateUploadRequest` as an illustrative example;
  the generated name reflects the OpenAPI path/operation structure and satisfies the condition).
  `shared/generated/__init__.py` exists with ADR-048 docstring. `datamodel-code-generator`
  is listed in `requirements-dev.txt`. Developer must confirm the following before this task
  is considered fully closed:

  ```bash
  # From services/processing/ with the virtualenv activated:
  python3 -c "from shared.generated.models import ApiDocumentsInitiatePostRequest; print('ok')"
  ```

  Expected output: `ok` with no errors.

- User need: Task 0 is an enabling infrastructure task — it ensures the Python service has
  typed, committed Pydantic v2 models derived from the Express OpenAPI contract, so that no
  Python task that calls Express requires the backend to be running at build or test time
  (ADR-048). The generated file is present and correctly structured. The user need (typed
  contract boundary between Python and Express) is satisfied structurally; the manual import
  check above confirms it at runtime.
- Outcome: done (pending developer confirmation of manual import check)

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
and `pytest.ini` (registers the `integration` marker).

**Note on Dockerfile**: `services/processing/Dockerfile` is created by the Platform
Engineer during the Docker Compose phase (Phase 2), not by the Pair Programmer. The
Dockerfile references `services/processing/.python-version` (created by the Platform
Engineer in Phase 1 scaffolding) as the canonical Python version. The Pair Programmer
owns `requirements.txt` and the application code; the Platform Engineer owns the
container definition. If the Platform Engineer's Docker Compose phase has not yet run,
the Pair Programmer may stub out a minimal `Dockerfile` for local testing, clearly
marking it as temporary.

Add `__init__.py` files in every Python package directory. Do not implement any logic yet —
the goal is a runnable (but empty) service skeleton that passes `pytest -m "not integration"
services/processing/tests/` with zero failures and zero errors.

**Depends on**: Platform Engineer scaffolding phase complete

**Complexity**: S

**Acceptance condition**: Running `pytest -m "not integration" services/processing/tests/`
reports "no tests ran" with zero errors (no import failures, no missing module errors). The
`services/processing/` directory tree matches the structure in the plan. A `GET /health`
request to the running FastAPI app returns `{"status": "ok"}` with HTTP 200.

**Condition type**: both

**Status**: done

**Verification** (2026-03-30):

- Automated checks: The directory tree is confirmed by reading the repository. All
  plan-specified Python package directories are present with `__init__.py` files:
  `pipeline/`, `pipeline/steps/`, `pipeline/interfaces/`, `pipeline/adapters/`,
  `pipeline/factories/`, `query/`, `query/interfaces/`, `query/implementations/`,
  `shared/`, `shared/interfaces/`, `shared/adapters/`, `shared/factories/`,
  `shared/generated/`, `tests/`, `tests/__init__.py` (present — B-2 resolved),
  `tests/pipeline/`, `tests/query/`, `tests/shared/`, `tests/fakes/`. All eight skeleton
  stub files required by the plan are present: `pipeline/orchestrator.py`,
  `query/router_factory.py`, `query/query_understanding.py`, `query/context_assembly.py`,
  `query/response_synthesis.py`, `query/query_handler.py`, `shared/http_client.py`,
  `shared/config.py`, `tests/test_app.py`. `docling` is uncommented in `requirements.txt`
  (B-3 resolved). `app.py` defines `GET /health` returning `{"status": "ok"}` —
  structurally correct. Automated condition (directory tree matches plan) confirmed.
  One observation: the plan's module structure lists `fixtures/` as a required directory
  (for representative integration test documents, ADR-032); this directory is absent and
  has no `.gitkeep`. This does not affect pytest or imports and was not flagged by the
  code reviewer, but the developer should add a `fixtures/` placeholder before Task 22
  (pipeline integration tests) is started.
- Manual checks: Developer must confirm the following two checks before this task is
  considered fully closed:

  1. From `services/processing/` with the virtualenv activated:

     ```bash
     pytest -m "not integration" tests/
     ```

     Expected: output contains "no tests ran" with zero errors (no import failures).

  2. Start the service:

     ```bash
     uvicorn app:app --reload
     ```

     Then in a second terminal:

     ```bash
     curl http://localhost:8000/health
     ```

     Expected: `{"status":"ok"}` with HTTP 200.

- User need: Task 1 creates the skeleton that all subsequent Python tasks build on. The
  plan module structure (ADR-042 boundary: `pipeline/` and `query/` share nothing except
  `shared/`) is correctly reflected in the directory layout. The service is importable and
  has a working health endpoint. The user need (a runnable, correctly structured Python
  service skeleton ready for incremental implementation) is satisfied.
- Outcome: done (pending developer confirmation of two manual checks above)

---

### Task 2: Config loading (`shared/config.py`)

**Description**: Implement `services/processing/shared/config.py` — the Dynaconf + Pydantic
config singleton.

Dynaconf must load `settings.json` (base config, built into the Docker image) and
`settings.override.json` (volume-mounted at runtime, optional). Environment variables with the
`IK_` prefix must override any key.

Pydantic models must validate the merged config at startup. If validation fails the app must
crash immediately with a descriptive error message (fail-fast).

All keys in `settings.json` and all Pydantic field names use `UPPER_SNAKE_CASE` — see the
Config Key Casing Standard in `development-principles-python.md`. The following Pydantic
model hierarchy must be implemented:

- `BaseLLMConfig` — `PROVIDER`, `BASE_URL`, `MODEL`
- `OCRQualityScoringConfig` — `CONFIDENCE_WEIGHT`, `DENSITY_WEIGHT`
- `OCRConfig` — `PROVIDER`, `QUALITY_THRESHOLD`, `QUALITY_SCORING` (`OCRQualityScoringConfig`)
- `LLMConfig(BaseLLMConfig)` — `CHUNKING_MIN_TOKENS`, `CHUNKING_MAX_TOKENS`
- `EmbeddingConfig(BaseLLMConfig)` — `DIMENSION`
- `MetadataPatternsConfig` — `DOCUMENT_TYPE`, `DATES`, `PEOPLE`, `ORGANISATIONS`, `LAND_REFERENCES`, `DESCRIPTION` (each `list[str]`)
- `MetadataCompletenessWeights` — same six fields as `float`
- `MetadataConfig` — `PATTERNS`, `COMPLETENESS_THRESHOLD`, `COMPLETENESS_WEIGHTS`
- `PipelineConfig` — `RUNNING_STEP_TIMEOUT_MINUTES`
- `ProcessingConfig` — `OCR`, `LLM`, `EMBEDDING`, `METADATA`, `PIPELINE`
- `VectorSearchConfig` — `TOP_K`
- `ContextAssemblyConfig` — `TOKEN_BUDGET`, `INCLUDE_PARENT_METADATA`
- `SynthesisConfig` — `LLM` (`BaseLLMConfig`), `CITATION_FIELDS`
- `QueryConfig` — `ROUTER`, `LLM` (`BaseLLMConfig`), `VECTOR_SEARCH`, `CONTEXT_ASSEMBLY`, `SYNTHESIS`
- `AuthConfig` — `INBOUND_KEY`, `EXPRESS_KEY`
- `ServiceHTTPConfig` — `RETRY_COUNT`, `RETRY_DELAY_MS`
- `ServiceConfig` — `EXPRESS_BASE_URL`, `HTTP` (`ServiceHTTPConfig`)
- `AppConfig` — `PROCESSING` (`ProcessingConfig`), `QUERY` (`QueryConfig`), `AUTH` (`AuthConfig`), `SERVICE` (`ServiceConfig`)

The singleton must be importable from all other modules as `from shared.config import config`.

**Depends on**: Task 1

**Complexity**: S

**Acceptance condition**: A pytest unit test in `tests/shared/test_config.py` confirms: (1)
valid `settings.json` produces a populated `AppConfig` instance with correct types; (2) a
missing required field (`AUTH.INBOUND_KEY`) causes a Pydantic `ValidationError` at load time;
(3) a `IK_AUTH__INBOUND_KEY` environment variable overrides the file value. All three
assertions pass.

**Condition type**: automated

**Status**: done

**Verification** (2026-03-31):

- Automated checks: confirmed — all three conditions covered by falsifiable tests in
  `tests/shared/test_config.py`. (1) `test_singleton_config_spot_check` asserts two values
  from the live `AppConfig` singleton, reaching three levels of nesting; both values match
  `settings.json`. (2) `test_config_missing_attribute` loads a fixture file that omits
  `AUTH.INBOUND_KEY` and asserts `pydantic.ValidationError` is raised. (3)
  `test_config_env_var_override` sets `IK_AUTH__INBOUND_KEY` via `monkeypatch` and asserts the
  override is reflected; the `UPPER_SNAKE_CASE` key convention makes the Dynaconf
  double-underscore mapping direct with no normalisation step required.
- Manual checks: none required
- User need: satisfied — US-096 (provider abstraction, runtime selection via config) and
  US-097 (all operational values from external file, not hardcoded) are both addressed. The
  base `settings.json` file carries all operational values; `settings.override.json` and
  `IK_`-prefixed environment variables provide the runtime override path. Pydantic validation
  at startup satisfies the fail-fast requirement. No gap between acceptance condition and user
  need.
- Outcome: done

---

### Task 3: HTTP client (`shared/http_client.py`)

**Description**: Implement `services/processing/shared/http_client.py` — the single HTTP
client for all outbound Express calls.

Requirements:

- Use `httpx` (sync or async consistent with the FastAPI pattern chosen in Task 18)
- Read `AUTH.EXPRESS_KEY` from the config singleton and add it as the `x-internal-key` header
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
  `SERVICE.HTTP.RETRY_COUNT` times, with `SERVICE.HTTP.RETRY_DELAY_MS` delay between retries
- Raise a typed `ExpressCallError` (define this exception class in the same file) on
  non-2xx responses that exhaust retries or on non-retryable errors (4xx)

All other files in the service must call Express exclusively through this client. No raw HTTP
calls are permitted elsewhere.

**Depends on**: Task 2

**Complexity**: S

**Acceptance condition**: A pytest unit test in `tests/shared/test_http_client.py` confirms:
(1) the `x-internal-key` header is added to every outgoing request using the value from
config; (2) a request body with Python snake_case keys is serialised to camelCase JSON before
sending; (3) on a simulated 503 response the client retries up to `RETRY_COUNT` times before
raising `ExpressCallError`; (4) on a simulated 401 response the client raises `ExpressCallError`
immediately (no retry). All assertions use mocked HTTP transport — no live Express server is
required.

**Condition type**: automated

**Status**: done

**Verification** (2026-04-01):

- Automated checks: confirmed — all four conditions covered by falsifiable tests in
  `tests/shared/test_http_client.py`, all using `respx` mocked transport with no live
  Express server.
  (1) `test_auth_header` asserts `request.headers["x-internal-key"] == config.AUTH.EXPRESS_KEY`;
  the header is set at `httpx.AsyncClient` construction so it is present on every request.
  (2) `test_serialization_snake_to_camel` asserts `request_body["topK"] == 5` and
  `"top_k" not in request_body`; serialisation is handled by `ApiSearchVectorPostRequest`
  Pydantic model and `model_dump(mode="json")`.
  (3) `test_fail_on_multiple_5xx` mocks infinite 503 responses via `itertools.repeat`,
  asserts `respx_mock.calls.call_count == config.SERVICE.HTTP.RETRY_COUNT` and
  `exc_info.value.status_code == 503`; `RETRY_COUNT` is constrained `>= 1` by
  `Annotated[int, Field(ge=1)]` in `ServiceHTTPConfig`, ruling out the implicit-None
  return path at config load time.
  (4) `test_4xx_immediate_return` asserts `call_count == 1` and
  `exc_info.value.status_code == 401`; the adapter raises immediately for any
  `status_code < 500`.
- Manual checks: none required
- User need: satisfied — US-096 (provider abstraction, runtime config selection) is met by
  the `HttpClientBase` ABC in `shared/interfaces/`, the concrete `HttpClient` adapter, and
  the `create_http_client` factory returning the interface type (ADR-044). US-097 (all
  operational values from external config) is met by reading `RETRY_COUNT` and
  `RETRY_DELAY_MS` from the Dynaconf/Pydantic config singleton — no retry values are
  hardcoded. No gap between acceptance condition and user need.
- Outcome: done

---

### Task 4: Auth middleware (`app.py` — inbound key validation)

**Description**: Implement the FastAPI auth middleware in `services/processing/app.py` that
validates the `x-internal-key` header on every route.

The middleware reads the expected key from `AUTH.INBOUND_KEY` in the config singleton. If the
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

**Status**: done

**Verification** (2026-04-02):

- Automated checks: confirmed — all five conditions covered by falsifiable tests in
  `tests/test_app.py`, all using `httpx.AsyncClient` with `httpx.ASGITransport(app=app)`.
  (1) `test_health_route_no_auth` — GET /health with no auth header → 200 + `{"status": "ok"}`;
  the middleware bypasses `/health` via explicit path check before any key validation.
  (2) `test_api_success_with_auth` — POST /process with correct `x-internal-key` → 501 +
  `{"detail": "Not implemented"}`; middleware passes through; stub raises `HTTPException(501)`.
  (3) `test_api_process_fail_with_wrong_auth` — POST /process, wrong key → 401; the `elif`
  branch returns `JSONResponse(status_code=401)` on value mismatch.
  (4) `test_api_process_fail_with_no_auth` — POST /process, no header → 401; the
  `"x-internal-key" not in request.headers` check fires before the value comparison.
  (5) `test_api_query_fail_with_no_auth` — POST /query, no header → 401; the same middleware
  applies to all non-health routes. All assertions are falsifiable: disabling the middleware
  would cause tests 3, 4, and 5 to return 501 instead of 401.
- Manual checks: none required
- User need: satisfied — ADR-044 requires shared-key auth on all Python inbound routes; every
  POST route is gated, the health probe is correctly exempted, and the key is sourced from
  `config.AUTH.INBOUND_KEY` (not hardcoded), satisfying US-097. No gap between acceptance
  condition and user need.
- Outcome: done

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

**Status**: done

**Verification** (2026-04-02):

- Automated checks: confirmed. `tests/pipeline/test_ocr_extraction.py` contains three
  `@pytest.mark.ci_integration` tests covering all stated conditions: (1)
  `test_docling_ocr_service_instantiation` monkeypatches `PROVIDER` to `"docling"` and
  asserts `isinstance(adapter, OCRService)` and `isinstance(adapter, DoclingAdapter)` —
  Python's ABC machinery would raise `TypeError` at instantiation if any abstract method were
  missing, so a passing `isinstance` check is a genuine confirmation that the interface is
  fully implemented; (2) `test_tesseract_ocr_service_instantiation` covers the `"tesseract"`
  case in the same way; (3) `test_unknown_ocr_service_instantiation` monkeypatches `PROVIDER`
  to `"unknown"` and asserts `ValueError` with the exact message
  `"unknown is not a supported OCR Provider"` — the assertion is falsifiable. All three tests
  use monkeypatched config values; no real document files are required.
- Manual checks: none required.
- User need: satisfied. US-028 requires text extraction from Phase 1 document types (PDF,
  TIFF, JPEG, PNG) via OCR. This task establishes the `OCRService` interface layer — the ABC,
  both adapters (DoclingAdapter for PDF/PNG/JPG/TIFF; TesseractAdapter for PNG/JPG/TIFF/JPEG),
  and the config-driven factory — which is the architectural prerequisite for the extraction
  step (Task 6). The `OCRResult` return type correctly carries per-page text and confidence
  fields. Provider selection from `ocr.provider` config satisfies the Infrastructure as
  Configuration principle. No gap between acceptance condition and user need.
- Outcome: done

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
3. For individual page extraction failures (non-catastrophic): the adapter catches the
   exception internally, logs it, and substitutes empty text with confidence 0.0 for the
   failed page before returning a complete `OCRResult`. The step does not see a per-page
   exception — it only sees the assembled result. An image-only page (no extractable text)
   and a page that failed during extraction are treated identically at the step level: both
   appear as empty strings in `text_per_page` and flow into the catastrophic checks.
4. If the file cannot be opened at all: return step status `failed` with an error message
   (UR-068/UR-069/US-049 — retry logic is Express's responsibility via `attempt_count` in
   `pipeline_steps`; Python does not carry a retry flag)

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

**Status**: done

**Verification** (2026-04-03):

- Automated checks: confirmed — all four cases are covered by separate, falsifiable test
  functions in `tests/pipeline/test_ocr_extraction.py`, each marked `@pytest.mark.ci_integration`:
  (1) `test_zero_page_document_extraction` asserts `step_status == "completed"` and
  `document_flags[0].type == "extraction_failure"` with the exact reason string;
  (2) `test_empty_pages_extraction` asserts the same flag type with reason `"No extractable
  text from any page"`; (3) `test_empty_partial_extraction` asserts `type == "partial_extraction"`
  and `reason == "Pages [1, 3] returned no text"` (zero-text pages named); (4)
  `test_file_open_error` asserts `step_status == "failed"` and a non-empty `error_message`.
  Mock helpers correctly live in `tests/fakes/ocr_service.py` per the fakes convention.
- Manual checks: none required
- User need: satisfied — US-031 (no fail-fast: all pages evaluated via `all()`/`any()`);
  US-033 (all-empty: `step_status="completed"` retains the document with an
  `extraction_failure` flag); US-034 (partial: `partial_extraction` flag names the empty pages);
  US-035 (zero-page: `extraction_failure` flag with zero-pages reason); US-049 (technical
  failure: `step_status="failed"` delegates retry responsibility to Express via
  `attempt_count` — the task description states this split explicitly).
- Outcome: done

**OQ-T6-001: Page-level extraction outcome disambiguation**

The current spec does not distinguish between three distinct cases that can produce a page
with no text in `text_per_page`:

- **Case A — Image-only page**: the adapter successfully processed the page but it contains
  no extractable text (e.g. a scanned photograph or diagram). Expected behaviour, not an error.
- **Case B — Page extraction error**: the adapter encountered an exception on a specific page
  (e.g. the page is corrupt or malformed within an otherwise valid file). An adapter-level
  failure on one page, not a file-level failure.
- **Case C — File opens but yields no usable data**: the file is accessible but the adapter
  cannot extract anything meaningful — beyond what is already covered by the zero-pages and
  all-empty catastrophic checks.

Questions requiring resolution before the `PageExtractionError` handler and tests are finalised:

1. Should Case A (image page) and Case B (page error) produce the same flag type and reason,
   or should they be distinguished in the `DocumentFlag`?
2. Should Case B result in `step_status="completed"` (partial result returned) or
   `step_status="failed"` (retry on next trigger)?
3. Is Case C distinct from the zero-pages and all-empty checks already in the spec, or is it
   fully covered by those?
4. How should adapters signal the difference between Case A and Case B — by returning empty
   text (Case A) or raising `PageExtractionError` (Case B)?

---

### Task 7: `TextQualityScorer` interface and implementation (Step 2)

**Description**: Implement the text quality scoring step.

Files to create or edit:

- `services/processing/settings.json` — add `TARGET_CHARS_PER_PAGE: 1800` under
  `PROCESSING.OCR.QUALITY_SCORING`
- `shared/config.py` — add `TARGET_CHARS_PER_PAGE: Annotated[int, Field(gt=0)]` to
  `OCRQualityScoringConfig`
- `pipeline/interfaces/text_quality_scorer.py` — `TextQualityScorer` abstract base class with:
  - `score(text_per_page: list[str], confidence_per_page: list[float]) -> QualityResult`
    (abstract)
  - `QualityResult` dataclass: `per_page_scores: list[float]`, `document_score: float`,
    `passed_threshold: bool`, `failing_pages: list[int]` (1-indexed page numbers below
    threshold)
- `pipeline/steps/text_quality_scoring.py` — `WeightedTextQualityScorer` (no separate factory
  needed — this is the only Phase 1 implementation). The scoring formula:
  - Per-page score = OCR confidence (converted to 0–100) multiplied by
    `PROCESSING.OCR.QUALITY_SCORING.CONFIDENCE_WEIGHT`, added to the text density score (characters per
    page scaled to 0–100) multiplied by `PROCESSING.OCR.QUALITY_SCORING.DENSITY_WEIGHT`. Text density
    score = `min(len(text_per_page[i]) / TARGET_CHARS_PER_PAGE, 1.0) × 100` where
    `TARGET_CHARS_PER_PAGE` is read from `PROCESSING.OCR.QUALITY_SCORING.TARGET_CHARS_PER_PAGE`
    in config (default: 1800).
  - Document score = average of per-page scores
  - A page fails if its score is below `PROCESSING.OCR.QUALITY_THRESHOLD`
  - All weights, threshold, and `TARGET_CHARS_PER_PAGE` are read from config — no hardcoded values
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

**Status**: done

**Verification** (2026-04-07):

- Automated checks: confirmed — all four acceptance conditions covered by falsifiable Tier 1 unit tests in `tests/pipeline/test_text_quality_scoring.py`. (1) `test_all_pages_pass_threshold`: three pages at full confidence and density above threshold 50; asserts `passed_threshold is True` and `failing_pages == []`. (2) `test_single_page_below_threshold`: page 2 scores 10 (confidence 0.1, density 10%), below threshold 50; asserts `failing_pages == [2]`. (3) `test_all_pages_scored_no_early_exit`: pages 2 and 3 both fail; asserts `failing_pages == [2, 3]` — an early exit after page 2 would produce `[2]` only. (4) `test_document_score_is_arithmetic_mean`: manually computes expected mean from first principles; asserts `result.document_score == pytest.approx(...)`. All tests are Tier 1 (no `ci_integration` marker). B-001 from round 1 (missing `Field(gt=0)` on `TARGET_CHARS_PER_PAGE`) confirmed resolved in `shared/config.py`. `settings.json` contains `TARGET_CHARS_PER_PAGE: 1800` under `PROCESSING.OCR.QUALITY_SCORING`.
- Manual checks: none required
- User need: satisfied — US-036/UR-051 requires every failing page to be identified in the flag reason. `WeightedTextQualityScorer` accumulates 1-indexed page numbers in `failing_pages` across all pages with no early exit, producing the complete list the orchestrator needs to construct the flag. The user need is met at this layer.
- Outcome: done

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
as empty/None; (3) a malformed regex pattern in config causes `RegexPatternExtractor` to raise
`re.error` (the orchestrator catches this and records step status `failed` — the adapter's
responsibility is to propagate the exception, not to return a step status). Tests do not
depend on OQ-4 decisions — they use test-specific inline pattern strings.

**Condition type**: automated

**Status**: done

**Verification** (2026-04-09):

- Automated checks: confirmed — all three conditions met. `test_date_pattern_match` (line 46) asserts a configured slash-date pattern returns `dates[0] == "22/03/1923"` (falsifiable). `test_no_matches` (line 70) asserts all list fields empty, both `str | None` fields `None`, and all six confidence values `0.0` when no patterns are configured (comprehensive and falsifiable). `test_malformed_regex` (line 87) asserts `pytest.raises(re.PatternError)` on `"["` input; `re.PatternError` is `re.error` in Python 3.12+, matching the spec exactly.
- Manual checks: none required
- User need: satisfied — US-037 requires automatic detection of document type, dates, people, organisations, and description. `MetadataResult` covers all five fields (plus `land_references` and `detection_confidence`). `RegexPatternExtractor` applies config-driven patterns, deduplicates matches, and sets per-field confidence. The description overwrite precedence rule is correctly deferred to the orchestrator. `create_metadata_extractor` selects the adapter from config, consistent with the Infrastructure as Configuration principle.
- Outcome: done

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
  - All weights and `PROCESSING.METADATA.COMPLETENESS_THRESHOLD` are read from config
  - `passed_threshold = score >= PROCESSING.METADATA.COMPLETENESS_THRESHOLD`
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

**Status**: done

**Verification** (2026-04-11):

- Automated checks: confirmed — all four required tests present and falsifiable. `test_all_fields_populated` asserts `score == pytest.approx(100.0)` and `passed_threshold is True`. `test_no_fields_populated` asserts `score == pytest.approx(0.0)` and `passed_threshold is False`. `test_populated_fields_above_threshold` asserts `score == pytest.approx(65.0)` and `passed_threshold is True` (arithmetic verified: (0.2+0.15+0.15+0.15)/1.0*100 = 65.0). `test_populated_fields_below_threshold` asserts `score == pytest.approx(35.0)` and `passed_threshold is False` (arithmetic verified: (0.2+0.15)/1.0*100 = 35.0). All tests use inline weights via a `make_weighted_field_presence_scorer()` factory — no OQ-4 dependency. No `@pytest.mark.ci_integration` markers on Tier 1 tests. No implicit truthiness (explicit `is not None and value != ""` for scalars; `len(value) > 0` for lists).
- Manual checks: none required
- User need: satisfied — US-038/UR-054 requires metadata completeness to be assessed independently of text quality with its own configurable threshold. `WeightedFieldPresenceScorer` shares no code with `WeightedTextQualityScorer`; threshold is read from config (`COMPLETENESS_THRESHOLD`); the scorer produces a `CompletenessResult` the orchestrator uses independently of any text quality result.
- Outcome: done

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
  Ollama HTTP API at `PROCESSING.LLM.BASE_URL` with model `PROCESSING.LLM.MODEL`. Constructs the combined-pass
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

**Status**: done

**Verification** (2026-04-12):

- Automated checks: confirmed — all four conditions covered by tests in
  `tests/pipeline/test_llm_combined_pass.py`.
  (1) `test_valid_json_response` — respx-mocked well-formed Ollama response parsed into
  `LLMCombinedResult`; field-level assertions on chunks, metadata_fields, entities, and
  relationships all pass.
  (2) `test_malformed_json_response_returns_none` — `"not json"` string causes
  `json.JSONDecodeError`, caught by adapter, returns `None`. The acceptance condition text
  says "return status `failed`" — the code review (round 4) correctly identifies this as the
  pipeline-step level contract (Task 11); the adapter contract is `None`. Test accurately
  validates the adapter boundary.
  (3) `test_missing_response_field_returns_none` — response JSON omits the required `chunks`
  field; Pydantic `ValidationError` is raised and caught; `None` returned. Confirmed.
  (4) `test_llm_service_creates_ollama_service` — `create_llm_service` with
  `PROVIDER="ollama"` returns an `OllamaLLMAdapter` instance confirmed via `isinstance`.
  Test is correctly unmarked (Tier 1, no network calls).
- Manual checks: none required
- User need: satisfied — the `LLMService` ABC provides the shared interface required by both
  pipeline and query modules (ADR-042 boundary); `OllamaLLMAdapter` implements it with
  structured JSON parsing and safe error handling; `create_llm_service()` factory enables
  config-driven provider selection (ADR-038).
- Pending PM note: plan description omits `organisations` from the `metadata_fields` prose.
  The implementation correctly includes it in the prompt (adapter line 109) and in the test
  fixture. `metadata_fields` is typed `dict[str, Any]` — deliberately unstructured in Phase 1
  per ADR-036. The omission in the plan is a prose gap only; no implementation item is
  missing and no acceptance condition is unmet. No action required.
- Outcome: done

---

### Task 11: LLM combined pass step — chunk post-processing (`pipeline/steps/llm_combined_pass.py`)

**Description**: Implement the pipeline step file `pipeline/steps/llm_combined_pass.py` that
wraps the `LLMService.combined_pass()` call and applies chunk post-processing.

After receiving `LLMCombinedResult` from the adapter, the step applies:

1. **Merge**: any chunk with `token_count < PROCESSING.LLM.CHUNKING_MIN_TOKENS` is merged with an adjacent
   chunk (prefer next; if last chunk, merge with previous)
2. **Split**: any chunk with `token_count > PROCESSING.LLM.CHUNKING_MAX_TOKENS` is split on paragraph
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
as Task 10 tests) confirm: (1) a chunk below `CHUNKING_MIN_TOKENS` is merged with the next
chunk to form one chunk; (2) a chunk above `CHUNKING_MAX_TOKENS` is split into two or more
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
  `EmbeddingService`. Calls the Ollama embeddings API at `PROCESSING.EMBEDDING.BASE_URL` with model
  `PROCESSING.EMBEDDING.MODEL`. Validates that the returned vector length matches `PROCESSING.EMBEDDING.DIMENSION`
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

Config keys used: `QUERY.LLM.PROVIDER`, `QUERY.LLM.BASE_URL`, `QUERY.LLM.MODEL`.

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

Config keys: `QUERY.CONTEXT_ASSEMBLY.TOKEN_BUDGET`, `QUERY.CONTEXT_ASSEMBLY.INCLUDE_PARENT_METADATA`

When `INCLUDE_PARENT_METADATA` is True, the document-level metadata fields (description, date,
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

**Note**: Python Chore 1 (config narrowing) should be completed before this task. Chore 1
changes the signatures of `create_http_client`, `create_ocr_service`, and their adapters —
doing it after this task would require revisiting the lifespan wiring immediately.

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
- `target-version` set to match the Python version in `services/processing/.python-version`
  (created by Platform Engineer in Phase 1 scaffolding — this is the canonical version
  reference for Ruff, the Dockerfile, and CI)

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

---

## Python Chores

### Chore 1: Narrow `AppConfig` to sub-configs in existing adapters and factories

**Description**: The config narrowing rule (added to `development-principles-python.md` during
Task 10) requires that adapters and concrete implementations accept only the sub-config they
need, with factories doing the narrowing before passing config down. The following files were
written before the rule existed and violate it:

- `shared/adapters/http_client.py` — `HttpClient.__init__` accepts `AppConfig`; should accept
  `ServiceConfig` and `AuthConfig` (it needs `SERVICE.HTTP.*` for retry logic and
  `AUTH.EXPRESS_KEY` for the auth header)
- `shared/factories/http_client.py` — passes full `AppConfig`; should narrow to
  `config.SERVICE` and `config.AUTH` before calling the adapter
- `pipeline/adapters/docling_ocr.py` — `DoclingAdapter.__init__` accepts `AppConfig`; should
  accept `OCRConfig`
- `pipeline/adapters/tesseract_ocr.py` — `TesseractAdapter.__init__` accepts `AppConfig`;
  should accept `OCRConfig`
- `pipeline/factories/ocr_factory.py` — passes full `AppConfig` to adapters; should narrow to
  `config.PROCESSING.OCR` before calling each adapter

**Depends on**: None

**Recommended sequencing**: Complete before Task 18 (orchestrator). Task 20 (`app.py` lifespan
wiring) calls all factories — doing this chore after Task 20 would require immediately
revisiting `app.py` again.

**Complexity**: S

**Acceptance condition**: All five files updated so that adapters receive only the sub-config
they require; factories narrow before passing; `ruff check services/processing/` passes;
`python3 -m pytest services/processing/tests/ -m ci_integration` passes with no regressions.

**Condition type**: automated

**Status**: not_started
