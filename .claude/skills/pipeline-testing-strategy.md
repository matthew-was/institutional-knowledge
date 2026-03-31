# Pipeline Testing Strategy

## When to use

Use this skill when:

- Setting up tests for any component (C1, C2, C3)
- Deciding whether a given scenario warrants a unit test, integration test, or end-to-end test
- Writing fixture documents or expected-output specifications
- Configuring CI/CD pipelines to run the right tests at the right stages

---

This skill defines testing approaches for the 4-component document processing pipeline. Testing ensures
that documents flow through the system correctly, transformations are correct, and external service
failures are handled gracefully.

---

## Pattern: Testing the Pipeline

Testing is pragmatic and real-world focused, not exhaustive:

1. **Unit tests** — Narrow focus on specific business logic (pure functions, decision trees, data transformations)
   - Fast, deterministic, run on every commit
   - Mock only external services (OCR, LLM, APIs) that are slow or non-deterministic
   - Do NOT test what the language already guarantees (type safety, basic validations)

2. **Integration tests** — Primary testing type; maximize coverage per test
   - Real external services, real database (for Express/backend tests)
   - Fixture documents for Python processing tests
   - Validate end-to-end flows that matter in production
   - Mark slow tests with `@pytest.mark.integration` or similar; skip on every commit

3. **End-to-end tests** — Rare; only for critical paths after major feature completion
   - Full document flow: upload → processing → query
   - Reserved for validating happy path and critical error recovery

**Philosophy**: A single integration test that exercises a real service is worth more than ten unit
tests with mocks. Avoid exhaustive edge case testing in favour of real-world validation and real
documents during development.

---

## Unit Tests: Specific Business Logic Only

**Purpose**: Fast, deterministic tests for specific business logic. No external services required.

**How it works**:

- Use interface-driven mocking (see [dependency-composition-pattern.md](dependency-composition-pattern.md))
- Mock ONLY external services (OCR, LLM, APIs) that are slow or non-deterministic
- Keep mocking minimal; test real logic paths as much as possible
- Focus on decision logic, calculations, and data transformations — not on service wiring

**When to write unit tests**:

- Pure functions (normalisation, deduplication, string transformations)
- Decision logic (branching based on conditions, routing decisions)
- Data validation and error handling in business logic
- Complex calculations or algorithms

**When NOT to write unit tests**:

- Simple CRUD operations that just call database or storage methods
- HTTP route handlers that mostly orchestrate services (test via integration tests instead)
- Exhaustive edge case coverage (test pragmatically via integration tests)
- Simple conditional logic (type system + integration tests catch these)

**TypeScript (Express backend) Example**:

Test runner: **Vitest**

```typescript
// File: apps/backend/src/utils/__tests__/normalise.test.ts

import { describe, it, expect } from 'vitest';
import { normaliseTermName } from '../normalise';

describe('normaliseTermName', () => {
  it('converts to lowercase and removes extra whitespace', () => {
    expect(normaliseTermName('  John   Smith  ')).toBe('john smith');
    expect(normaliseTermName('ESTATE PROPERTY')).toBe('estate property');
  });

  it('removes punctuation', () => {
    expect(normaliseTermName("O'Brien")).toBe('obrien');
    expect(normaliseTermName('Smith, Esq.')).toBe('smith esq');
  });
});
```

**Python (processing service) Example**:

Test runner: **pytest**

```python
# File: services/processing/tests/test_deduplication.py

import pytest
from processing.deduplication import should_merge_entities

def test_merge_similar_person_names():
    """Entities with similar normalised names should merge."""
    assert should_merge_entities(
        {"type": "Person", "name": "John Smith"},
        {"type": "Person", "name": "john smith"}
    )

def test_do_not_merge_different_types():
    """Entities of different types should not merge."""
    assert not should_merge_entities(
        {"type": "Person", "name": "Smith"},
        {"type": "Organisation", "name": "Smith"}
    )
```

---

## Integration Tests: Primary Testing Strategy

**Purpose**: Integration tests are the workhorse. They exercise real services, real databases, and
real logic paths. A single integration test often covers more code than dozens of unit tests with mocks.

**How it works**:

- **Express backend**: Test route handlers with real database (PostgreSQL + pgvector) and real storage
  service (local filesystem or S3 mock)
- **Python processing**: Test pipeline steps with real external services (OCR, LLM, embedding)
  against fixture documents
- Mark tests so they can be skipped during rapid iteration (e.g., `@pytest.mark.integration`)
- Validate that the system works end-to-end for realistic inputs

**Fixture Documents**:

A `fixtures/` directory in `services/processing/` contains representative documents:

```text
services/processing/
├── fixtures/
│   ├── scanned-typewritten.pdf
│   ├── modern-digital.pdf
│   ├── scanned-tiff.tif
│   ├── scanned-jpeg.jpg
│   └── expected-outputs.json
├── tests/
│   ├── test_extraction.py
│   ├── test_chunking.py
│   ├── test_embedding.py
│   └── test_metadata.py
└── src/
```

Each fixture document has expected outputs per step in `expected-outputs.json`. The `dimensions`
value in the embedding section is illustrative only — the real value depends on the configured
embedding model (ADR-024) and must be updated when a model is selected at implementation time:

```json
{
  "scanned-typewritten.pdf": {
    "extraction": {
      "text_length_min": 500,
      "text_length_max": 5000,
      "contains_words": ["the", "and", "estate"]
    },
    "chunking": {
      "chunk_count_min": 3,
      "chunk_count_max": 20,
      "chunk_size_range": [100, 2000]
    },
    "embedding": {
      "dimensions": 384,
      "value_type": "float32"
    }
  }
}
```

**Python Integration Test Example**:

```python
# File: services/processing/tests/test_integration.py

import pytest
import json
from pathlib import Path
from processing.pipeline import ProcessingPipeline

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"
EXPECTED_OUTPUTS = json.loads((FIXTURES_DIR / "expected-outputs.json").read_text())

@pytest.mark.integration
@pytest.mark.parametrize("fixture_file", [
    "scanned-typewritten.pdf",
    "modern-digital.pdf",
    "scanned-tiff.tif",
])
def test_extraction_produces_valid_output(fixture_file):
    """Extraction step produces text with expected properties."""
    pipeline = ProcessingPipeline(use_real_services=True)
    fixture_path = FIXTURES_DIR / fixture_file

    result = pipeline.extract_text(str(fixture_path))

    expected = EXPECTED_OUTPUTS[fixture_file]["extraction"]
    assert len(result["text"]) >= expected["text_length_min"]
    assert len(result["text"]) <= expected["text_length_max"]
    assert result["status"] == "completed"

@pytest.mark.integration
def test_chunking_produces_valid_output():
    """Chunking step produces chunks matching expected structure."""
    pipeline = ProcessingPipeline(use_real_services=True)
    fixture_path = FIXTURES_DIR / "scanned-typewritten.pdf"

    text = pipeline.extract_text(str(fixture_path))["text"]
    result = pipeline.chunk_text(text)

    expected = EXPECTED_OUTPUTS["scanned-typewritten.pdf"]["chunking"]
    assert len(result["chunks"]) >= expected["chunk_count_min"]
    assert len(result["chunks"]) <= expected["chunk_count_max"]
    assert all(expected["chunk_size_range"][0] <= len(chunk) <= expected["chunk_size_range"][1]
              for chunk in result["chunks"])

@pytest.mark.integration
def test_embedding_produces_correct_shape():
    """Embedding step produces vectors with correct dimensions."""
    pipeline = ProcessingPipeline(use_real_services=True)
    chunk = "This is a test chunk of text from an estate document."

    result = pipeline.embed_text(chunk)

    assert len(result["embedding"]) > 0  # Dimension determined by configured provider (ADR-024)
    assert all(isinstance(v, float) for v in result["embedding"])
```

**Running integration tests**:

```bash
# Run all tests (unit only)
pytest services/processing/tests/

# Run unit tests only (skip integration)
pytest -m "not integration" services/processing/tests/

# Run integration tests only
pytest -m integration services/processing/tests/

# Run integration tests with verbose output
pytest -m integration -v services/processing/tests/
```

**When to write integration tests**:

- After a new external service is integrated (OCR engine, LLM, embedding model)
- When testing a pipeline step that depends on real external services
- When validating that a service version upgrade works correctly
- When diagnosing integration failures discovered in end-to-end testing

**What integration tests validate**:

- Real services produce output matching expected structure
- Services handle fixture documents without error
- Service configuration is correct (API keys, model paths, etc.)
- Service version changes do not break expected output shape

---

## End-to-End Tests: Full Document Flow

**Purpose**: Validate that a complete document flows through the entire pipeline correctly, from
upload through processing through query.

**How it works**:

- Create test documents and upload them via the Next.js frontend
- Trigger processing via the fire-and-forget pattern (ADR-026)
- Wait for pipeline completion (poll the curation queue via REST API)
- Validate that documents appear in query results with correct metadata
- Use test fixture documents, not real documents

**Test scope**:

End-to-end tests are slower than unit or integration tests (they exercise the full stack). They
should cover critical paths only:

1. **Happy path**: Intake → Extraction → Embedding → Query succeeds for normal documents
2. **Error recovery**: Processing failure is recorded and documents can be retried (ADR-027)
3. **Vocabulary curation**: Documents can be curated after processing (cross-cutting concern)
4. **Graph rebuild**: Graph can be rebuilt after vocabulary changes (ADR-039)

**Example: Happy Path End-to-End Test**

```typescript
// File: apps/backend/src/__tests__/e2e.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase } from '../test-utils/database';
import { createTestServer } from '../test-utils/server';
import { TestClient } from '../test-utils/client';

describe('End-to-End: Document Processing', () => {
  let client: TestClient;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const { server, cleanupFn } = await createTestServer();
    client = new TestClient(server);
    cleanup = cleanupFn;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should process a document from upload through query', async () => {
    // Step 1: Initiate upload
    const initiateResp = await client.post('/documents/initiate', {
      filename: 'test-document.pdf',
      size: 5000,
    });
    expect(initiateResp.status).toBe(200);
    const uploadId = initiateResp.body.uploadId;

    // Step 2: Upload file
    const uploadResp = await client.post(`/documents/${uploadId}/upload`, {
      body: Buffer.from('PDF content here'),
    });
    expect(uploadResp.status).toBe(200);

    // Step 3: Finalize upload
    const finalizeResp = await client.post(`/documents/${uploadId}/finalize`, {
      hash: 'abc123def456',
    });
    expect(finalizeResp.status).toBe(200);
    const documentId = finalizeResp.body.documentId;

    // Step 4: Trigger processing (fire-and-forget)
    const processResp = await client.post('/documents/process', {
      documentId,
    });
    expect(processResp.status).toBe(202); // Accepted (async)

    // Step 5: Poll for completion
    let processingComplete = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 * 1 second = 30 seconds timeout

    while (!processingComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      const statusResp = await client.get(`/documents/${documentId}/status`);
      if (statusResp.body.status === 'processed') {
        processingComplete = true;
      }
      attempts++;
    }
    expect(processingComplete).toBe(true);

    // Step 6: Verify document metadata was extracted
    const docResp = await client.get(`/documents/${documentId}`);
    expect(docResp.body.metadata).toBeDefined();
    expect(docResp.body.chunks).toHaveLength(docResp.body.chunkCount);

    // Step 7: Query for the document
    const queryResp = await client.post('/query', {
      query: 'estate document',
      topK: 10,
    });
    expect(queryResp.status).toBe(200);
    const resultsIncludeDocument = queryResp.body.results.some(
      (r: any) => r.documentId === documentId
    );
    expect(resultsIncludeDocument).toBe(true);
  });

  it('should record and display pipeline failures', async () => {
    // Upload and finalize a document
    const initiateResp = await client.post('/documents/initiate', {
      filename: 'corrupted-document.pdf',
      size: 1000,
    });
    const uploadId = initiateResp.body.uploadId;

    await client.post(`/documents/${uploadId}/upload`, {
      body: Buffer.from('Invalid PDF content'),
    });

    const finalizeResp = await client.post(`/documents/${uploadId}/finalize`, {
      hash: 'badbadbad',
    });
    const documentId = finalizeResp.body.documentId;

    // Trigger processing
    await client.post('/documents/process', { documentId });

    // Poll for failure
    let processingComplete = false;
    let attempts = 0;
    while (!processingComplete && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResp = await client.get(`/documents/${documentId}/status`);
      if (statusResp.body.status === 'failed') {
        processingComplete = true;
      }
      attempts++;
    }
    expect(processingComplete).toBe(true);

    // Verify failure is recorded
    const docResp = await client.get(`/documents/${documentId}`);
    expect(docResp.body.status).toBe('failed');
    expect(docResp.body.errorMessage).toBeDefined();

    // Retry should work
    const retryResp = await client.post(`/documents/${documentId}/retry`);
    expect(retryResp.status).toBe(202);
  });
});
```

**Running end-to-end tests**:

```bash
# Run E2E tests only
vitest --run apps/backend/__tests__/e2e.test.ts

# Run with verbose output
vitest --run --reporter=verbose apps/backend/__tests__/e2e.test.ts

# Run against a live server (for manual testing)
# Set NODE_ENV=test before running
```

**When to write end-to-end tests**:

- After major features are implemented (intake, processing, query)
- When testing error recovery and retry logic
- When validating the full flow works with real data (though still using fixtures)
- When diagnosing issues that appear in production but not in isolated tests

**What end-to-end tests validate**:

- Documents can be uploaded, processed, and queried successfully
- Pipeline failures are recorded and can be retried
- Asynchronous processing completes correctly (fire-and-forget pattern)
- Metadata extraction produces queryable results

---

## Test Data and Fixtures

**Phase 1 Fixture Documents**:

Phase 1 processes four document types:

1. **Scanned typewritten PDF** — Historical documents scanned from physical typewritten pages
   - Challenges: Variable quality, potential OCR errors, metadata may be missing
   - Example: Estate management ledger from 1970s

2. **Modern digital PDF** — Documents born digital or professionally scanned
   - Challenges: Varied fonts, layouts, embedded metadata
   - Example: Modern property deed with tables

3. **Scanned TIFF** — High-resolution scans
   - Challenges: Large file size, multi-page handling
   - Example: Multi-page document scanned as separate TIFFs

4. **Scanned JPEG/PNG** — Photo scans of documents
   - Challenges: Compression artifacts, variable resolution, rotation
   - Example: Photographs of old letters or documents

Each fixture should be:

- **Minimal**: Small enough to process quickly (< 5 MB)
- **Representative**: Cover Phase 1 document types
- **Annotated**: Include expected outputs for each pipeline step
- **Version-controlled**: Stored in Git alongside the processing code

**Creating a Fixture Document**:

```bash
# Create a small test PDF using ImageMagick or similar
convert -size 200x200 xc:white -font DejaVu-Sans -pointsize 12 \
  -draw "text 10,20 'Test Estate Document'" test-document.pdf

# Add to fixtures directory
cp test-document.pdf services/processing/fixtures/

# Document expected outputs in expected-outputs.json
```

---

## CI/CD Integration

**GitHub Actions (or equivalent)**:

Phase 1 CI/CD should:

1. Run unit tests on every commit (fast, no external dependencies)
2. Run integration tests on Pull Requests and main branch pushes (slower, optional on commits)
3. Run end-to-end tests on main branch and release builds (slowest, full validation)

Example GitHub Actions workflow:

```yaml
# File: .github/workflows/test.yml

name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      - uses: actions/setup-python@v4
        with:
          python-version: '3.13'
          cache: 'pip'
      - run: pnpm install
      - run: pnpm test:unit
      - run: pip install -r services/processing/requirements.txt
      - run: pytest services/processing/tests/ -m "not integration"

  integration-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request' || github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.13'
      - run: pip install -r services/processing/requirements.txt
      - run: pytest services/processing/tests/ -m integration -v

  e2e-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test:e2e
```

---

## Testing Patterns by Service

### Next.js Frontend (apps/frontend/)

The frontend validates input and manages the user-facing intake and curation workflows. It does not
process documents or query the database directly — all operations go through the Express backend.

**Test runner**: **Vitest**

**Unit tests** (React Testing Library):

Test React components in isolation with mocked API responses. Focus on user interactions, not
implementation details.

```typescript
// File: apps/frontend/src/__tests__/DocumentUpload.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { DocumentUpload } from '../components/DocumentUpload';

describe('DocumentUpload', () => {
  it('displays error when file is too large', async () => {
    render(<DocumentUpload maxSize={5000} />);

    const largeFile = new File(['x'.repeat(10000)], 'large.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/select file/i);

    fireEvent.change(input, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/file is too large/i)).toBeInTheDocument();
    });
  });

  it('calls onUpload when form is submitted with valid file', async () => {
    const mockOnUpload = vi.fn();
    render(<DocumentUpload onUpload={mockOnUpload} />);

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/select file/i);
    fireEvent.change(input, { target: { files: [file] } });

    const submitButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnUpload).toHaveBeenCalledWith(file);
    });
  });
});
```

**Integration tests**: Next.js routes with mocked Express API responses (via MSW — Mock Service Worker)

```typescript
// File: apps/frontend/src/__tests__/integration/upload.integration.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { DocumentUploadFlow } from '../pages/upload';

const server = setupServer(
  http.post('/api/documents/initiate', () => {
    return HttpResponse.json({ uploadId: 'upload-123' });
  }),
  http.post('/api/documents/:uploadId/upload', () => {
    return HttpResponse.json({ status: 'uploaded' });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Upload Flow Integration', () => {
  it('completes full upload flow from file selection to confirmation', async () => {
    render(<DocumentUploadFlow />);

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/select file/i);
    fireEvent.change(input, { target: { files: [file] } });

    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByText(/upload complete/i)).toBeInTheDocument();
    });
  });
});
```

**Accessibility Testing** (Phase 2):

Phase 2 will introduce structured accessibility testing using **axe-core** and **@testing-library/jest-dom**:

```typescript
// File: apps/frontend/src/__tests__/accessibility.test.tsx (Phase 2)

import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { DocumentUpload } from '../components/DocumentUpload';

expect.extend(toHaveNoViolations);

describe('DocumentUpload Accessibility (Phase 2)', () => {
  it('has no automatic accessibility violations', async () => {
    const { container } = render(<DocumentUpload />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has proper ARIA labels for form inputs', () => {
    render(<DocumentUpload />);
    expect(screen.getByLabelText(/select file/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });

  it('supports keyboard navigation', () => {
    render(<DocumentUpload />);
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    uploadButton.focus();
    expect(uploadButton).toHaveFocus();
  });
});
```

**Key testing guidelines**:

- Use React Testing Library; avoid testing implementation details (internal state, refs)
- Query elements as users would: by label, role, or visible text — not by CSS class
- Integration tests use MSW to mock API responses; no test database needed for frontend tests
- Phase 1: functional testing with React Testing Library
- Phase 2: add axe-core for automated accessibility checking + manual accessibility review

**Key edge cases**:

- File selection UI with oversized files (rejected before upload attempt)
- Invalid file types (rejected before upload attempt)
- Network failures during upload (retry logic, error display)
- Concurrent upload attempts (second attempt blocked until first completes)
- Vocabulary curation with conflicting edits (optimistic updates, conflict resolution)

### Express Backend (apps/backend/)

Express is the sole database writer (ADR-031) and coordinates the workflow between the frontend,
Python processing service, and storage. It handles document intake, pipeline orchestration, vocabulary
curation, and graph operations.

**Unit tests**: Route handlers with mocked database and storage services (see dependency-composition-pattern.md)
**Integration tests**: Real database (PostgreSQL with pgvector), real storage service
**E2E tests**: Full workflows (intake → curation → graph rebuild)

**Key edge cases**:

- Document intake with hash mismatch (finalize step fails, status marked `failed`)
- Processing request for already-processing document (returns 409 or enqueues as retry per implementation)
- Vocabulary curation with term duplicates (merge logic, relationship updates)
- Graph rebuild after vocabulary changes (all entities and relationships re-indexed)
- Database transaction rollback on concurrent writes (Express is sole writer, so conflicts should be rare)

### Python Processing Service (services/processing/)

The Python service processes documents through a 6-step pipeline: extraction, quality scoring, pattern
metadata, completeness scoring, LLM combined pass, embedding. It has no database connection and reports
results back to Express via HTTP (ADR-031).

**Unit tests**: Each pipeline step with mocked external services (OCR, LLM, embedding model)
**Integration tests**: Real OCR (Docling), real LLM (Ollama), real embedding model against fixture documents
**E2E tests**: Full 6-step pipeline against fixture documents

**Key edge cases**:

- OCR failure (step marked `failed`, error recorded, Express receives HTTP error)
- LLM unavailable (step marked `failed`, error recorded, document eligible for retry per ADR-027)
- High-dimensional embeddings (payload size validated, large HTTP response acceptable)
- Pipeline re-entrancy (document at lower pipeline version eligible for reprocessing per ADR-027)
- Malformed input from Express (early validation, clear error messages)

---

## Pragmatic Testing Approach

1. **Integration tests first**: If it's easier to write a real integration test than a mocked unit
   test, do the integration test. Mocking adds complexity; avoid it when not necessary.

2. **Skip exhaustive edge case testing**: Test the happy path and critical failures. Edge cases that
   don't occur in practice waste time. Real documents during development catch the important ones.

3. **Avoid over-mocking**: Mock only external services (OCR, LLM, APIs) that are slow or
   non-deterministic. Keep business logic mocks to a minimum.

4. **Test behaviour, not implementation**: A test should describe what the system does, not how it
   does it. Refactoring the implementation should not break tests.

5. **Slow tests are fine if they're integration tests**: Skip them during rapid iteration (`@pytest.mark.integration`)
   but run them on commits to main. Unit tests must be fast (< 5 seconds total).

6. **Real documents over fixtures**: Phase 1 includes real-world testing from day one
   (development-principles.md principle 3). Fixture documents + integration tests validate
   implementation; real documents validate assumptions.

---

## Related Skills

- [configuration-patterns.md](configuration-patterns.md) — How services are configured (used in
  mocking to swap implementations)
- [dependency-composition-pattern.md](dependency-composition-pattern.md) — How to structure services
  for testability (prerequisite for understanding mock injection)
- [metadata-schema.md](metadata-schema.md) — Entity extraction schema (tested as part of C2)
