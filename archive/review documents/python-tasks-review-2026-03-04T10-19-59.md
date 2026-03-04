# Task List Self-Review — Python Processing Service

## Reviewed

2026-03-04

## Source task list

`documentation/tasks/python-tasks.md`

## Source plan

`documentation/tasks/senior-developer-python-plan.md` (Approved 2026-03-03)

---

## Completeness

Every distinct implementation unit in the plan has a corresponding task. Review below maps
plan sections to tasks:

| Plan section | Task(s) |
| --- | --- |
| Module structure / scaffolding | Task 1 |
| `shared/config.py` | Task 2 |
| `shared/http_client.py` | Task 3 |
| FastAPI auth middleware (`app.py`) | Task 4 |
| `OCRService` interface and adapters | Task 5 |
| Step 1: OCR extraction step | Task 6 |
| `TextQualityScorer` interface and implementation (Step 2) | Task 7 |
| `PatternMetadataExtractor` interface and `RegexPatternExtractor` (Step 3) | Task 8 |
| `MetadataCompletenessScorer` interface and `WeightedFieldPresenceScorer` (Step 4) | Task 9 |
| `LLMService` interface and `OllamaLLMAdapter` | Task 10 |
| Step 5: LLM combined pass and chunk post-processing | Task 11 |
| `EmbeddingService` interface and `OllamaEmbeddingAdapter` | Task 12 |
| `QueryRouter` interface and `PassthroughQueryRouter` | Task 13 |
| Query understanding | Task 14 |
| Step 6: Embedding generation | Task 15 |
| Context assembly | Task 16 |
| Response synthesis | Task 17 |
| Pipeline orchestrator | Task 18 |
| Query handler | Task 19 |
| FastAPI route wiring / dependency injection | Task 20 |
| Unit test suite (all pipeline and query tests) | Task 21 |
| Pipeline integration tests | Task 22 |
| Query integration tests | Task 23 |

**Result**: No plan section is silently omitted.

**One note on coverage**: The plan describes the `PipelineOrchestrator` as calling Express
via `post_processing_results()` (PROC-002) as part of its own execution. Task 18 captures
this. The HTTP client method itself is implemented in Task 3. The dependency chain (Task 3 →
Task 18) is correct.

---

## Consistency

**Task numbering**: Tasks 1–23 are sequential with no gaps or duplicates. All dependency
references in each task refer to valid task numbers within this range.

**Dependency field accuracy**:

- Task 9 depends on Task 8 (requires `MetadataResult` defined in Task 8) — correct.
- Task 11 depends on Task 10 (requires `LLMService` from Task 10) — correct.
- Task 14 depends on Task 10 and Task 13 — correct (`LLMService` and `QueryRouter` context
  both needed).
- Task 15 depends on Task 11 and Task 12 — correct (chunks from step 5 and embedding service
  from Task 12).
- Task 18 depends on Tasks 6, 7, 9, 11, 15, and 3 — correct (all pipeline steps plus HTTP
  client).
- Task 19 depends on Tasks 13, 14, 12, 3, 16, and 17 — correct (all C3 components plus HTTP
  client).
- Task 20 depends on Tasks 4, 18, and 19 — correct (auth middleware, orchestrator, query
  handler).
- Task 21 depends on Tasks 2–20 — correctly stated as "all prior implementation tasks."
- Tasks 22 and 23 depend on Task 18/19 and Task 21 — correct.

**Status values**: All 23 tasks carry `Status: not_started`. No inconsistencies.

**Condition types**: All 23 tasks carry one of `automated`, `manual`, or `both`. No missing
or invalid values found.

---

## Ambiguity

**One potential ambiguity in Task 11 (chunk post-processing)**: The plan says the
`text_quality_scoring` step runs "within the same invocation as step 1" and is part of the
same step file. However, the task list separates `TextQualityScorer` (Task 7) from the OCR
extraction step (Task 6). This is correct — the interface and implementation are in separate
files per the plan's module structure; the orchestrator calls them in sequence. An implementer
reading Task 6 alone might not realise that quality scoring runs immediately after extraction
and is passed to the orchestrator as part of the same pipeline invocation. The orchestrator
description in Task 18 clarifies the sequencing, so this is not a blocking ambiguity.

**One potential ambiguity in Task 14 (query understanding)**: The plan notes that
`query_understanding.py` "uses `LLMService.combined_pass()`" but acknowledges the implementer
may add a separate `understand_query()` method. The task description preserves this
flexibility. An implementer who chooses to add a separate method should note the constraint:
the new method must still live in `shared/`. This is stated in the task.

**No other ambiguities found.** Each task description names specific files to create, specific
methods or classes to implement, and specific config keys to read. An implementer can start
each task without reading the full plan.

---

## Ordering

The dependency chain does not block the first task. Task 1 (scaffolding) has no dependencies.
The full dependency ordering is:

```text
Task 1
  └─ Task 2 (config)
       ├─ Task 3 (HTTP client)
       ├─ Task 4 (auth middleware)
       ├─ Task 5 (OCRService)
       │    └─ Task 6 (OCR extraction step)
       ├─ Task 7 (TextQualityScorer)
       ├─ Task 8 (PatternMetadataExtractor)
       │    └─ Task 9 (CompletenessScorer)
       ├─ Task 10 (LLMService)
       │    └─ Task 11 (LLM combined pass step)
       │         └─ Task 15 (Embedding generation step) ←─ also depends on Task 12
       ├─ Task 12 (EmbeddingService)
       │    └─ (Task 15 — see above)
       └─ Task 13 (QueryRouter)
            ├─ Task 14 (Query understanding) ←─ also depends on Task 10
            ├─ Task 16 (Context assembly)
            │    └─ Task 17 (Response synthesis)
            └─ (Task 19 — see below)

Task 3 + Task 6 + Task 7 + Task 9 + Task 11 + Task 15
  └─ Task 18 (Pipeline orchestrator)
       └─ Task 20 (FastAPI route wiring) ←─ also depends on Task 4 and Task 19

Task 13 + Task 14 + Task 12 + Task 3 + Task 16 + Task 17
  └─ Task 19 (Query handler)
       └─ Task 20 (FastAPI route wiring)

Task 4 + Task 18 + Task 19
  └─ Task 20

Tasks 2–20
  └─ Task 21 (unit test suite completion)
       ├─ Task 22 (pipeline integration tests) ←─ also depends on Task 18
       └─ Task 23 (query integration tests) ←─ also depends on Task 19
```

No circular dependencies. No task appears before its prerequisites.

**One ordering note**: Tasks 6, 7, 9, 11, 12, 13, 14, 15, 16, 17 all have `Task 2` as their
only top-level dependency (some also depend on each other). This means many tasks can be
started in parallel once Task 2 is complete. The pair programmer can work on multiple
workstreams concurrently:

- Workstream A: Tasks 5 → 6 (OCR)
- Workstream B: Tasks 7 (quality scorer — independent)
- Workstream C: Tasks 8 → 9 (metadata and completeness)
- Workstream D: Tasks 10 → 11 → 15 (LLM and embedding)
- Workstream E: Tasks 12 (embedding service — feeds Task 15)
- Workstream F: Tasks 13 → 14, 16, 17, 19 (C3 query)

All workstreams converge at Task 18 (orchestrator) and Task 20 (app wiring).

---

## Flagged issues carried forward

Three issues are flagged in the task list itself. These are not issues with the task list;
they are open questions from the plan that the developer must resolve before certain tasks
can be completed:

- **FLAG-01** (OQ-3): Embedding model choice — blocks Task 15 completion and Task 22 start
- **FLAG-02** (OQ-4): Initial regex patterns and completeness weights — affects Task 8 initial
  configuration and US-040 closure
- **FLAG-03**: Ollama and Docling local environment required for Task 22

---

## Verdict

The task list is clear and complete. No plan section is missing. All dependency references
are accurate. All tasks are self-contained with verifiable acceptance conditions. The three
flagged issues are carry-forwards from the plan's open questions; they do not represent
deficiencies in the task list.
