# OCR Extraction Workflow

## When to use

Use this skill when implementing steps 1 and 2 of the C2 pipeline (text extraction and text quality scoring). Specifically:

- Implementing the `OCRService` interface and its Docling/Tesseract adapters
- Writing the extraction loop and handling the three catastrophic failure modes
- Implementing the `TextQualityScorer` interface and configuring quality thresholds
- Understanding how step status is recorded and how flags gate subsequent pipeline steps

Read `configuration-patterns.md` first — this skill assumes the `OCRService` interface and factory pattern are already understood.

---

## Overview

Steps 1 and 2 of the C2 pipeline — **Text Extraction** and **Text Quality Scoring** — form
the OCR extraction phase that gates all subsequent document processing. These steps run in the
Python processing service (a separate Docker container with no direct database access). All results
are returned to the Express backend, which writes them to PostgreSQL in a single transaction.

This skill explains both the design rationale and the implementation patterns for these two steps.
It is written for developers learning Python and document processing patterns within this project.

---

## The 6-Step C2 Pipeline

```text
1. Text extraction (OCR)        ← This skill
2. Text quality scoring         ← This skill
3. Pattern-based metadata extraction
4. Metadata completeness scoring
5. LLM combined pass (chunking + entity extraction)
6. Embedding generation
```

Steps 1 and 2 together form a **filtering gate**: if text extraction fails catastrophically or
quality is too poor, the document is flagged for manual review and the pipeline stops. Steps
3–6 only run if the document passes both checks.

---

## The OCRService Interface

OCR engines — Docling and Tesseract — are accessed through a Python abstract base class (`OCRService`).
This abstraction means:

- The pipeline code never mentions "Docling" or "Tesseract" directly
- Swapping engines requires only a configuration change (`ocr.provider: "docling"` or `"tesseract"`)
- Testing uses mock implementations; production uses the real engines

For the complete interface definition, concrete adapters, and factory function, see
[configuration-patterns.md](configuration-patterns.md) — this skill assumes you have read it.

**Key interface method**:

```python
async def extract_text(self, file_path: str) -> OCRResult:
    """
    Extract text from a single page or document.

    Returns OCRResult with:
      - text: extracted text string (may be empty)
      - confidence: OCR confidence score (0.0 to 1.0)
      - extraction_method: which engine was used ("docling", "tesseract", etc.)
    """
```

**Why Docling is primary** (ADR-011): Docling preserves document structure (headings, paragraphs,
signatures) better than Tesseract alone. For deeds, letters, and operational logs, structure
matters — paragraph boundaries guide semantic chunking in step 5. Docling is also PDF-native,
handling multi-page PDFs as a single unit. Tesseract is the fallback for image-only files where
Docling is unavailable or fails.

---

## Step 1: Text Extraction

### The Goal

Read every page of a document, extract text using the configured OCR engine, and produce:

- Per-page text content
- Per-page OCR confidence score
- A flag if the extraction has issues

**Fundamental rule** (UR-045): Evaluate all pages. There is no fail-fast within a document.
If page 3 fails to produce text, page 4 and beyond are still extracted. The archivist needs
to see the full picture, not just the first failure.

### Three Special Cases Before Quality Scoring

Before moving to step 2 (quality scoring), check for three catastrophic failure modes:

#### Case 1: Zero-Page Document (UR-050)

```python
# After opening the file
if document.page_count == 0:
    flag = DocumentFlag(
        type="extraction_failure",
        reason="Document opened but contains zero pages",
        severity="manual_review"
    )
    return ExtractionResult(
        text_per_page=[],
        confidence_per_page=[],
        document_flags=[flag],
        step_status="completed"  # Step 1 completed successfully (file was readable)
    )
    # Do NOT continue to step 2
```

Why flag instead of reject? A zero-page file may indicate:

- A corrupt PDF (needs manual diagnosis)
- An empty or placeholder document (curator should decide what to do)
- A file format issue (e.g., encrypted, password-protected)

Flagging rather than rejecting allows the curator to inspect it without re-uploading.

#### Case 2: All Pages Yield No Text (UR-048)

```python
# After extracting all pages
if all(page_text.strip() == "" for page_text in text_per_page):
    flag = DocumentFlag(
        type="extraction_failure",
        reason="No extractable text from any page",
        severity="manual_review"
    )
    return ExtractionResult(
        text_per_page=text_per_page,
        confidence_per_page=confidence_per_page,
        document_flags=[flag],
        step_status="completed"
    )
    # Do NOT continue to step 2
```

This document might be:

- A scanned image of a plan, map, or diagram
- A degraded scan with illegible text
- A non-text document (e.g., hand-drawn notes)

The archivist may need to manually transcribe or categorise it.

#### Case 3: Some Pages Yield Text, Others Don't (UR-049)

```python
# After extracting all pages
pages_with_text = [i for i, text in enumerate(text_per_page, start=1) if text.strip() != ""]
pages_without_text = [i for i, text in enumerate(text_per_page, start=1) if text.strip() == ""]

if pages_without_text and pages_with_text:  # Some but not all
    flag = DocumentFlag(
        type="partial_extraction",
        reason=f"Text extracted from {len(pages_with_text)} pages; "
               f"{len(pages_without_text)} pages produced no text: {pages_without_text}",
        severity="manual_review"
    )
    return ExtractionResult(
        text_per_page=text_per_page,
        confidence_per_page=confidence_per_page,
        document_flags=[flag],
        step_status="completed"
    )
    # Do NOT continue to step 2 — no embeddings will be generated
```

**Critical**: Do not generate partial embeddings. Embedding only the pages with text would
create a chunk corpus missing pages 7–9 (say), which will produce misleading search results.

### The Extraction Loop

```python
async def extract_pages(self, file_path: str, ocr_service: OCRService) -> ExtractionResult:
    """
    Extract text from all pages of a document.
    Handles file open failures, page iteration failures, and the three special cases.
    """

    # Step 1: Open the document
    try:
        document = pdf.open(file_path)  # or your PDF library
    except Exception as e:
        # File cannot be opened — this is a technical error
        # Step 1 will be marked `failed` and retried (UR-068)
        return ExtractionResult(
            step_status="failed",
            error_message=f"Failed to open document: {e}",
        )

    # Check for zero-page document (Special Case 1)
    if document.page_count == 0:
        # Handle as above; return early with flag
        ...

    # Step 2: Extract all pages
    text_per_page = []
    confidence_per_page = []

    for page_num in range(1, document.page_count + 1):
        try:
            page = document.get_page(page_num)
            # Some libraries provide per-page extraction; others work on the whole document
            # Adapt to your chosen library
            ocr_result = await ocr_service.extract_text(page)
            text_per_page.append(ocr_result.text)
            confidence_per_page.append(ocr_result.confidence)
        except Exception as e:
            # A page failed to extract — log but continue (no fail-fast)
            logger.warning(f"Page {page_num} extraction failed: {e}")
            text_per_page.append("")  # Treat as no text
            confidence_per_page.append(0.0)

    # Check for Special Case 2 (all empty) and 3 (partial)
    # ... (see above)

    # All pages extracted; return for quality scoring (step 2)
    return ExtractionResult(
        text_per_page=text_per_page,
        confidence_per_page=confidence_per_page,
        document_flags=[]  # No catastrophic failures
    )
```

---

## Step 2: Text Quality Scoring

### Why Quality Scoring Exists

OCR engines produce confidence scores per page (a probability that the extraction is correct).
But confidence alone doesn't guarantee usable text. A document might be:

- Degraded or faded (low OCR confidence)
- Mostly images with little text (high confidence but sparse content)
- Garbled output from a corrupted PDF

Quality scoring combines OCR confidence with **text density** (characters per page) to surface
suspicious documents before they create misleading search results.

Quality threshold is configurable — different archives may tolerate different amounts of
degradation.

### The TextQualityScorer Interface

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class QualityResult:
    """Output from text quality scoring."""
    per_page_scores: list[float]        # Score per page (0-100)
    document_score: float               # Overall score (0-100)
    passed_threshold: bool              # True if all pages >= threshold
    failing_pages: list[int]            # Page numbers (1-indexed) that failed threshold

class TextQualityScorer(ABC):
    """Pluggable text quality scoring."""

    @abstractmethod
    def score(
        self,
        text_per_page: list[str],
        confidence_per_page: list[float]
    ) -> QualityResult:
        """
        Score text quality.

        Args:
            text_per_page: extracted text per page
            confidence_per_page: OCR confidence per page (0.0 to 1.0)

        Returns:
            QualityResult with per-page and document scores (0–100)
        """
```

### Recommended Starting Implementation

```python
class WeightedTextQualityScorer(TextQualityScorer):
    """
    Starting implementation: weighted combination of OCR confidence and text density.
    All weights and threshold are configurable.
    """

    def __init__(
        self,
        confidence_weight: float = 0.6,      # config: ocr.qualityScoring.confidenceWeight
        density_weight: float = 0.4,          # config: ocr.qualityScoring.densityWeight
        quality_threshold: float = 60.0       # config: ocr.qualityThreshold
    ):
        self.confidence_weight = confidence_weight
        self.density_weight = density_weight
        self.quality_threshold = quality_threshold

    def score(self, text_per_page: list[str], confidence_per_page: list[float]) -> QualityResult:
        """Score each page independently, then compute document score."""

        per_page_scores = []

        for page_text, page_confidence in zip(text_per_page, confidence_per_page):
            # Component 1: OCR confidence (0.0–1.0) → 0–100
            confidence_component = page_confidence * 100

            # Component 2: Text density (characters per page)
            # Target: pages with 200+ characters are "good", 0 characters is "bad"
            # Scale to 0–100
            char_count = len(page_text.strip())
            density_component = min(100, (char_count / 200) * 100)

            # Weighted combination
            page_score = (
                (confidence_component * self.confidence_weight) +
                (density_component * self.density_weight)
            )
            per_page_scores.append(page_score)

        # Document score: average of page scores
        document_score = sum(per_page_scores) / len(per_page_scores) if per_page_scores else 0.0

        # Check threshold
        failing_pages = [
            page_num + 1
            for page_num, score in enumerate(per_page_scores)
            if score < self.quality_threshold
        ]

        return QualityResult(
            per_page_scores=per_page_scores,
            document_score=document_score,
            passed_threshold=len(failing_pages) == 0,
            failing_pages=failing_pages
        )
```

**Why these starting weights?** Confidence weight is higher because an OCR engine saying "I'm
not sure about this page" is a strong signal. Text density is secondary — a page with many
characters but low OCR confidence is still worth flagging. Adjust weights as you process real
documents and observe failure patterns.

### Threshold Logic

After scoring, evaluate the threshold:

```python
quality_result = scorer.score(text_per_page, confidence_per_page)

if not quality_result.passed_threshold:
    # At least one page failed — flag the document
    failing_page_str = ", ".join(map(str, quality_result.failing_pages))
    flag = DocumentFlag(
        type="quality_threshold_failure",
        reason=f"Text quality below threshold on pages: {failing_page_str}",  # UR-051: full failing page list required
        severity="manual_review",
        metric_value=quality_result.document_score
    )
    return ExtractionResult(
        text_per_page=text_per_page,
        confidence_per_page=confidence_per_page,
        per_page_quality_scores=quality_result.per_page_scores,
        document_quality_score=quality_result.document_score,
        document_flags=[flag],
        step_status="completed"  # UR-067: step marked completed even if quality failed
    )
else:
    # All pages passed — continue to step 3
    return ExtractionResult(
        text_per_page=text_per_page,
        confidence_per_page=confidence_per_page,
        per_page_quality_scores=quality_result.per_page_scores,
        document_quality_score=quality_result.document_score,
        document_flags=[],
        step_status="completed"
    )
```

**Key distinction** (UR-067, ADR-027): The step is marked `completed` regardless of whether
the threshold passed. `step_status` tracks whether the step ran successfully (technical
completion). Quality outcome is recorded separately — if threshold fails, a flag is written;
if threshold passes, the document moves to step 3.

---

## Step Status Recording

Steps 1 and 2 are tracked in the `pipeline_steps` table with these enums:

```python
# From packages/shared/pipeline.ts (shared with Python via config)
class PipelineStepName(Enum):
    TEXT_EXTRACTION = "text_extraction"
    TEXT_QUALITY_SCORING = "text_quality_scoring"
    PATTERN_METADATA_EXTRACTION = "pattern_metadata_extraction"
    METADATA_COMPLETENESS_SCORING = "metadata_completeness_scoring"
    LLM_COMBINED_PASS = "llm_combined_pass"
    EMBEDDING_GENERATION = "embedding_generation"
```

**Before processing** (Express):

```sql
INSERT INTO pipeline_steps (document_id, step_name, status, started_at)
VALUES (doc_123, 'text_extraction', 'running', NOW());
```

**After Python returns results** (Express):

```sql
UPDATE pipeline_steps
SET status = 'completed', completed_at = NOW()
WHERE document_id = doc_123 AND step_name = 'text_extraction';
```

**If OCR crashes** (Python catches and returns error):

```python
return ExtractionResult(
    step_status="failed",
    error_message="OCR service unavailable",
)
```

Express updates:

```sql
UPDATE pipeline_steps
SET status = 'failed', error_message = '...', attempt_count = attempt_count + 1
WHERE document_id = doc_123 AND step_name = 'text_extraction';
```

Next processing run, if `attempt_count < configurable_retry_limit`, the step is retried
(UR-068, UR-069). Once the limit is exceeded, the document is flagged.

**Important**: Python service does NOT update the database. It returns all results to Express
via HTTP. Express is the sole database writer (ADR-031). This keeps the Python service
stateless and testable without a database connection.

---

## OCR Step Output Contract

After steps 1 and 2 complete, Python returns this structure to Express:

```python
@dataclass
class OCRStepResult:
    """Combined output of steps 1 and 2."""

    # Step 1: Text extraction
    text_per_page: list[str]
    confidence_per_page: list[float]
    extraction_method: str  # "docling", "tesseract", etc.

    # Step 2: Text quality scoring
    per_page_quality_scores: list[float]
    document_quality_score: float

    # Flag outcomes
    document_flags: list[DocumentFlag]

    # Step status for pipeline_steps table
    step_status: str  # "completed" or "failed"
    error_message: str | None  # If failed, why
    # Retry logic is Express's responsibility: it reads step_status = "failed" and
    # increments attempt_count in pipeline_steps against pipeline.maxRetries (UR-068/069)
```

Express receives this and decides:

- **If `document_flags` is not empty**: Write flags to the curation queue. Do NOT continue to
  steps 3–6. Document remains unflagged in the search index until embeddings complete.

- **If `step_status == "failed"`**: Write failure to `pipeline_steps` table. Increment
  `attempt_count`. Do NOT continue to steps 3–6.

- **If `document_flags` is empty and `step_status == "completed"`**: Proceed to step 3
  (pattern-based metadata extraction).

---

## Testing OCR Steps

See [pipeline-testing-strategy.md](pipeline-testing-strategy.md) for the full strategy.

**For step 1 and 2 specifically**:

**Unit tests**: Mock the OCRService. Test:

- Text extraction loop with edge cases (zero pages, all empty, partial empty)
- Quality scoring math (confidence weight + density weight)
- Threshold evaluation logic

```python
def test_extraction_all_empty_pages():
    """If all pages are empty, flag and return early."""
    mock_ocr = MagicMock(spec=OCRService)
    mock_ocr.extract_text.side_effect = [
        OCRResult(text="", confidence=0.9),
        OCRResult(text="", confidence=0.95),
    ]

    result = extract_pages("doc.pdf", mock_ocr)

    assert result.document_flags[0].type == "extraction_failure"
    assert result.step_status == "completed"
```

**Integration tests**: Use real Docling or Tesseract with fixture documents:

```python
@pytest.mark.integration
def test_extraction_with_real_docling(fixture_pdf_path):
    """Extract text from a real fixture document using Docling."""
    ocr_service = DoclingAdapter()
    result = extract_pages(fixture_pdf_path, ocr_service)

    assert len(result.text_per_page) == 3
    assert result.document_flags == []
    assert result.per_page_quality_scores[0] >= 0
```

---

## What Comes Next

Steps 3–4 (pattern-based metadata extraction and completeness scoring) are separate and
explained in their own documentation. Steps 5–6 (LLM combined pass and embedding) are also
separate.

The key constraint: if steps 1–2 flag the document, the pipeline stops and the document is
held for manual review. Steps 3–6 only execute on documents that pass both extraction and
quality checks.
