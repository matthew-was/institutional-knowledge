# Project Overview

## Why This Project Exists

The Institutional Knowledge system exists to preserve and make accessible the recorded history of long-established institutions. Critical knowledge—land records, agreements, correspondence, decisions, and institutional history—exists only as physical and digital documents, scattered across archives and storage systems, unsearchable, and at risk of being lost as knowledge passes between people.

The system creates a searchable archive of these documents. A user asks a question in plain language and the system reads the relevant documents and answers directly, citing its sources.

This project also serves as a deliberate learning vehicle. The developer is using a real, meaningful problem to build practical expertise in AI and document processing. Design decisions throughout favour understanding over convenience.

---

## Who the System Is For

| User | Phase | Description |
| --- | --- | --- |
| Primary Archivist | 1 | Builds and maintains the archive; has all capabilities available in each phase |
| Authorized User | 2 | Full archival and curation access; no document deletion |
| Occasional Contributor | 3 | Queries the archive; may submit documents; no curation access |
| System Administrator | 3 | Manages infrastructure and user accounts; separated from the Archivist role |

The system is private at all phases. There is no public access and no self-registration.

In Phase 1 there is a single user and no authentication — the Primary Archivist is the system. The System Administrator role is introduced in Phase 3, when infrastructure and user account management are separated from the Archivist's responsibilities.

---

## What Documents the System Handles

| Document Type | Phase |
| --- | --- |
| Typewritten and printed documents (scanned) | 1 |
| Modern digital PDFs, correspondence, financial documents | 1 |
| Handwritten letters and notes | 2 |
| Maps, plans, and surveys | 2 |
| Emails (raw format) | 2 |
| Standalone photographs | Deferred / future phase |

Accepted file formats by phase:

| Format | Phase |
| --- | --- |
| PDF | 1 |
| TIFF | 1 |
| JPEG | 1 |
| PNG | 1 |
| DOCX | 2 |
| EML | 2 |

Audio, video, structured data files, and web content are out of scope. Physical documents must be digitised before submission — scanning is not a system responsibility.

---

## What the System Must Do

### Phase 1 — Prove the Pipeline

A complete end-to-end pipeline running locally, used by one person. Phase 1 is designed for use in a single browser session at a time. Document upload and curation via a simple web UI; query via command line. The web UI is unpolished but functional — it is not required to be a polished or fully-featured interface at this stage; the web UI is the intended primary interface for intake and curation and will be enhanced in Phase 2; the CLI remains available for query at all phases and is not deprecated when web UI query is introduced in Phase 2. Document upload, curation, and vocabulary management are sections of a single web application; the same "unpolished but functional" standard applies to all sections. Bulk ingestion is via on-demand CLI command. The CLI is a developer-facing tool used for query and bulk ingestion: functional and minimally documented, but not required to be a polished user interface.

Files submitted via bulk ingestion must follow a structured naming convention: `YYYY-MM-DD - short description` (for example, `1962-08-20 - letter from estate manager about updates`); files that do not conform are rejected and the reason is included in the summary report. The filename stem is parsed into date and description metadata fields, which then feed archive reference derivation identically to a web UI submission. For web UI uploads, the user completes a structured form; the Phase 1 form captures date and description (additional fields are expected to be added as the system develops and real metadata needs become clear); submitting the form with an empty or syntactically invalid date is a validation error — the form rejects the submission and prompts the user to correct it; matching validation is enforced server-side; submitting the form with an empty or whitespace-only description is also a validation error — the form rejects the submission and prompts the user to correct it; matching validation is enforced server-side; if the uploaded filename follows the naming convention it is parsed on selection and the matching fields are pre-populated, but the form fields are the canonical input and any filename is accepted; the web UI enforces accepted file formats client-side (file picker restricted to accepted formats) and server-side (format check on upload) — a file with an unrecognised format is rejected with an actionable error message; if the parsed date is not a valid calendar date, the date field is left empty and the user fills it in manually — no error is shown. Both intake routes populate the same metadata model — they differ only in how that metadata is initially provided. Web UI document submission is atomic — if an upload is interrupted, nothing is stored; the mechanism for ensuring this is an architectural concern.

**Must have**:

- Accept document uploads via web UI; bulk ingestion from a directory via on-demand CLI command (watched directory is out of scope at all phases); the source directory must contain only files — the presence of sub-directories is treated as an error and the run does not proceed; when a run is halted by sub-directory detection, the summary report is still produced with zero counts and a clear actionable error message identifying which sub-directories were found; bulk ingestion and document processing are separate steps — ingestion stores files, processing runs independently; a bulk ingestion run is atomic — if the run is interrupted (process killed, system crash), it is rolled back and no files from the interrupted run are stored; cleanup of any incomplete prior run occurs at the start of every ingestion run, before any new work is accepted — this ensures cleanup is triggered regardless of whether the process was restarted; no summary report is produced for an interrupted run; concurrent bulk ingestion runs are not supported in Phase 1 — behaviour if two runs are started simultaneously is undefined; per-file validation applies format checking before size checking — if a file fails format validation the size check is not reached; a file with no extension or an unrecognised extension is treated as a format validation failure and rejected
- Produce a bulk ingestion summary report after each run: a summary header (total submitted, accepted, rejected) followed by a per-file record of filename, outcome, and rejection reason where applicable; printed to stdout and written to a timestamped file in a configurable output directory (if the output directory does not exist at run time, it is created automatically; if the output directory cannot be created, an actionable error is reported — whether this causes the run to abort or affects only the file write of the report is an architectural decision dependent on when directory creation is attempted); if the source directory is empty or contains no conforming files, the report still runs and shows zero counts with a note that no files were found
- Detect and reject exact duplicate files by file hash; hash-based duplicate detection applies to individual files regardless of whether they are submitted standalone or as part of a virtual document group; hash-based duplicate detection is checked against the full archive of previously accepted files — a file submitted in a later run that matches an already-accepted file is rejected as a duplicate; content-based duplicate detection (rescanned copies of the same document) is deferred to a future phase (duplicate detection behaviour for inline email attachments such as signature images is an open question deferred to Phase 2 scope)
- Enforce a configurable maximum file size per file; the limit applies to each individual file in a submission, including files within a virtual document group; zero and negative values are not valid configuration values and are rejected at startup with an actionable error message
- Support grouping multiple files into a single virtual document at submission time; in Phase 1 grouping is available via bulk ingestion CLI only — web UI grouping is deferred to Phase 2; multi-part scanned documents (e.g. a multi-page deed scanned as separate image files) are submitted and processed as one logical unit and referenced as such in query results; if any file in a group fails intake validation (including duplicate detection), the entire group is rejected — no partial groups are stored; Phase 1 uses fail-fast validation: processing stops on the first failure and remaining files are reported as not attempted; failing files are reported with their rejection reason; files in the same group that were not reached due to fail-fast are listed with outcome 'not attempted'; passing files are not listed individually; the option to switch to try-all validation (validating every file and reporting all failures in a single pass) is introduced in Phase 2 as a per-request CLI flag; a group containing a single file is valid and processed identically to a standalone submission; a zero-file group is a validation error and is rejected at intake; if two files in the same group share a filename, the group is rejected at intake — filenames within a group may carry semantic meaning and duplicate filenames are ambiguous; the system is stateless with respect to rejected files — a rejected file is not stored, so a re-submission in a later run is treated as a fresh submission with no memory of the previous rejection
- Extract text from typed and printed documents; produce a quality score per page and for the document as a whole, representing confidence that the extracted text is a faithful and complete representation of the document content; scores are in the range 0–100; all pages in a document are always evaluated — there is no fail-fast within a document; a document fails if any page fails the text quality threshold; text quality and metadata completeness are assessed with separate checks, each with an independent configurable threshold — a document must satisfy both to proceed without a flag; when both thresholds fail simultaneously, both failures are recorded in the flag reason as a single flag with multiple reasons; the flag reason includes the full list of failing pages so the user has a complete picture of what needs review; the exact relationship between the two checks may be revised once real-world usage is observed
- Flag poor-quality extractions for human review; documents failing the text quality or metadata threshold on any page or overall, documents that produce no extractable text, documents where only some pages yield text (partial extraction), or documents that open successfully but contain zero pages are stored and flagged for manual review rather than rejected (they may be plans, maps, or images requiring manual data entry); for documents with mixed extractable and non-extractable pages, the whole document is held pending review — no partial embeddings are generated; flagged documents have not completed the pipeline (embedding is the final step) and are therefore absent from the search index until the flag is cleared; a document remains absent from the search index until the embedding step completes successfully — there is no transient visibility window during pipeline resumption; each pipeline step records its own completion status independently of quality outcome — a step that ran successfully is marked complete even if its output failed a quality threshold; a step that fails due to a technical error (service unavailable, unhandled exception) is recorded as incomplete and retried on the next processing run; a configurable retry limit prevents infinite retry loops — when the limit is exceeded the document is flagged with the error reason and surfaced in the curation queue; clearing a flag marks the document as ready to resume from the next incomplete step — it does not re-run completed steps and does not automatically trigger processing; flag-clearing and processing resumption are separate manual actions in Phase 1; the trigger mechanism is an architectural concern that may be automated in later phases; clearing a flag clears the flag reason field; if processing fails again after a flag is cleared, the document is re-flagged by the same mechanism and returns to the curation queue with the reason field written fresh — no accumulation of prior reasons is retained; in Phase 1, a document with no extractable text has no in-app resolution path — it remains flagged and absent from the search index until Phase 2 supplementary context is available; stored files are immutable once accepted — if a stored file is missing or unreadable when re-processing is attempted, the document is flagged with the error reason (file missing or unreadable) and surfaces in the curation queue; there is no in-app resolution path in Phase 1 or Phase 2 — the flag message states this and directs the user to act on the underlying storage directly; processing continues for other documents; the flag mechanism is the single reporting location for all document-level failures
- Reject files that cannot be opened or parsed at intake (including empty or zero-byte files), or that do not conform to the required filename convention (bulk ingestion only); rejected files are not stored
- Detect document type, dates, people, organisations, and description automatically; metadata completeness is assessed independently of text quality (see the quality scoring note above) — a document with good text extraction but no detectable metadata may still be flagged if it fails the metadata threshold; partial detection (some fields found, others not) is not itself a flag trigger — the completeness score reflects the degree of detection and is evaluated against the threshold; a document with partial detection may pass or fail depending on its score; the specific metadata fields assessed and the method by which completeness is scored are deferred to the architecture phase — they depend on what the extraction pipeline can reliably produce; the configurable threshold operates against whatever score the implementation defines; if the system detects a description, it overwrites the description provided at intake — if no description is detected, the intake description is preserved; the curator may correct the description further via the curation UI
- Generate embeddings for each document chunk; chunk boundaries are determined by an AI agent that reads the document content and identifies semantically meaningful units, rather than by fixed-size splitting — ensuring that related content (a clause, a paragraph, a named transaction) is kept together in a single embedding
- Maintain a domain vocabulary of institution-specific terms (named entities, organisations, roles, recurring concepts and phrases); the vocabulary is stored entirely in the database, which is the single source of truth; the database is initialised from a seed script on first use and in development environments — the seed script provides an initial vocabulary (not an empty one); the schema and full content of the seed script are deferred to the architecture phase; on restart the system reconnects to the existing database and no vocabulary rebuild is required; regular database backups are assumed to protect vocabulary data; each vocabulary term is a structured record — category is a first-class attribute and drives which fields are relevant to the record; the following illustrates the structure (exact schema deferred to architecture):

| Term | Category | Description | Aliases | Relationships |
| --- | --- | --- | --- | --- |
| Harrison & Sons | Organisation | Contractor and service provider | H&S Ltd | Associated with: infrastructure, legal matters |
| J. Harrison | Person | Documented contact across multiple records | Jack Harrison | Associated with: Harrison & Sons |

- The vocabulary can be extended manually via the curation web UI at any time; during document processing, candidate terms are proposed automatically and surfaced in a separate vocabulary review queue (distinct from the document curation queue) immediately as each document completes processing, ordered by the timestamp of the step completion that raised the candidate; vocabulary candidates remain in the review queue regardless of the source document's subsequent pipeline state — if the document is later flagged, its candidates are not withdrawn; accepted vocabulary terms are independent of the documents that surfaced them and are not affected by out-of-band document removal; if a source document is removed out-of-band while a candidate it raised is still pending review, the candidate remains in the queue — the source document reference may be unavailable, but the candidate's validity as a vocabulary term is independent of the source document; candidates are deduplicated against both the accepted vocabulary and a persisted rejected-terms list before being raised — deduplication is normalised (case-insensitive, punctuation stripped) so near-identical forms are treated as the same term; when a candidate matches an accepted term after normalisation, it is suppressed from the review queue and the normalised variant is appended to the aliases list on the existing term if not already present — duplicate aliases are silently ignored (aliases is a list — a term may have zero or more aliases); the curator accepts (adds to vocabulary) or rejects (adds to rejected list) each remaining candidate; editing and deleting accepted or manually-added vocabulary terms via the curation web UI is out of scope for Phase 1 and is deferred to Phase 2

- Answer natural language questions with synthesised responses and source citations (CLI); each citation includes the document description, date, and a human-readable archive reference; documents are stored internally under a system-generated unique identifier (format deferred to architecture) — this is the stable key used throughout the system and is never exposed to the user; the human-readable archive reference is derived from the document's curated metadata at the time of display — it is mutable and will change if the underlying metadata is corrected; the derivation rule — which metadata fields contribute and in what format — is an architectural output and is not defined at scope level; two documents may share the same human-readable reference if their metadata is identical — they remain distinct by their internal identifier; both intake routes populate the same metadata model (see the filename convention note above) and archive reference derivation works identically regardless of intake route; page-level citation is deferred to a later phase; all structured filtering of results (by date range, document type, or similar) is deferred to Phase 3 — queries in Phase 1 and Phase 2 use natural language only
- Basic curation via a minimal web UI: view the document curation queue (documents awaiting review or flagged with issues, ordered by the timestamp of the last successfully completed pipeline step that raised the flag — no history of previous flag/clear cycles is retained; when two documents share an identical timestamp, order is determined by natural database ordering with no additional guarantee); view the vocabulary review queue (candidate terms awaiting accept or reject decisions, ordered by the timestamp of the step completion that raised the candidate; when two candidates share an identical timestamp, order is determined by natural database ordering with no additional guarantee); the document curation queue and vocabulary review queue are distinct views within the web application — they are not combined into a single interface; clear flags to resume pipeline processing from the next incomplete step; correct document metadata (type, date, people, land references, description) — in Phase 1, correcting metadata updates the metadata fields only and does not trigger re-embedding; metadata correction triggering re-embedding is deferred to Phase 2

**Out of scope for Phase 1**: web UI for query or administration; user authentication; supplementary context; browsing documents; viewing originals in results; replace or delete documents; multi-user access. Curation is available in Phase 1 but is restricted to the Primary Archivist.

There is no in-application mechanism to remove erroneously submitted documents in Phase 1 or Phase 2. The Primary Archivist has direct access to the underlying system and can remove documents out-of-band. Document deletion as a managed application feature is deferred to Phase 3.

**Design constraints**:

- Provider-agnostic configuration throughout: every external service (storage, database, OCR, embedding, LLM) is abstracted via an interface; concrete implementations are selected at runtime via configuration with no hardcoded providers
- All configurable operational values (quality score thresholds, maximum file size, and similar parameters) are read from a configuration file external to the codebase at runtime; they are not hardcoded or set only via environment variables
- Submitter identity is recorded on every document from Phase 1; in Phase 1 this field is always the Primary Archivist, but the field must exist in the data model to support multi-user phases without schema changes; curators can see who submitted a document when reviewing the queue — submitter identity is visible in the curation queue only and is not shown in query results or document views
- All error messages delivered during human interaction (CLI output, curation queue, summary reports) must be actionable — they state what went wrong and what the user can do to resolve it
- The Phase 1 data model is minimal — fields introduced in later phases are added at the phase boundary when the feature is introduced; the Phase 1 schema is not pre-populated with unused future fields; submitter identity is the one explicitly required exception, present from Phase 1 for a concrete, known reason

### Phase 2 — Expand and Share

Harder document types, expanded web interface, first external user.

**Adds**:

- Web UI for query; enhanced intake form, curation, and vocabulary management UI
- User authentication
- Supplementary context — attach human-provided text to documents the system cannot interpret automatically (e.g. no extractable text); this is the Phase 2 resolution path for documents that Phase 1 leaves flagged and unresolved with no in-app path forward; supplementary context is embedded and searchable and allows flagged documents to progress through the pipeline; when a query answer draws on supplementary context, the citation identifies it as supplementary context added by the curator rather than text extracted from the document — this makes clear to the user that the information reflects a human interpretation, not the original document text
- Re-embedding on metadata correction — when a curator corrects document metadata, re-embedding is triggered automatically; Phase 2 introduces this automated trigger for the same processing pipeline; it does not introduce a new processing capability
- Return original documents alongside query answers
- Browse documents directly
- Family Member access — shares the curation workload with the Primary Archivist; has the same curation access as the Primary Archivist except no document deletion; can curate any document in the archive regardless of who submitted it

**Out of scope for Phase 2**: user account management; replace or delete documents; Occasional Contributor access; document visibility scoping; filter and facet search; System Administrator role.

### Phase 3 — Open to Others

Hosted infrastructure, external user access, access controls.

**Adds**:

- User account management
- Replace or delete documents
- Occasional Contributor access (submit and query)
- Document visibility scoping by user type
- Filter and facet search
- System Administrator role (separated from Primary Archivist)

### Phase 4 and Beyond

Deferred without a committed phase: standalone photographs, near-duplicate detection, knowledge graph, cross-document contradiction detection, enrichment reprocessing (re-embedding previously processed documents to incorporate new vocabulary or domain context — the processing pipeline must be re-entrant by design to support this).

---

## What Questions the System Answers

The system is designed to answer questions about an institution's recorded history. Examples include:

- **Ownership and rights**: "What is known about ownership or rights related to X?"
- **Infrastructure and works**: "When were works completed on X, and by whom?"
- **Agreements and contracts**: "Is there any record of agreements with X?"
- **People and relationships**: "Who was involved in Y transaction or decision?"
- **Decisions**: "What decisions were made about X?"
- **Historical context**: "What was happening during period Z?"

The system surfaces what documents say. It does not give legal advice or interpretation. Answers always include citations so users can verify against the originals. If no relevant documents exist, the system says so.

The practical quality of answers is directly proportional to the breadth and quality of documents in the archive.

---

## What the System Does Not Do

- Provide public or anonymous access
- Allow self-registration
- Give legal, medical, or specialist advice
- Answer questions about topics with no relevant documents — responses are based on available sources only
- Process audio, video, structured data files, or web content
- Handle document scanning — digitisation is a precondition to submission

---

## Navigation

| If you want to... | Go to... |
| --- | --- |
| Understand the system architecture and technology choices | [project/architecture.md](architecture.md) |
| Understand the developer background and environment setup | [project/developer-context.md](developer-context.md) |
| See the system architecture visually | [project/system-diagrams.md](system-diagrams.md) |
| Understand why decisions were made | [decisions/architecture-decisions.md](../decisions/architecture-decisions.md) |
| Set up agents and skills | [SUMMARY.md](../SUMMARY.md) |
