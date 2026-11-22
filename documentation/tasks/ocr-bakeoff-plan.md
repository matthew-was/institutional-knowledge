# OCR Engine Bake-Off Plan

**Status**: proposed, not started. **Written**: 2026-11-22.

## Purpose

Choose the engine that reads **scanned pages** (and images). Digital PDFs are settled:
pages with real, visible text use the PDF's own text (`PDF_MODE=auto`, built and
verified 2026-11-22), which beat every OCR option on every digital document tested.

The current default for scans is Docling layout analysis with Tesseract as the OCR
engine (`ENGINE=tesseract`). It was chosen from five real scans and no ground truth,
because ADR-011 predates a year of progress in small vision-language OCR models. This
plan tests that choice against the newer options on the owner's own documents. No
published benchmark covers 1960s typewritten letters or photographed reports, so
only a test on the real archive can settle it.

## What we already know (and how far to trust it)

| Finding | Evidence | Confidence |
| --- | --- | --- |
| RapidOCR (Docling's default engine) garbles long typewritten lines | 5 real scans, viewed against the page image | High for these letters |
| Tesseract read the same letters correctly; best of the three setups tried | Garbling per 1000 words 43-120 vs 157-203; one page checked by eye | Medium: crude metric, one page checked visually |
| Existing text layers in the scans are unusable (scrambled order, misreads) | Compared against page image | High |
| Neither engine reads photographed forms and tables (page 29 of the 2020 report) | Viewed | High |
| Small VLM OCR models rank above classic pipelines on OmniDocBench | Third-party blogs; sources disagree on the leader | Low: modern clean documents, not historical |
| `qwen3.5:9b` accepts image input | Ollama library page lists vision | High |

## Candidates

All run locally. Sizes are from the Ollama library pages read on 2026-11-22; context
and version requirements are as the pages state them.

| ID | Candidate | How it runs | Download | Notes |
| --- | --- | --- | --- | --- |
| A | Docling + Tesseract (**baseline**) | in-process, GPU 1 | none | Current default |
| B | Docling + auto engine (RapidOCR/torch) | in-process, GPU 1 | none | Control; already measured on letters |
| C | `glm-ocr` | Ollama | 2.7 GB | 0.9B, 128K context; text, table and formula prompts |
| D | `qwen3-vl:8b` | Ollama | size to confirm | General vision model |
| E | `qwen3.5:9b` (vision) | Ollama | 6.6-7.6 GB | Already planned as the LLM, so no extra model to host |
| F | `deepseek-ocr` | Ollama | 6.7 GB | 3B, 8K context, needs Ollama 0.13+; page warns it is input-sensitive |
| G | `ibm/granite-docling` (258M) via Docling's VLM pipeline | Ollama or Hugging Face | small | IBM's model for Docling; no independent comparison found |

**Stretch candidates, only if A-G disappoint.** These are not in the Ollama library
and need their own runtime: PaddleOCR-VL, Chandra OCR 2, MinerU 2.5, and NVIDIA's
Nemotron OCR (listed by Docling's auto-selection, not installed here).

**Deliberately out of scope**: visual retrieval (ColPali/ColQwen). It changes the
architecture (about 1,000 vectors per page, whole-page results) and the one
comparison found favoured OCR on degraded scans. Revisit after OCR is settled.

## Test set

Scanned pages only, 10-12 pages chosen to span the archive:

- The four 1960 letters (cow yards, improvements x2, oxpens x2 pages): typewritten,
  with letterheads, a script address and a signature.
- From the 2020 estate report, a mix: two prose pages, one table page, one form page
  (page 29, a photographed tree-risk form), and one page with a photograph or plan.
- Pages the quality gate currently flags (pages 1, 2, 5, 15, 17, 20, 25, 28, 29, 34).

**Ground truth.** A careful transcription of each page, with **key facts marked**
(names, dates, amounts, reference numbers, addresses) and **illegible regions
marked**. Proposed: Claude drafts the transcription from the page images and flags
uncertain words; the owner reviews only the flagged words. This sends the chosen
page images to Claude, which needs the owner's explicit go-ahead because the pages
are private family and estate documents.

## Metrics

1. **Word error rate** against ground truth (normalised: case-folded, whitespace
   collapsed), and character error rate.
2. **Key-fact recall**: the share of marked names, dates, amounts and references
   found exactly. This is the metric that matters most for retrieval.
3. **Invented text**: words in the output that are in neither the ground truth nor
   the Tesseract baseline output, counted within illegible regions. A vision model
   can write plausible text for a stain; in an archive that is worse than a gap.
4. **Structure**, scored 0-2 per page by eye: reading order, paragraph and heading
   boundaries, table rows.
5. **Speed** per page and **peak VRAM**.
6. **Repeatability**: run each VLM twice at temperature 0 and compare outputs.
7. **Operational fit**: install effort, licence, output format, and whether it can
   produce a confidence signal (the quality gate depends on one; VLMs give none).

## Procedure

1. **Prerequisites.** Run Ollama with GPU access pinned to the 3080 Ti (GPU 0); keep
   Docling on the 3070 Ti (GPU 1). This overlaps with the planned compose work, so a
   minimal `ollama` service is the first slice of it. Pull models one at a time, and
   ask before each download (about 25 GB in total; 409 GB is free).
2. **Ground truth.** Build and review it for the chosen pages (above).
3. **Harness.** A script outside the service code (`scripts/ocr_bakeoff/`) that renders
   each page at 200 and 300 dpi, runs every candidate, stores raw outputs per
   engine and page, then computes the metrics and writes a comparison table. VLM
   prompts are fixed and minimal: transcribe exactly, keep line breaks, do not
   correct spelling, write `[illegible]` for unreadable text. Model-specific
   prompts from each Ollama page are tried as a variant.
4. **Run and review.** Run everything, then read the worst pages for each engine
   against the page image. A number can hide a failure that a person spots at once.
5. **Write up** the results and the decision in this folder, and record the outcome as
   an ADR superseding the engine part of ADR-011.

## Decision rules (set before running)

- A candidate becomes the default for scans only if it **beats the baseline on key-fact
  recall by at least 5 points** and **cuts word error rate by at least 20%
  (relative)**, with **no more invented text than the baseline** and **at most 30
  seconds per page** on this hardware.
- **Hallucination veto**: an engine that invents names, dates or amounts in
  illegible regions cannot be the default, whatever its other scores.
- **If a VLM wins but gives no confidence**, use it as an escalation, not the default:
  Tesseract reads every page, and the VLM re-reads pages that fail the quality
  threshold or where the two engines disagree most.
- **If nothing clears the bar**, keep Tesseract and record that the alternatives were
  tested.

## If a candidate wins: what changes in the code

- A new `OCRService` adapter (for example `OllamaVisionOCRAdapter`) and one factory
  entry, as ADR-016 intends. The pipeline steps do not change.
- Pages are rendered to images before being sent to the model.
- A substitute confidence signal (for example, agreement with Tesseract), so the
  quality gate keeps working.
- New config keys, unit tests with a mocked HTTP client, and an integration test.
- **Model co-residency**: Ollama on the 3080 Ti must hold the OCR model and the
  9B LLM. Both together may not fit, and swapping models costs seconds per swap.
  Using `qwen3.5:9b` for both jobs (candidate E) avoids this and is a point in its
  favour if it scores close to the others.

## Risks and limits

- Ground truth is one reader's transcription of old documents; some words are
  genuinely ambiguous, which is why uncertain words are flagged for the owner.
- Twelve pages from five documents is a small sample. It is enough to see large
  differences (the garbling seen so far was large), not to rank close contenders.
- Third-party benchmark rankings disagree and use modern, clean documents.
- Model pages and versions change quickly; record exact model tags and the Ollama
  version used, so the result can be reproduced.
- The test pages contain private family and estate information. Raw outputs and
  ground truth stay outside the repository.

## Decisions needed from the owner

1. Permission for Claude to view the chosen scan pages and draft the ground truth.
2. Whether to include the stretch candidates that need their own runtime.
3. Approval of each model download when we reach step 1 of the procedure.
