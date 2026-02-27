# Estate Intelligence Project: Decisions & Rationale Review

## Decisions Made (With Explicit Selection)

### Component Architecture

- **Decision**: Merged Components 2 & 3 (Text Extraction and Embedding & Storage) into a single logical unit during design, though they remain separate in implementation
  - *Quote*: "I hadn't noticed that component 2 and 3 were separate when they are actually closely coupled... Would it make more sense for this discussion to assume components 2 and 3 are together?"
  - *Implication*: This is a design-time coupling, not an implementation coupling. They should be designed together, built separately.

### OCR Engine Selection

- **Decision**: Docling as primary OCR engine, not Tesseract
  - *Quote*: "I think Docling would be better... it is slower but is much better at capturing the document structure than Tesseract alone"
  - *Rationale*: Better structure preservation (important for deeds, letters with formal formatting, maps with labels); more accurate handling of mixed content
  - *Tradeoff accepted*: Slower processing acceptable for learning phase

### Quality Scoring Gate Timing

- **Decision**: All documents process regardless of quality in Phase 1; quality gates deferred to Phase 3+
  - *Quote*: "for the first pass and learning go with option a [proceed regardless of quality]... this needs to be added to component 1 during a later build phase"
  - *Rationale*: Learning phase prioritizes data volume and visibility; low-quality documents still provide value (metadata, relationships, patterns)

### Domain Context Model

- **Decision**: Human maintains authoritative domain context document; system flags candidates for approval
  - *Quote*: "the user (me) should maintain the domain context, but component 2 should feedback additions to be added when it hits something... maybe it has an internal document to keep track and once something has shown up a few times it can flag it"
  - *Rationale*: "Prevents the system from running away with itself" (not making confident assumptions autonomously)

### Domain Context Flagging Mechanism

- **Decision**: Frequency-based flagging with threshold; high-confidence candidates only
  - *Quote*: "The feedback should be fairly high confidence stuff but it would be good to be able to tune this over time"
  - *Implementation*: Track candidate frequency, flag when appearing N times (configurable)

### Domain Context Application Timing

- **Decision**: Apply domain context in a subsequent reprocessing pass, not during initial extraction
  - *Quote*: "The context should be applied in a subsequent pass of the document just so the system doesn't run away with itself"
  - *Rationale*: Safety against cascading incorrect assumptions

### Document Chunking for Maps/Plans

- **Decision**: Single visual chunk + separate metadata chunks (not fragmented chunks)
  - *Quote*: "I feel like a map only makes sense as a whole thing so should be a single chunk"
  - *Insight*: Your intuition → research on embeddings → recognition of parent document retrieval as solution

### Parent Document Retrieval Pattern

- **Decision**: All chunks maintain parent document references for context retrieval
  - *Quote*: "The concept [parent document retrieval] would work well for maps, but might be a useful general approach"
  - *Benefit*: Solves map coherence problem while enabling RAG context retrieval

### Email Chunking Strategy

- **Decision**: Semantic chunking of individual messages (not single-chunk email threads)
  - *Quote*: "semantic chunking approach for emails might make most sense... [to avoid] potential size variability of single email"
  - *Rationale*: Prevents chunk size variability; preserves thread context via parent reference

### Metadata at Upload vs. Processing

- **Decision**: User provides minimal (date + broad category); Component 2 extracts/enriches everything else
  - *Quote*: "The user can fairly confidently give a date... To start with broad buckets should be enough... it would be good to design into the system to be able to make suggestions for other buckets and have the ability to re-process old documents"

### OCR Quality Assumption

- **Decision**: Assume Docling produces acceptable text (~95%+ accuracy on typewritten documents); validate through iteration
  - *Quote*: "lets start with assuming OCR is good enough and see where things go. If it isn't good enough then we throw out the embedding and start again"
  - *Rationale*: "Learning-focused approach. Real-world iteration beats speculative architecture"

### Category Detection in Phase 1

- **Decision**: Pattern-based heuristics (rules per category), not LLM-based
  - *Quote*: "Pattern-based detection for Phase 1 (rules for different document types)... Phase 2: LLM-based validation"
  - *Rationale*: Observable, refinable, lower complexity for MVP

### Semantic Chunking in Phase 1

- **Decision**: Heuristic-based (paragraph breaks, section headers), not ML-based
  - *Quote*: "Use simple heuristics for Phase 1 (paragraph breaks, sentence boundaries), upgrade to ML-based approach in Phase 2"
  - *Rationale*: Simple to implement, results observable, refinable based on real-world feedback

---

## Rationale (Implied but Not Fully Written Down)

### Why Incremental Intelligence Matters

- **Implied reasoning**: "The dev team need to research to make informed choices" and "you should research embeddings before deciding on chunking"
  - *Insight*: System complexity should be added deliberately with understanding, not speculatively
  - *Applies to*: Chunking strategy, classification logic, entity extraction

### Why Structure Preservation Matters for Your Documents

- **Implied reasoning**: Estate documents have specific formatting (deeds with legal structure, letters with signatures, maps with labels) that conveys meaning
  - *Evidence*: Chose Docling specifically because it "captures document structure"; maps need "visual coherence"
  - *Impact*: OCR choice, chunking strategy, metadata extraction must respect layout

### Why Human Review is Better Than Automation (For Domain Context)

- **Implied reasoning**: You know your documents and terminology better than system can infer; wrong assumptions cascade
  - *Quote*: "prevents the system from running away with itself"
  - *Applies to*: Domain context, entity definitions, relationship interpretation

### Why Real-World Iteration Beats Speculation

- **Implied reasoning**: Testing on your actual documents will reveal what works better than abstract reasoning
  - *Examples*: OCR quality validation, chunking boundary coherence, category detection accuracy
  - *Drives*: Phase 1 priorities (observable, testable things first)

### Why Quality Scoring Must Be Reliable

- **Implied reasoning**: Quality scores are the visibility mechanism—if they're wrong, you can't trust downstream decisions
  - *Impact*: Quality score validation against manual assessment is Phase 1 success criterion
  - *Downstream use*: Retrieval ranking, future quality gates, manual review prioritization

---

## Constraints & Requirements That Emerged

### Metadata Requirements

- Documents must track: date/date-range, document type, entities mentioned, relationships between documents, threading information (emails)
- *Quote*: "Documents should track: Date/date ranges, Document type, Entities mentioned, Relationships between documents, Threading information for emails"

### User Input Simplification

- User can reliably provide: creation date (even approximate: month/year), broad category
- *Quote*: "The user can fairly confidently give a date the document was created (even if it is only month and year but that should be enough)"

### Document Coverage

- Initial scale: hundreds of documents for learning phase
- Target scale: tens of thousands
- *Quote*: "Initial scale: Hundreds of documents for learning phase. Target scale: Tens of thousands of documents"

### OCR Quality Baseline

- Acceptable baseline: 95%+ accuracy on typewritten documents
- *Quote*: "Extracted text is 95%+ readable for typewritten/printed documents" (success criterion)
- *Context*: Your documents are "mostly typewritten rather than handwritten, making OCR more reliable"

### Chunking Coherence Requirement

- Chunks must be semantically coherent (topics stay together)
- *Quote*: "Chunking preserves semantic coherence (topics stay together)"

### Parent Document Integrity

- All chunks must have valid parent references
- *Quote*: "Parent document references valid and retrievable" (success criterion)

### Domain Context Feedback Quality

- System should suggest candidates user approves >80% of the time
- *Quote*: "Domain context suggestions are high-confidence (user approves >80% of suggestions)" (success criterion)

### Reprocessing Capability

- System must support reprocessing documents when domain context is updated
- *Quote*: "have the ability to re-process old documents to adjust buckets"

### Map/Plan Handling

- Maps must remain discoverable but maintain visual integrity
- *Quote*: "should probably be marked as for reference instead of a primary source of information"
- *Constraint*: Single chunk preserves coherence, metadata chunks enable discoverability

---

## Tensions with Existing ADRs

### ✅ Infrastructure as Configuration

- **Status**: ALIGNED
- **How**: Component 2 explicitly designed with abstraction layers:
  - *Quote*: "OCR engine selection (Docling primary, Tesseract fallback, alternatives pluggable)"
  - *Quote*: "Storage backend for document references (S3, local filesystem)"
  - *Quote*: "LLM/embedding service for context-aware extraction (Phase 2+)"
- **Note**: Abstraction pattern recommended throughout specification

### ✅ PostgreSQL + pgvector (not dedicated vector DB)

- **Status**: ALIGNED
- **How**: Specification assumes pgvector storage; no alternative vector DB mentioned
- **Quote**: "Storage in PostgreSQL with pgvector" (architecture diagram)
- **Component 3 design assumes**: "Store embeddings + metadata + parent references in PostgreSQL with pgvector"

### ⚠️ 4-Component Pipeline (C1 Intake, C2 Extraction+Embedding, C3 Query, C4 Continuous Ingestion)

- **Status**: TENSION IDENTIFIED
- **Issue**: Specification shows Components 2 & 3 as merged during design, but existing ADR has them separate
- **Quote**: "I hadn't noticed that component 2 and 3 were separate when they are actually closely coupled... Would it make more sense for this discussion to assume components 2 and 3 are together?"
- **Resolution**: They're designed together but implemented separately (design-time coupling, not implementation coupling)
- **New clarity**: Component 2 outputs chunks ready for Component 3's embedding process
- **Action required**: Clarify in high-level ADR whether this is intentional coupling or should be revisited

### ✅ Human-Maintained Domain Context

- **Status**: ALIGNED
- **How**: Specification explicitly enforces human control
- **Quote**: "You maintain official domain context document. Component 2 flags candidates, you approve additions"
- **Quote**: "Component 2 should feedback additions to be added when it hits something... once something has shown up a few times it can flag it"
- **Never autonomous**: System proposes, human decides; never auto-adds

### ⚠️ Three-Layer Security (Browser → Next.js → Express)

- **Status**: NOT ADDRESSED IN THIS CONVERSATION
- **Why**: Component 2 design is Python-based backend processing, not user-facing web layer
- **Quote**: "TypeScript/Node.js for orchestration. Python for OCR and AI/ML components"
- **Implication**: Component 2 runs on backend infrastructure; security layer is at orchestration/API boundary (Next.js/Express)
- **Action required**: Clarify how Component 2's outputs are secured as they move through pipeline

### ⚠️ Monorepo with pnpm Workspaces

- **Status**: POTENTIAL TENSION
- **Issue**: Component 2 is Python; monorepo pattern is TypeScript-focused
- **Quote**: "TypeScript/Node.js for orchestration. Python for OCR and AI/ML components"
- **Options**:
  1. Python is separate from monorepo (Docker container, separate deployment)
  2. Python code lives in monorepo but separate workspace with different build/test tooling
  3. Reconsider architecture to reduce Python surface area
- **Action required**: Decide Python's role relative to monorepo structure

---

## Key Decisions Not Yet Made (Deferred to Implementation)

### Chunking Heuristic Details

- *Quote*: "Semantic chunking heuristics for Phase 1: define exact rules for your document types"
- *Decision point*: Development team during Phase 1 implementation

### Category Detection Patterns

- *Quote*: "enumerate characteristics of each category (emails have from/to, etc.)"
- *Decision point*: Development team, informed by first real-world documents

### Domain Context Flagging Threshold

- *Quote*: "configurable parameter for threshold (default: 5?)"
- *Decision point*: You during Phase 1, based on feedback volume

### Error Handling Specifics

- *Quote*: "decide: should one extraction failure (e.g., OCR hangs) block entire document, or should it gracefully degrade?"
- *Recommendation*: Graceful degradation
- *Decision point*: Development team

### Batch vs. Streaming Processing

- *Quote*: "Batch processing improvements" (Phase 4)
- *Implication*: Phase 1 likely synchronous/on-demand, Phase 4 adds async batch
- *Decision point*: Phase 2+ architectural review

---

## Summary: What Changed From Initial Planning

### Clarifications (Not Changes)

1. **Component 2 & 3 relationship**: Clarified they're designed together but remain separate components
2. **OCR engine**: Upgraded from Tesseract assumption to Docling choice
3. **Chunking strategy**: Confirmed parent document retrieval pattern solves map coherence problem
4. **Domain context**: Explicit workflow for flagging, user approval, and reprocessing

### New Requirements Surfaced

1. Structure preservation in OCR (Docling benefit)
2. Reprocessing capability for domain context updates
3. Frequency tracking for candidate entities
4. Quality score reliability validation

### Design Principles Established

1. Incremental intelligence (simple → complex over phases)
2. Observable metrics (quality scores, domain context frequency tracking)
3. Real-world iteration (test assumptions on actual documents)
4. Human-in-the-loop (system proposes, human decides)
5. Graceful degradation (partial failures don't block pipeline)

### Architecture Decisions Locked

1. Docling for OCR (structure preservation priority)
2. PostgreSQL + pgvector (no alternatives mentioned)
3. Heuristic-based logic in Phase 1 (LLM in Phase 2+)
4. Parent document references for all chunks
5. Frequency-based candidate flagging
