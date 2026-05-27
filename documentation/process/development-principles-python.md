# Development Principles — Python Service

This file covers Python-specific implementation patterns for `services/processing/`.
Read it alongside `development-principles.md` (universal principles), which defines the
principles that apply across all services.

---

## Module Boundary (ADR-042)

The Python service enforces a strict internal module boundary:

```text
services/processing/
├── pipeline/   # C2 — OCR, quality scoring, LLM combined pass, embedding generation
├── query/      # C3 — query understanding, vector search, context assembly, response synthesis
└── shared/     # Shared utilities only — EmbeddingService, HTTP client, config loading
```

- `pipeline/` and `query/` must not import from each other
- Both may import from `shared/`
- `shared/` must not import from `pipeline/` or `query/`

---

## Package Structure — `__init__.py` Placement

The Python service is run with uvicorn from `services/processing/` as the working directory.
It is not installed as a pip package.

- `services/processing/` itself: **no `__init__.py`** — it is the project root, not a package
- Every directory that contains importable Python modules: **yes `__init__.py`**
  - `pipeline/`, `query/`, `shared/` and all their subdirectories
  - `tests/` and all its subdirectories (avoids pytest import ambiguity)
- `fixtures/`: **no `__init__.py`** — it holds documents and JSON, not Python modules

`__init__.py` files are empty markers unless the package warrants a module docstring
(e.g. `shared/generated/__init__.py` cites ADR-048).

---

## Technology Constraints

These are confirmed decisions — do not propose alternatives:

- Language: Python 3.13+ with type annotations; no untyped functions
- Configuration: Dynaconf + Pydantic (see `configuration-patterns.md` skill); no hardcoded values
- Framework: FastAPI for the HTTP server
- HTTP client (calls to Express): `httpx`; authenticated with shared-key header per ADR-044
- Linting and formatting: `ruff` (analogous to Biome on the TypeScript services)
- Testing: `pytest` with `respx` for HTTP mocking

---

## Dependency Composition Pattern

Dependencies are composed at startup in `app.py` using FastAPI's `lifespan` context manager
and then narrowed as they are passed down. Each route receives only the interface it actually
uses, injected via `Depends()`.

**Startup sequence** (`app.py`):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    config = load_config()
    log = create_logger(config)
    http_client = create_http_client(config, log)
    ocr = create_ocr_service(config, log)
    llm = create_llm_service(config, log)
    embedding = create_embedding_service(config, log)
    pipeline = create_pipeline_service(config, ocr, llm, embedding, http_client, log)
    query = create_query_service(config, embedding, http_client, log)
    app.state.deps = AppDeps(config=config, pipeline=pipeline, query=query, log=log)
    yield
    await http_client.aclose()
```

**Narrowing rule**: route functions receive one service, not `AppDeps`.

```python
# Correct — route receives only what it needs
async def process_document(
    body: ProcessRequest,
    service: PipelineService = Depends(get_pipeline_service),
) -> ProcessResponse: ...

# Wrong — do not pass the full dep bag to a route
async def process_document(
    deps: AppDeps = Depends(get_deps),
) -> ProcessResponse: ...
```

**Factory structure**: concrete implementations live in `adapters/`; abstract base classes live
in `interfaces/`; factory functions live in `factories/`. Factory functions select the concrete
implementation from config — application code depends only on the abstract interface.

```python
# factories/ocr.py
def create_ocr_service(config: Config, log: Logger) -> OCRService:
    if config.ocr.provider == "docling":
        return DoclingAdapter(config.ocr, log)
    if config.ocr.provider == "tesseract":
        return TesseractAdapter(config.ocr, log)
    raise ValueError(f"Unknown OCR provider: {config.ocr.provider}")
```

**Config narrowing rule**: every component — factory or adapter — accepts only the narrowest
config it actually needs. Narrowing happens at the call site (the composition root or wiring
layer) before the factory is called. Factories accept the sub-config their provider decision
requires; adapters accept the sub-config their implementation requires. Neither should accept
`AppConfig` just to dig into it — that is a form of config-bag coupling and violates the
Principle of Least Knowledge.

```python
# Correct — call site narrows; factory and adapter each receive only what they need
llm_service = create_llm_service(config=app_config.PROCESSING.LLM, log=log)

def create_llm_service(config: LLMConfig, log: Logger) -> LLMService:
    if config.PROVIDER == "ollama":
        return OllamaLLMAdapter(config=config, log=log)
    raise ValueError(f"{config.PROVIDER} is not a supported LLM provider")

class OllamaLLMAdapter(LLMService):
    def __init__(self, config: LLMConfig, log: Logger) -> None: ...

# Wrong — factory or adapter accepts the full config bag
def create_llm_service(config: AppConfig, log: Logger) -> LLMService: ...
class OllamaLLMAdapter(LLMService):
    def __init__(self, config: AppConfig, log: Logger) -> None: ...
```

---

## Pipeline Step Structure

Files in `pipeline/steps/` follow one of two structures depending on whether the step has
multiple implementations:

**Module-level function** — when the step calls an injected service and handles its
outcomes (the step itself is not the implementation):

```python
# pipeline/steps/ocr_extraction.py
def run_ocr_extraction(
    file_path: str, ocr_service: OCRService, log: structlog.BoundLogger
) -> ExtractionResult:
    ...
```

The function receives its service dependency as a plain parameter — no class required.

**Class implementing an interface** — when the step IS the implementation and may have
alternatives in future phases (the class is selected by a factory or composed directly):

```python
# pipeline/steps/text_quality_scoring.py
class WeightedTextQualityScorer(TextQualityScorer):
    def __init__(self, config: OCRConfig) -> None: ...
    def score(self, text_per_page: list[str], ...) -> QualityResult: ...
```

The distinction: a step runner *orchestrates* a service call and handles its outcomes; a
step implementation *is* the logic. When in doubt, check whether an ABC exists for the
step — if it does, the step should be a class implementing it.

---

## Service Pattern

Services are classes instantiated by factory functions. The factory accepts injected
dependencies; the class methods close over them.

```python
# interfaces/pipeline_service.py
class PipelineService(ABC):
    @abstractmethod
    async def process(self, request: ProcessRequest) -> ServiceResult[ProcessResponse]: ...

# pipeline/pipeline_service.py
class PipelineServiceImpl(PipelineService):
    def __init__(self, ocr: OCRService, llm: LLMService, http: HttpClient, log: Logger):
        self._ocr = ocr
        self._llm = llm
        self._http = http
        self._log = log

    async def process(self, request: ProcessRequest) -> ServiceResult[ProcessResponse]:
        ...

def create_pipeline_service(
    ocr: OCRService, llm: LLMService, http: HttpClient, log: Logger
) -> PipelineService:
    return PipelineServiceImpl(ocr, llm, http, log)
```

**Rules**:

- Methods return `ServiceResult[T]` for all expected outcomes — never raise for domain errors
  such as "document not found" or "unsupported file type". Raising is reserved for genuinely
  unexpected failures (network unreachable, programming error). See `serviceResult.py` in
  `shared/`.
- Services have no knowledge of FastAPI (`Request`, `Response` are route-layer concerns).
- The exported abstract base class is what callers depend on; the concrete implementation is
  an internal detail.

---

## HTTP Client Pattern (ADR-044)

All outbound calls to Express go through the `HttpClientBase` interface. No other file may
call Express directly.

**Required file layout**:

- `shared/interfaces/http_client.py` — `HttpClientBase` ABC defining all public methods
- `shared/adapters/http_client.py` — `HttpClient` concrete implementation; also defines `ExpressCallError`
- `shared/factories/http_client.py` — `create_http_client(config, log) -> HttpClientBase` factory

Application code depends only on `HttpClientBase`. The factory return type is the interface,
not the concrete class. This allows the HTTP adapter to be swapped for an RPC or other
transport without changing any consumer.

```python
# shared/interfaces/http_client.py
class HttpClientBase(ABC):
    @abstractmethod
    async def post_processing_results(self, payload: ApiProcessingResultsPostRequest) -> ApiProcessingResultsPostResponse: ...

    @abstractmethod
    async def vector_search(self, embedding: list[float], top_k: int) -> ApiSearchVectorPostResponse: ...

    @abstractmethod
    async def aclose(self) -> None: ...
```

- The client adds the `x-internal-key` header automatically on every request (ADR-044)
- On 4xx responses the client raises `ExpressCallError` with the status and body immediately (no retry)
- On 5xx or network errors the client retries up to `config.SERVICE.HTTP.RETRY_COUNT` times before
  raising `ExpressCallError`
- Response bodies are parsed into generated Pydantic models from `shared/generated/`

**Generated models** (Task 0): Pydantic v2 models generated from the Express `/openapi.json`
spec via `datamodel-codegen`. Committed to the repo. Re-generate whenever
`packages/shared/src/schemas/` changes. Never hand-write models that duplicate what the
generator produces.

---

## Testing Strategy — Three Tiers

This is a specialisation of the universal Test Early principle (see `development-principles.md`),
including its corollary: test the public interface, not internal helpers.

The Python service has no direct database connection (ADR-031 — Express is the sole DB writer).
All external I/O is either Express HTTP calls or AI service calls (OCR, LLM, embeddings).
This shapes the test tiers:

### Tier 1 — Unit tests (run everywhere, including CI)

Cover standalone pure functions only — functions that take inputs and return outputs with no
I/O of any kind. Examples: text normalisation, chunking logic, metadata parsing, completeness
scoring arithmetic.

The test must call the function directly. If reaching the logic under test requires constructing
a service or mocking a dependency, it is not a unit test — write a Tier 2 test instead.

Tier 1 tests must not carry `@pytest.mark.ci_integration` — they run unconditionally
everywhere. The marker is reserved for Tier 2. Use `tests/pipeline/test_text_quality_scoring.py`
as the reference for what an unmarked Tier 1 test file looks like.

### Tier 2 — CI integration tests (run in CI; no external services required)

Cover service wiring, data flow, and HTTP contract compliance. Express calls are intercepted
by `respx` at the `httpx` transport layer and return pre-canned responses. OCR, LLM, and
embedding calls are replaced with fakes injected at the factory boundary.

```python
# Example — respx mock for an Express call
import respx
import httpx

@respx.mock
async def test_pipeline_posts_results():
    respx.post("http://localhost:3001/api/processing/results").mock(
        return_value=httpx.Response(200, json={"status": "ok"})
    )
    result = await pipeline_service.process(make_request())
    assert result.outcome == "success"
```

**Why mocked Express responses still provide confidence**: the mock responses are parsed
through the generated Pydantic models from `shared/generated/`. If the Express schema changes
and the models are regenerated, a mock that returns a now-invalid shape will fail at the
Pydantic parse step — catching contract drift at CI time without requiring Express to run.

Fake implementations of `OCRService`, `LLMService`, and `EmbeddingService` live in
`tests/fakes/`. They implement the abstract base class interface and return deterministic
fixture outputs.

Mark Tier 2 tests with `@pytest.mark.ci_integration`. Register the marker in `pytest.ini`.
They run by default in CI alongside unit tests.

### Tier 3 — Full integration tests (local only; requires Ollama and Docling)

Exercise the real Docling OCR adapter, the real Ollama LLM adapter, and the real embedding
model against fixture documents from `fixtures/`. These tests validate the quality and shape
of real AI outputs, not just the wiring.

Mark with `@pytest.mark.integration`. Excluded from CI (FLAG-03). Run locally before
closing tasks that involve OCR, LLM, or embedding logic.

**There is no shortcut tier**: calling a service method directly with a fake dependency bag
is a Tier 2 test, not a unit test. The distinction matters — Tier 1 tests must run in
milliseconds with zero I/O; Tier 2 tests may be slower but require no running services.

### Async tests — `asyncio_mode = auto`

`pytest.ini` sets `asyncio_mode = auto`. This means `async def test_...()` functions
run without `@pytest.mark.asyncio`. Do not add that marker — it is redundant and
inconsistent with the rest of the test suite. Write async tests as plain `async def`.

### Guarding possibly-`None` results in tests

When a function under test can return `None` on failure, guard the assertion with
`pytest.fail()` rather than chaining assertions on a possibly-None value. This gives a
clear failure message and avoids mypy warnings:

```python
# Correct
result = run_llm_combined_pass(...)
if result is None or result.result is None:
    pytest.fail("step returned no result")
assert result.step_status == "completed"

# Wrong — opaque AttributeError if result is None
assert result.step_status == "completed"
```

### `conftest.py` — structlog silencing

`tests/conftest.py` configures structlog to suppress all output during tests:

```python
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(0),
    logger_factory=structlog.PrintLoggerFactory(),
)
```

This runs once at session start and applies to all tests. Do not replicate this in
individual test files or fixtures — it already exists in `conftest.py` and covers the
entire test session.

### Test-local `make_<thing>()` factory functions

For constructing instances under test with specific configurations, use a module-level
factory function in the test file rather than a pytest fixture:

```python
# Correct — explicit, readable, no conftest navigation needed
def make_scorer(threshold: float, confidence_weight: float, ...) -> WeightedTextQualityScorer:
    config = OCRConfig(QUALITY_THRESHOLD=threshold, ...)
    return WeightedTextQualityScorer(config)

def test_single_page_below_threshold() -> None:
    scorer = make_scorer(threshold=50, confidence_weight=0.5, density_weight=0.5)
    ...
```

Use conftest fixtures for setup that is shared *across test files* (e.g. the `http_client`
fixture, the structlog silencing). Use local `make_<thing>()` functions for construction
that is specific to one test file. This keeps test setup readable without requiring readers
to navigate to `conftest.py`.

### Coverage exclusion for interfaces and generated code

`pyproject.toml` excludes `**/interfaces/*` and `*/shared/generated/*` from coverage
measurement. ABCs in `interfaces/` are never directly instantiated so coverage of them is
meaningless; generated code in `shared/generated/` is owned by the generator. Do not add
`# pragma: no cover` to individual methods in those directories — exclusion is handled at
the project level.

---

## Logging Standard

Use `structlog` for all logging. Output is structured JSON, analogous to Pino on the backend.
No `print()` statements in application code.

| Level | When to use | Examples |
| --- | --- | --- |
| `info` | State changes meaningful to operators | Document processing started/completed, query received |
| `debug` | Internal operations that aid debugging | OCR step duration, chunk count, embedding dimension |
| `warn` | Recoverable unexpected conditions | Fallback taken, retrying after transient error |
| `error` | Non-recoverable failures requiring attention | Express unreachable after retries, malformed response |

Never log document content, extracted text, LLM output, or user-provided data at any level.
Log only identifiers (`document_id`, `run_id`, `chunk_id`) and status values. This is a
security boundary — see Production-Ready Patterns in `development-principles.md`.

**Logger instantiation**: create a bound logger at the service level, not per-method.

```python
log = structlog.get_logger().bind(service="pipeline")
```

---

## Type Annotation Standard

Every function must have type annotations on all parameters and the return type. `Any` is
prohibited without an inline comment explaining why it cannot be avoided.

```python
# Correct
async def extract_text(file_bytes: bytes, mime_type: str) -> str: ...

# Wrong — missing return type
async def extract_text(file_bytes: bytes, mime_type: str): ...

# Wrong — Any without justification
async def parse_response(data: Any) -> dict[str, Any]: ...
```

Use `None` for absent values — not empty string. Matches the universal explicit-null
principle. Optional fields in Pydantic models use `field: str | None = None`.

---

## Pydantic Model Standard

Use Pydantic v2 models at every external boundary:

- FastAPI request and response bodies (automatic via FastAPI)
- Express API responses — parse through generated models from `shared/generated/`
- Config — via Dynaconf settings validated with a Pydantic `BaseModel`

**Do not hand-write models that duplicate generated ones.** If a model is generated from the
OpenAPI spec, import it from `shared/generated/`. Only write manual Pydantic models for
Python-internal types that have no Express equivalent.

**No mutable default arguments**: use `field(default_factory=list)` not `field(default=[])`.

---

## Internal Type Representation — Dataclasses vs Pydantic

Use `@dataclass` for all internal types that circulate within the Python service.
Use Pydantic only at external boundaries.

| Type | Use |
| --- | --- |
| Pipeline result types (`ExtractionResult`, `QualityResult`, `LLMCombinedResult`, etc.) | `@dataclass` |
| Interface return types (`OCRResult`, `EmbeddingResult`, `MetadataResult`, etc.) | `@dataclass` |
| Config models (`AppConfig`, `LLMConfig`, etc.) | Pydantic `BaseModel` |
| External API request/response bodies (Express, Ollama) | Pydantic `BaseModel` |

Pydantic's validation overhead and serialisation machinery are useful at boundaries where
data arrives from untrusted external sources (HTTP, config files). Inside the service,
dataclasses are lighter and sufficient — they have no implicit validation and their fields
are directly readable without calling `.model_dump()`.

```python
# Correct — internal pipeline result uses dataclass
@dataclass
class ExtractionResult:
    text_per_page: list[str]
    step_status: Literal["completed", "failed"]

# Wrong — internal result uses Pydantic
class ExtractionResult(BaseModel):
    text_per_page: list[str]
    step_status: Literal["completed", "failed"]
```

---

## Private Pydantic Parsing Models for External Responses

When an adapter receives a JSON response from an external service (Ollama LLM, Ollama
embeddings), parse and validate the raw JSON through a **private** Pydantic model, then
convert to the public dataclass before returning. Private models are prefixed with `_` to
signal they are internal implementation details not exported by the module.

```python
# In shared/adapters/ollama_llm.py

class _ChunkResultModel(BaseModel):   # private — validates raw Ollama JSON
    text: str
    chunk_index: int
    token_count: int

class OllamaLLMAdapter(LLMService):
    def combined_pass(self, ...) -> LLMCombinedResult | None:
        ...
        parsed = _LLMCombinedResultModel.model_validate(json_data)
        return LLMCombinedResult(          # public dataclass — circulates in service
            chunks=[ChunkResult(text=c.text, ...) for c in parsed.chunks],
            ...
        )
```

**Why this pattern**: Pydantic validates the external contract (wrong shapes raise
`ValidationError` immediately); the dataclass is what callers depend on. Keeping them
separate means a change to the Ollama response shape only touches the private model and
the conversion step, not the entire codebase.

---

## Config Key Casing Standard

`settings.json` (and `settings.override.json`) must use `UPPER_SNAKE_CASE` for all keys at
every nesting level. This matches Dynaconf's native internal representation — Dynaconf
uppercases all keys regardless of how they appear in the file, so writing them in
`UPPER_SNAKE_CASE` makes the source of truth and the internal representation identical.

Pydantic config models (`AppConfig` and all nested models) must use `UPPER_SNAKE_CASE`
field names to match. Accessing config values throughout the service uses `UPPER_SNAKE_CASE`
(e.g. `config.AUTH.INBOUND_KEY`, `config.LLM.BASE_URL`).

This means no key-casing bridge is needed between Dynaconf and Pydantic — `as_dict()` maps
directly to the model fields.

Environment variable overrides follow the same convention:
`IK_AUTH__INBOUND_KEY` overrides `AUTH.INBOUND_KEY`.

**What this rules out**: camelCase or snake_case keys in `settings.json`; camelCase field
names on config Pydantic models. These create a mismatch with Dynaconf's internal
representation and require a lossy normalisation step.

## Config Field Constraints

When a numeric config field has a minimum value required for correct runtime behaviour (not
just sensible operation), enforce it with a Pydantic field constraint so the invalid range
is statically unreachable:

```python
from typing import Annotated
from pydantic import BaseModel, Field

class ServiceHTTPConfig(BaseModel):
    RETRY_COUNT: Annotated[int, Field(ge=1)]
    RETRY_DELAY_MS: Annotated[int, Field(ge=0)]
```

Use `ge` (greater than or equal) or `gt` (strictly greater than) as appropriate. A value of
`RETRY_COUNT = 0` would produce incorrect retry logic — the constraint makes this impossible
at config load time, eliminating unreachable code paths in the implementation.

Do not add constraints for values that are merely suboptimal (e.g. a very high `TOP_K`) —
reserve constraints for values that would cause incorrect behaviour.

When correctness depends on the **relationship between two fields** (not just the range of
one), use `@model_validator(mode="after")`:

```python
class LLMConfig(LLMBaseConfig):
    CHUNKING_MIN_TOKENS: Annotated[int, Field(gt=0)]
    CHUNKING_MAX_TOKENS: Annotated[int, Field(gt=0)]

    @model_validator(mode="after")
    def check_token_bounds(self) -> "LLMConfig":
        if self.CHUNKING_MIN_TOKENS >= self.CHUNKING_MAX_TOKENS:
            raise ValueError(
                "CHUNKING_MIN_TOKENS must be less than CHUNKING_MAX_TOKENS"
            )
        return self
```

Cross-field validation belongs in the config model, not in the factory's `ValueError`
branch. The factory's responsibility is provider selection, not config sanity-checking.

---

## Requirements File Standard

All entries in `requirements.txt` must be uncommented. If a package cannot be installed
locally (e.g. heavy ML dependencies), document the workaround in a comment above the line
and in the relevant task notes — do not comment out the entry itself. The canonical
`requirements.txt` must represent the full runtime dependency set.

`requirements-dev.txt` follows the same rule for dev dependencies.

---

## Ruff Standard

`ruff` is the single tool for linting and formatting (analogous to Biome). Run before every
commit from `services/processing/`:

```bash
ruff check .
ruff format .
```

The `ruff` configuration lives in `services/processing/pyproject.toml` (not a standalone
`ruff.toml`). The canonical ruleset is:

```toml
[tool.ruff]
target-version = "py313"
line-length = 88
exclude = ["shared/generated/"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "ANN"]
```

- `E` — pycodestyle errors
- `F` — Pyflakes (undefined names, unused imports)
- `I` — isort (import ordering)
- `UP` — pyupgrade (enforces modern Python 3.13 syntax)
- `ANN` — annotation enforcement (missing type annotations become lint errors, not just
  a convention)

`shared/generated/` is excluded because the generated models are owned by `datamodel-codegen`
and not subject to manual style enforcement.

**Long prompt strings**: LLM adapter files legitimately contain multi-line prompt strings that
exceed the line length limit. Suppress `E501` for that file only using `per-file-ignores` in
`pyproject.toml` — do not add inline `# noqa` comments to each long line:

```toml
[tool.ruff.lint.per-file-ignores]
"shared/adapters/ollama_llm.py" = ["E501"]
```

Do not disable any other rules inline without a comment explaining the exception.

---

## Implementation Completion Checklist

Before marking a task `code_written`, run all four checks from `services/processing/`
with the virtualenv activated. All must pass with zero errors:

```bash
ruff check .
ruff format --check .
mypy .
pytest -m "not integration" tests/
```

`ruff format --check .` reports unformatted files without modifying them — fix with
`ruff format .`. `mypy .` catches signature errors, ABC mismatches, and return-type
violations that `ruff` and `pytest` do not see. Do not defer mypy to the code reviewer.

---

## ADR Citation Standard

Every source file in `services/processing/` should include a one-line module docstring citing
the relevant ADR where one exists.

```python
"""OCRService abstract base class (ADR-009)."""

"""DoclingAdapter — Phase 1 OCR implementation (implements ADR-009)."""
```

Omit the citation if no ADR directly governs the file.

---

## What These Principles Rule Out (Python Service)

| Anti-pattern | Why prohibited | Principle violated |
| --- | --- | --- |
| Untyped function signatures | Hides contracts; breaks static analysis | Type Annotation Standard |
| `print()` in application code | Unstructured; not filterable or queryable | Logging Standard |
| Calling Express directly from `pipeline/` or `query/` without going through `shared/http_client.py` | Bypasses auth header injection and retry logic | HTTP Client Pattern |
| Importing `pipeline/` from `query/` or vice versa | Violates the module boundary | Module Boundary |
| Hand-writing Pydantic models that duplicate generated ones | Duplicates drift silently | Pydantic Model Standard |
| camelCase or snake_case keys in `settings.json` or config Pydantic models | Mismatches Dynaconf's internal representation; requires a lossy normalisation step | Config Key Casing Standard |
| Mutable default arguments (`def f(items=[])`) | Classic Python footgun; shared across calls | Type Annotation Standard |
| Direct database connection from the Python service | Express is the sole DB writer | ADR-031 |
| `Any` without an inline justification comment | Hides real type; defeats static analysis | Type Annotation Standard |
| Tier 1 unit tests that construct a service or mock a dependency | Not a unit test; belongs in Tier 2 | Testing Strategy |
| `@pytest.mark.ci_integration` on a Tier 1 test | Tier 1 tests run unconditionally — the marker is redundant and creates false Tier 2 signals | Testing Strategy |
| Tier 2 tests that call real external services | Breaks CI reproducibility | Testing Strategy |
| Test helper fakes for service ABCs defined inline in a test file | Prevents reuse across test files; put them in `tests/fakes/<service_name>.py` | Testing Strategy |
| `not s.strip()` or `not some_str` as an emptiness check | Implicit truthiness; prefer `s.strip() == ""` or `some_str == ""` for consistency with the project's explicit-comparison style | Explicit Comparisons |
| Factory or adapter accepting `AppConfig` when a sub-config suffices | Violates config narrowing rule (Principle of Least Knowledge); couples the component to the full config shape and makes it harder to test in isolation | Dependency Composition Pattern |
| Direct key access (`data["key"]`) on an external API response body | `KeyError` propagates as an unhandled exception; use `data.get("key")` and guard the `None` case before proceeding | HTTP Client Pattern |
| `ruff` rule suppressions without an explanatory comment | Creates invisible technical debt | Ruff Standard |
| Hardcoded provider names, URLs, or credentials in application code | Prevents runtime swapping; breaks Infrastructure as Configuration | Technology Constraints |
| Using Pydantic `BaseModel` for internal pipeline result types | Unnecessary overhead; dataclasses are sufficient for internal types | Internal Type Representation |
| Hand-writing external response models without the `_` prefix or converting to a dataclass | Conflates parsing boundary with internal representation; breaks encapsulation | Private Pydantic Parsing Models |
| `@pytest.mark.asyncio` on test functions | Redundant — `asyncio_mode = auto` in `pytest.ini` handles all async tests | Testing Strategy |
| Using bare `assert result is not None` before accessing fields on a possibly-None result | Opaque failure message; mypy may still warn; use `pytest.fail()` guard instead | Testing Strategy |
| Replicating structlog silencing in individual test files or fixtures | Already configured in `conftest.py` for the whole session | Testing Strategy |
| Using a pytest fixture for construction that is only needed in one test file | Unnecessary conftest coupling; use a local `make_<thing>()` function instead | Testing Strategy |
| `# pragma: no cover` on individual methods in `interfaces/` or `shared/generated/` | Coverage exclusion is handled at project level in `pyproject.toml` | Testing Strategy |
| Cross-field config validation in the factory's `ValueError` branch | Validation belongs in the Pydantic model via `@model_validator(mode="after")` | Config Field Constraints |
| Writing a step runner as a class when no ABC exists for the step | Step runners that call an injected service should be module-level functions | Pipeline Step Structure |
