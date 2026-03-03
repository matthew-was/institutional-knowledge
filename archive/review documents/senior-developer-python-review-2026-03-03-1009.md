# Self-Review — Senior Developer Python Plan

Reviewed against: `documentation/tasks/senior-developer-python-plan.md`
Review date: 2026-03-03

---

## Review summary

The plan is substantially complete and internally consistent. Three issues require attention
before implementation begins: one ADR-042 structural change already incorporated into the
plan (LLMService placement), one open question about the description-overwrite precedence
rule, and a blocking dependency on Integration Lead contracts. No section is a placeholder.
No Phase 1 user story is omitted.

---

## Completeness

### C2 pipeline steps

All six steps are planned with interface contracts, Phase 1 implementations, step status
recording, and failure handling.

| Step | Interface | Phase 1 impl | Step status | Failure handling |
| --- | --- | --- | --- | --- |
| 1 OCR extraction | OCRService ABC | DoclingAdapter + TesseractAdapter | Covered | File open fail → `failed`; catastrophic cases → `completed` + flag |
| 2 Text quality scoring | TextQualityScorer ABC | WeightedTextQualityScorer | Covered (same call as step 1) | Threshold fail → `completed` + flag |
| 3 Pattern metadata extraction | PatternMetadataExtractor ABC | RegexPatternExtractor | Covered | Regex exception → `failed` |
| 4 Completeness scoring | MetadataCompletenessScorer ABC | WeightedFieldPresenceScorer | Covered | Technical fail → `failed`; threshold fail → `completed` + flag |
| 5 LLM combined pass | LLMService ABC | OllamaLLMAdapter | Covered | LLM unavailable or parse fail → `failed` |
| 6 Embedding generation | EmbeddingService ABC | OllamaEmbeddingAdapter | Covered | Any chunk fail → step `failed` |

### C3 query components

| Component | Planned |
| --- | --- |
| QueryRouter ABC | Yes — `query/interfaces/query_router.py`; Phase 2 extension point documented |
| PassthroughQueryRouter | Yes — always returns `vector` |
| Query understanding | Yes — `query/query_understanding.py`; LLM call; Pydantic validation; fallback |
| Vector search | Yes — HTTP POST to Express; `EmbeddingService` from `shared/` |
| Context assembly | Yes — token budget; truncation flag; no reranking in Phase 1 |
| Response synthesis | Yes — citation markers; no-results case; citation field config |
| FastAPI endpoint | Yes — `/query`, `/process`, `/health`; auth middleware |
| GraphStore stub (Phase 2) | Yes — `_graph_search()` stub raises `NotImplementedError` |

### ADR-042 module boundary

The plan explicitly enforces the boundary throughout:

- `pipeline/` and `query/` have no imports between them
- `EmbeddingService` lives in `shared/` — explicitly called out in both step 6 and C3 query
- `LLMService` moved to `shared/` — the coupling risk was identified, explained, and
  resolved within the plan; the module structure diagram reflects the resolution
- The boundary rule is stated in the module structure section and again in the shared
  utilities section

### No placeholder sections

Every section contains substantive planning content. No section reads "TBD" or defers to
implementation without guidance.

---

## Consistency

### HTTP calls to Express

All four Express interactions (C2-E1, C2-E2, C3-E1, C3-E2 stub) follow the same pattern:

- Caller identified
- Direction stated
- Purpose described
- Auth header noted (`x-internal-key` per ADR-044)
- Indicative request/response schemas provided for C2-E2 and C3-E1
- All flagged PENDING Integration Lead contract

### EmbeddingService across C2 and C3

`EmbeddingService` is referenced consistently in both modules. Step 6 of C2 uses it for
document chunk embedding. The C3 vector search step uses it for query text embedding. Both
import from `shared/interfaces/embedding_service.py`. The factory is in
`shared/factories/embedding_factory.py`. This is consistent throughout the plan.

### LLMService placement

The plan initially described `LLMService` in `pipeline/interfaces/` (in the step 5 interface
section), then identified and resolved the ADR-042 coupling risk, and updated both the
module structure and the shared utilities sections to reflect the final `shared/` placement.
The step 5 section now references `shared/interfaces/llm_service.py`. Consistency is
achieved throughout.

### Technology constraints applied uniformly

- Dynaconf + Pydantic: used in config loading section; Pydantic model structure provided
- FastAPI: used as the HTTP server; dependency injection noted
- Abstract base classes: every interface uses ABC + `@abstractmethod`
- Factory pattern: every service has a factory function; config key drives selection
- pytest with `@pytest.mark.integration`: testing section follows ADR-032 correctly

### Step status recording

ADR-027 step status recording is addressed in every pipeline step. The pattern is consistent:
Python returns `step_status` in the response payload; Express writes the `pipeline_steps`
row. Technical failures map to `failed`; quality/threshold failures map to `completed` plus
a flag. This distinction is correct per ADR-027 and US-048.

---

## Ambiguity

### AM-1 (Low risk — resolved in OQ-5): Description overwrite precedence

US-037 requires the system to overwrite the intake description only when a description is
detected. The plan's step 5 (LLM combined pass) and step 3 (pattern metadata) both attempt
description detection. The plan proposes that step 5 takes precedence over step 3, which
takes precedence over the intake value. This interpretation is reasonable and is flagged as
OQ-5 for developer confirmation. If the interpretation is wrong, only the orchestrator
flag-and-override logic needs to change — the interfaces are unaffected.

### AM-2 (Low risk): Step 2 has no independent pipeline_steps row

The plan states that text quality scoring shares the same Python call as step 1 and that
Express writes both rows from the same response. ADR-038 lists both `text_extraction` and
`text_quality_scoring` as distinct step names in the `pipeline_steps` enum. The plan is
consistent with this — the Python response includes status for both step names — but the
contract between Python and Express needs to clearly specify that a single HTTP call returns
statuses for two steps. This is implicit in the plan's indicative C2-E2 request body schema,
where `step_results` contains both keys. Flagged as a note for the Integration Lead to make
explicit in the contract.

### AM-3 (Low risk): Document file delivery mechanism (C2-E1)

The plan correctly identifies an ambiguity: does Express send the file as binary in the
processing request body, or does it send a storage path and rely on shared filesystem access?
This is flagged as a blocking open question (OQ-1 / C2-E1) for the Integration Lead. No
assumption is baked into the plan; the plan simply notes that Python receives the file via
the processing request.

---

## Scope gaps

### Phase 1 user story coverage

| Story group | Stories | Coverage |
| --- | --- | --- |
| Text extraction and quality scoring | US-028, US-030–036 | All covered in steps 1–2 |
| Metadata detection and completeness | US-037–043 (Phase 1 only; US-044 is Phase 2) | All covered in steps 3–4 and orchestrator |
| Embeddings and chunking | US-045–047 | Covered in steps 5–6 and step status recording |
| Pipeline processing | US-048–053 | Covered in orchestration section |
| Flags and curation queue | US-054–057 | Flag mechanism covered; curation queue ordering is Express/frontend concern, not Python |
| Vocabulary management | US-059–066 (Phase 1; US-067–068 excluded as Phase 2) | Entity extraction (LLM combined pass step 5) and deduplication (returned to Express) cover the Python side; vocabulary review UI is Express/frontend |
| Query and retrieval | US-069–071 (CLI only; web UI is Phase 2) | C3 pipeline fully planned; FastAPI endpoint serves both CLI and Next.js paths |

No Phase 1 user story applicable to Python is omitted.

### ADR-042 coupling risks

Two risks were identified and both are addressed:

1. `LLMService` in `pipeline/interfaces/` would couple `query/` to `pipeline/` — resolved by
   moving to `shared/interfaces/`; the module structure diagram and all references updated
2. `EmbeddingService` sharing — this is the intended pattern, not a risk; explicitly
   documented as safe throughout

No additional coupling risks are present in the plan.

### Phase 2 scope not included

The plan correctly excludes:

- Web UI query (US-073 and beyond) — flagged as Phase 2
- LLMQueryRouter implementation — interface defined; implementation deferred to Phase 2
- GraphStore query path — stub method defined; implementation deferred to Phase 2
- Re-embedding on metadata correction (US-044) — Phase 2

---

## Blocking items before implementation

1. **Integration Lead contracts (OQ-1)** — blocking; all Express HTTP calls are pending
   contract; plan cannot be finalised without them
2. **OQ-5 confirmation** — low priority; developer should confirm description-overwrite
   precedence rule before implementing the orchestrator override logic; does not block
   planning but blocks story US-037 closure

---

## Verdict

The plan is clear and complete for all Phase 1 C2 and C3 user stories within Python scope.
The ADR-042 module boundary is explicitly enforced throughout. All HTTP calls to Express are
identified and flagged for Integration Lead review. Open questions are specific and
actionable. The plan is ready for developer review subject to resolution of OQ-1 (Integration
Lead contracts).
