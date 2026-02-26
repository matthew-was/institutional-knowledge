# User Requirements

Derived from: `documentation/project/overview.md` (approved 2026-02-17).
User types confirmed by Developer: Primary Archivist (Phase 1), Family Member (Phase 2),
Occasional Contributor (Phase 3), System Administrator (Phase 3).

---

## User Types

| User Type | Phase Introduced | Description |
| --- | --- | --- |
| Primary Archivist | 1 | Builds and maintains the archive; has all capabilities available in each phase |
| Family Member | 2 | Full archival and curation access; no document deletion |
| Occasional Contributor | 3 | Queries the archive; may submit documents; no curation access |
| System Administrator | 3 | Manages infrastructure and user accounts; separated from the Archivist role |

---

## 1. Document Intake — Web UI

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-001 | Must | Primary Archivist | The system must accept document uploads via a web UI form | Web UI is the primary intake route in Phase 1 |
| UR-002 | Must | Primary Archivist | The Phase 1 intake form must capture date and description fields at minimum; additional fields are expected to be added as real metadata needs become clear | These are the minimum metadata fields needed to populate the metadata model |
| UR-003 | Must | Primary Archivist | Submitting the form with an empty or syntactically invalid date must be a validation error; the form must reject the submission and prompt the user to correct it | Prevents structurally invalid dates from entering the metadata model |
| UR-004 | Must | Primary Archivist | Date validation must be enforced both client-side and server-side | Client-side validation improves usability; server-side is the authoritative check and cannot be bypassed |
| UR-005 | Must | Primary Archivist | If the uploaded filename matches the `YYYY-MM-DD - short description` naming convention, the date and description fields must be pre-populated on file selection; the form fields are the canonical input and any filename is accepted | Reduces manual data entry for files that follow the convention; the form always overrides |
| UR-006 | Must | Primary Archivist | If the filename-parsed date is not a valid calendar date, the date field must be left empty with no error shown | Avoids confusing the user with an error that originates from filename parsing rather than their own input |
| UR-007 | Must | Primary Archivist | The web UI must restrict the file picker to accepted formats (client-side) and must reject unrecognised formats server-side with an actionable error message | Defence in depth: client-side for usability, server-side as the authoritative gate |
| UR-008 | Must | Primary Archivist | A web UI document submission must be atomic: if the upload is interrupted, nothing must be stored; the mechanism for ensuring this is an architectural concern | `[ARCHITECTURAL FLAG — for Head of Development]` Prevents partial or corrupt records |
| UR-009 | Must | Primary Archivist | Phase 1 must accept PDF, TIFF, JPEG, and PNG files | Covers typewritten, printed, and modern digital documents available in Phase 1 |
| UR-010 | Must | Primary Archivist | Submitting the form with an empty or whitespace-only description must be a validation error; the form must reject the submission and prompt the user to correct it; description validation must be enforced both client-side and server-side | Ensures description is always present as required metadata; defence against incomplete submissions; server-side is the authoritative check and cannot be bypassed |
| UR-011 | Should | Primary Archivist, Family Member | Phase 2 should additionally accept DOCX and EML files | Covers harder document types introduced in Phase 2 |
| UR-012 | Should | Family Member | Phase 2 should allow Family Members to upload documents via the web UI with the same intake behaviour as the Primary Archivist | Family Member shares archival responsibilities including submission |

---

## 2. Document Intake — Bulk Ingestion

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-013 | Must | Primary Archivist | The system must accept bulk ingestion from a directory via an on-demand CLI command; a watched directory is out of scope at all phases | Enables efficient loading of existing document collections |
| UR-014 | Must | Primary Archivist | Files submitted via bulk ingestion must follow the naming convention `YYYY-MM-DD - short description`; files that do not conform must be rejected with the reason included in the summary report | The filename is the metadata input for bulk ingestion; non-conforming filenames cannot be mapped to the metadata model |
| UR-015 | Must | Primary Archivist | The filename stem must be parsed into date and description metadata fields, feeding the same metadata model as a web UI submission; archive reference derivation works identically regardless of intake route | Both intake routes populate the same metadata model |
| UR-016 | Must | Primary Archivist | The source directory must contain only files; the presence of sub-directories must be treated as an error and the run must not proceed | Sub-directories indicate an unexpected structure the system cannot safely process |
| UR-017 | Must | Primary Archivist | When a run is halted by sub-directory detection, a summary report must still be produced with zero counts and a clear actionable error message identifying the sub-directories found | The archivist needs to know what to fix; zero counts confirm no files were processed |
| UR-018 | Must | Primary Archivist | A bulk ingestion run must be atomic: if the run is interrupted (process killed, system crash), it must be rolled back and no files from the interrupted run must be stored; the mechanism for this is an architectural concern | `[ARCHITECTURAL FLAG — for Head of Development]` Prevents partial ingestion runs corrupting the archive |
| UR-019 | Must | Primary Archivist | Cleanup of any incomplete prior run must occur at the start of every ingestion run, before any new work is accepted | Ensures cleanup is triggered regardless of whether the process was restarted cleanly |
| UR-020 | Must | Primary Archivist | A summary report must not be produced for an interrupted run | A partial report for an interrupted run would be misleading |
| UR-021 | Must | Primary Archivist | Concurrent bulk ingestion runs are not supported in Phase 1; behaviour if two runs are started simultaneously is undefined | A known Phase 1 limitation |
| UR-022 | Must | Primary Archivist | Bulk ingestion and document processing must be separate steps; ingestion stores files and processing runs independently | Decouples intake from pipeline execution |

---

## 3. Bulk Ingestion Summary Report

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-023 | Must | Primary Archivist | The system must produce a summary report after each completed bulk ingestion run: a header showing total submitted, accepted, and rejected, followed by a per-file record of filename, outcome, and rejection reason where applicable | Gives the archivist a complete record of what happened |
| UR-024 | Must | Primary Archivist | The summary report must be printed to stdout and written to a timestamped file in a configurable output directory | stdout for immediate feedback; file for persistent audit |
| UR-025 | Must | Primary Archivist | If the output directory does not exist at run time, it must be created automatically | Reduces configuration friction on first use |
| UR-026 | Must | Primary Archivist | If the output directory cannot be created, an actionable error must be reported; whether this causes the run to abort or affects only the file write is an architectural decision | `[ARCHITECTURAL FLAG — for Head of Development]` |
| UR-027 | Must | Primary Archivist | If the source directory is empty or contains no conforming files, the report must still be produced with zero counts and a note that no files were found | Prevents silent no-ops; confirms the command ran |

---

## 4. File Validation

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-028 | Must | Primary Archivist | Per-file validation must apply format checking before size checking; if a file fails format validation the size check must not be reached | Avoids misleading size-related errors for unsupported formats |
| UR-029 | Must | Primary Archivist | A file with no extension or an unrecognised extension must be treated as a format validation failure and rejected | Files without a recognisable extension cannot be safely typed and processed |
| UR-030 | Must | Primary Archivist | The system must reject files that cannot be opened or parsed at intake, including empty or zero-byte files; rejected files must not be stored | Unparseable files cannot be processed and must not create dead records |
| UR-031 | Must | Primary Archivist | The system must enforce a configurable maximum file size per file; the limit applies to each individual file including files within a virtual document group | Prevents excessively large files entering the pipeline |
| UR-032 | Must | Primary Archivist | Zero and negative values for the file size limit must be rejected at startup with an actionable error message | A zero or negative limit would reject all files; early detection prevents a silent misconfiguration |
| UR-033 | Must | Primary Archivist | The system must detect and reject exact duplicate files by file hash; duplicate detection applies to individual files regardless of intake route or group membership, and is checked against the full archive of previously accepted files across all runs | Prevents the same content being stored and indexed more than once across runs |
| UR-034 | Could | Primary Archivist | Content-based duplicate detection (rescanned copies of the same document) is deferred to a future phase; the appropriate phase depends on tooling and extraction capability. Note: duplicate detection behaviour for inline email attachments (such as signature images) is an open question deferred to Phase 2 scope definition. | Deferred; requires more sophisticated comparison |
| UR-035 | Must | Primary Archivist | Rejected files must not be stored; a re-submission in a later run must be treated as a fresh submission with no memory of the previous rejection | The system is stateless with respect to rejected files |

---

## 5. Virtual Document Groups

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-036 | Must | Primary Archivist | The system must support grouping multiple files into a single virtual document at submission time; in Phase 1 grouping is available via bulk ingestion CLI only — web UI grouping is deferred to Phase 2; multi-part scanned documents are submitted and processed as one logical unit and referenced as such in query results | `[ARCHITECTURAL FLAG — for Head of Development]` Enables multi-page scanned documents to be treated as a single archival unit; CLI-only in Phase 1 as the web UI form supports single-file upload |
| UR-037 | Must | Primary Archivist | If any file in a group fails intake validation, including duplicate detection, the entire group must be rejected; no partial groups must be stored | A partial group is semantically incomplete and cannot be processed as a logical unit |
| UR-038 | Must | Primary Archivist | Phase 1 must use fail-fast validation for groups: processing stops on the first failure; remaining files must be reported as "not attempted"; only failing files are reported with their reasons; passing files are not listed individually | Provides a fast failure signal; multi-failure reporting deferred to Phase 2 |
| UR-039 | Should | Primary Archivist | Phase 2 should introduce a per-request CLI flag to switch to try-all validation, validating every file in the group and reporting all failures in a single pass | Reduces resubmit cycles when a group has multiple failures |
| UR-040 | Must | Primary Archivist | A group containing a single file must be valid and processed identically to a standalone submission | A single-file group is a degenerate but valid case requiring no special handling |
| UR-041 | Must | Primary Archivist | A zero-file group must be a validation error and rejected at intake | A group with no files has no content and cannot be processed |
| UR-042 | Must | Primary Archivist | If two files in the same group share a filename, the group must be rejected at intake | Duplicate filenames within a group are ambiguous; filenames may carry semantic meaning |

---

## 6. Text Extraction and Quality Scoring

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-043 | Must | Primary Archivist | The system must extract text from typed and printed documents in Phase 1; Phase 2 adds handwritten documents, maps, plans, surveys, and emails | Text extraction is the foundation of the processing pipeline and search capability |
| UR-044 | Must | Primary Archivist | The system must produce a quality score per page and for the document as a whole, in the range 0–100, representing confidence that extracted text faithfully and completely represents the document content | Enables automated flagging of poor extractions for human review |
| UR-045 | Must | Primary Archivist | All pages in a document must always be evaluated; there must be no fail-fast within a document | The archivist needs a complete picture of all failing pages, not just the first |
| UR-046 | Must | Primary Archivist | A document must fail the text quality check if any page fails the configurable text quality threshold | A document with any poor-quality page cannot be trusted as a complete extraction |
| UR-047 | Must | Primary Archivist | The text quality threshold must be configurable | Different archives and document types may require different tolerance levels |
| UR-048 | Must | Primary Archivist | A document that produces no extractable text must be stored and flagged for manual review rather than rejected | It may be a plan, map, or image requiring manual data entry; it must not be silently discarded |
| UR-049 | Must | Primary Archivist | A document where only some pages yield text (partial extraction) must be stored and flagged for manual review; no partial embeddings must be generated | A partial embedding would produce misleading search results |
| UR-050 | Must | Primary Archivist | A document that opens successfully but contains zero pages must be stored and flagged for manual review | Zero pages may indicate a corrupt or empty document requiring curator attention |
| UR-051 | Must | Primary Archivist | The flag reason for a text quality failure must include the full list of failing pages | The archivist needs a complete picture to decide how to proceed |

---

## 7. Metadata Detection and Completeness

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-052 | Must | Primary Archivist | The system must detect document type, dates, people, organisations, and description automatically from document content | Automated detection reduces manual curation effort |
| UR-053 | Must | Primary Archivist | If the system detects a description, it must overwrite the description provided at intake; if no description is detected, the intake description must be preserved; the curator may correct the description further via the curation UI | Conditional overwrite prevents loss of the user-provided description when the system has nothing better to offer |
| UR-054 | Must | Primary Archivist | Metadata completeness must be assessed independently of text quality, each with a separate configurable threshold | A document may have good text quality but no detectable metadata, or vice versa |
| UR-055 | Must | Primary Archivist | When both text quality and metadata completeness thresholds fail simultaneously, both failures must be recorded as a single flag with multiple reasons; the flag reason must include the full list of failing pages | A single flag with multiple reasons avoids curation queue clutter |
| UR-056 | Must | Primary Archivist | Partial metadata detection (some fields found, others not) must not itself trigger a flag; the completeness score is evaluated against the threshold and the document may pass or fail depending on its score | A rigid all-or-nothing check would flag too many legitimate documents |
| UR-057 | Must | Primary Archivist | The specific metadata fields assessed and the completeness scoring method are deferred to the architecture phase; they depend on what the extraction pipeline can reliably produce | `[ARCHITECTURAL FLAG — for Head of Development]` |
| UR-058 | Must | Primary Archivist | Documents must be stored internally under a system-generated unique identifier that is never exposed to the user; the format of this identifier is an architectural decision | `[ARCHITECTURAL FLAG — for Head of Development]` |
| UR-059 | Must | Primary Archivist | The human-readable archive reference must be derived from the document's curated metadata at the time of display; it is mutable and may change if the underlying metadata is corrected | The archive reference is a display construct, not a stable identifier |
| UR-060 | Must | Primary Archivist | Two documents may share the same human-readable archive reference if their metadata is identical; they remain distinct by their internal identifier | Archive references are not uniqueness constraints |
| UR-061 | Must | Primary Archivist | The archive reference derivation rule — which fields contribute and in what format — is deferred to the architecture phase | `[ARCHITECTURAL FLAG — for Head of Development]` |
| UR-062 | Must | Primary Archivist | In Phase 1, correcting metadata via the curation UI must update metadata fields only and must not trigger re-embedding; re-embedding on metadata correction is introduced in Phase 2 | Scope boundary between Phase 1 and Phase 2 |

---

## 8. Embeddings and Chunking

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-063 | Must | Primary Archivist | The system must generate embeddings for each document chunk | `[ARCHITECTURAL FLAG — for Head of Development]` Embeddings enable semantic search |
| UR-064 | Must | Primary Archivist | Chunk boundaries must be determined by an AI agent that reads the document content and identifies semantically meaningful units, rather than by fixed-size splitting | `[ARCHITECTURAL FLAG — for Head of Development]` Semantic chunking keeps related content together, improving retrieval quality |
| UR-065 | Must | Primary Archivist | A document must be absent from the search index until the embedding step completes successfully; there must be no transient visibility window during pipeline resumption | Partial or incomplete documents must not be surfaced in search results |
| UR-066 | Must | Primary Archivist | For documents with mixed extractable and non-extractable pages, the whole document must be held pending review; no partial embeddings must be generated | A partial embedding would produce incomplete and misleading search results |

---

## 9. Pipeline Processing

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-067 | Must | Primary Archivist | Each pipeline step must record its own completion status independently of quality outcome; a step that ran successfully must be marked complete even if its output failed a quality threshold | Enables precise pipeline resumption from the correct step |
| UR-068 | Must | Primary Archivist | A step that fails due to a technical error (service unavailable, unhandled exception) must be recorded as incomplete and retried on the next processing run | Transient failures must not permanently block a document |
| UR-069 | Must | Primary Archivist | A configurable retry limit must prevent infinite retry loops; when the limit is exceeded the document must be flagged with the error reason and surfaced in the curation queue | Persistent errors must be escalated to the curator rather than looping indefinitely |
| UR-070 | Must | Primary Archivist | The processing trigger is manual in Phase 1 | Phase 1 scope constraint |
| UR-071 | Must | Primary Archivist | The surface by which the manual processing trigger is exposed in Phase 1 and any automated triggering in later phases are architectural decisions | `[ARCHITECTURAL FLAG — for Head of Development]` |
| UR-072 | Must | Primary Archivist | If a stored file is missing or unreadable when reprocessing is attempted, the document must be flagged with the error reason and surfaced in the curation queue; processing must continue for other documents; there is no in-app resolution path in Phase 1 or Phase 2 and the flag message must direct the user to act on storage directly | A missing file is a document-level error, not a system halt |
| UR-073 | Must | Primary Archivist | Stored files must be immutable once accepted | Immutability ensures the content indexed matches the content stored |
| UR-074 | Must | Primary Archivist | The flag mechanism must be the single reporting location for all document-level failures | Centralises failure visibility in the curation queue |
| UR-075 | Must | Primary Archivist | The processing pipeline must be re-entrant by design to support future enrichment reprocessing (re-embedding previously processed documents to incorporate new vocabulary or domain context) without a full rewrite | `[ARCHITECTURAL FLAG — for Head of Development]` A non-re-entrant pipeline cannot support vocabulary-driven re-enrichment |

---

## 10. Flags and Curation Queue

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-076 | Must | Primary Archivist | Documents failing any pipeline quality check or experiencing a technical failure must be flagged for human review and surfaced in the curation queue | The curator is the resolution path for all document-level failures |
| UR-077 | Must | Primary Archivist | Flags are system-generated only; the curator cannot manually flag a document | Curator-initiated flags are explicitly out of scope |
| UR-078 | Must | Primary Archivist | Clearing a flag must mark the document as ready to resume from the next incomplete step; it must not re-run completed steps and must not automatically trigger processing | Flag-clearing and processing resumption are separate manual actions in Phase 1 |
| UR-079 | Must | Primary Archivist | Clearing a flag must clear the flag reason field | The reason field reflects the current flag state, not a history |
| UR-080 | Must | Primary Archivist | If processing fails again after a flag is cleared, the document must be re-flagged and returned to the curation queue with the reason field written fresh; no accumulation of prior reasons must be retained | Accumulated reasons would conflate past and present failures |
| UR-081 | Must | Primary Archivist | The curation queue must display documents ordered by the timestamp of the last successfully completed pipeline step that raised the flag; when two documents share an identical timestamp, order is determined by natural database ordering; no history of previous flag/clear cycles is retained | Consistent, predictable ordering for the curator |
| UR-082 | Must | Primary Archivist | In Phase 1, a document with no extractable text has no in-app resolution path and remains flagged and absent from the search index; Phase 2 supplementary context is the resolution path | Phase 1 limitation; accepted because Phase 1 is a single-user local system |

---

## 11. Supplementary Context (Phase 2)

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-083 | Should | Primary Archivist, Family Member | Phase 2 should allow the curator to attach human-provided text to documents the system cannot interpret automatically; supplementary context should be embedded and searchable and should allow the document to progress through the pipeline | Provides the Phase 2 resolution path for documents Phase 1 leaves permanently flagged |
| UR-084 | Should | Primary Archivist, Family Member | When a query answer draws on supplementary context, the citation should identify it as supplementary context added by the curator rather than text extracted from the document | Makes clear that the information reflects a human interpretation, not the original document text |

---

## 12. Vocabulary Management

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-085 | Must | Primary Archivist | The system must maintain a domain vocabulary of institution-specific terms (named entities, people, organisations, recurring concepts and phrases); the vocabulary must be stored entirely in the database, which is the single source of truth | Supports accurate extraction and query across institution-specific language |
| UR-086 | Must | Primary Archivist | The database must be initialised from a seed script on first use and in development environments; the seed script must provide an initial vocabulary, not an empty one; the schema and full content of the seed script are deferred to the architecture phase | `[ARCHITECTURAL FLAG — for Head of Development]` An empty vocabulary would impair early extraction quality |
| UR-087 | Must | Primary Archivist | On restart the system must reconnect to the existing database; no vocabulary rebuild must be required | Vocabulary is persistent state; rebuild would be destructive |
| UR-088 | Must | Primary Archivist | Each vocabulary term must be a structured record with at minimum: term, category, description, aliases (a list — a term may have zero or more aliases), and relationships; category must be a first-class attribute that drives which fields are relevant to the record | Supports consistent storage and display of heterogeneous term types |
| UR-089 | Must | Primary Archivist | The vocabulary must be extendable manually via the curation web UI at any time | The archivist must be able to add terms the system did not propose automatically |
| UR-090 | Must | Primary Archivist | During document processing, candidate terms must be proposed automatically and surfaced in a separate vocabulary review queue immediately as each document completes processing, ordered by the step-completion timestamp that raised the candidate; when two candidates share an identical timestamp, order is determined by natural database ordering | Keeps vocabulary current without requiring manual trawling of documents |
| UR-091 | Must | Primary Archivist | Vocabulary candidates must remain in the review queue regardless of the source document's subsequent pipeline state; if the document is later flagged or removed out-of-band, its candidates must not be withdrawn | A candidate's validity as a vocabulary term is independent of the source document's state |
| UR-092 | Must | Primary Archivist | Accepted vocabulary terms must be independent of the documents that surfaced them and must not be affected by out-of-band document removal | Vocabulary is a separate, durable data set |
| UR-093 | Must | Primary Archivist | Candidate deduplication must be performed against both the accepted vocabulary and a persisted rejected-terms list before a candidate is raised; deduplication must be normalised (case-insensitive, punctuation stripped) so near-identical forms are treated as the same term | Prevents near-duplicate candidates clogging the review queue |
| UR-094 | Must | Primary Archivist | When a candidate matches an accepted term after normalisation, it must be suppressed from the review queue and the normalised variant must be appended to the aliases list of the existing term if not already present; duplicate aliases must be silently ignored | Near-identical forms enrich the aliases list rather than cluttering the queue |
| UR-095 | Must | Primary Archivist | The curator must be able to accept (add to vocabulary) or reject (add to rejected list) each remaining candidate in the vocabulary review queue | The curator is the human gate for all vocabulary additions |
| UR-096 | Must | Primary Archivist | Editing and deleting accepted or manually-added vocabulary terms via the curation web UI is out of scope for Phase 1 and is deferred to Phase 2 | Scope constraint |
| UR-097 | Should | Family Member | Phase 2 should give Family Members the same vocabulary management access as the Primary Archivist | Family Member shares the full curation workload including vocabulary management |

---

## 13. Query and Retrieval

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-098 | Must | Primary Archivist | The system must answer natural language questions via the CLI with synthesised responses and source citations; each citation must include the document description, date, and a human-readable archive reference | Core query capability; citations allow the user to verify against originals |
| UR-099 | Must | Primary Archivist | The system must state explicitly when no relevant documents exist for a query | Prevents the user from assuming a null result means the system failed |
| UR-100 | Must | Primary Archivist | The system must not give legal advice or legal interpretation; answers must be based on what documents say | Legal interpretation is out of scope |
| UR-101 | Must | Primary Archivist | Query answers must be grounded in the content of archived documents only; the system must not draw on general knowledge or make inferences beyond what the archived documents contain | Ensures the archive is the sole source of truth for query responses |
| UR-102 | Must | Primary Archivist | The CLI query interface must remain available at all phases and must not be deprecated when web UI query is introduced in Phase 2 | The CLI is a permanent interface for query at all phases |
| UR-103 | Must | Primary Archivist | All structured filtering of results (by date range, document type, or similar) is deferred to Phase 3; queries in Phase 1 and Phase 2 use natural language only | Structured filtering is a Phase 3 feature |
| UR-104 | Could | Primary Archivist | Page-level citation is deferred to a later phase | Full-document citation is sufficient for Phase 1, Phase 2, and Phase 3 |
| UR-105 | Should | Primary Archivist, Family Member | Phase 2 should provide a web UI for query in addition to the CLI | Family Member access introduces a broader user base for whom a web UI is more appropriate |
| UR-106 | Should | Primary Archivist, Family Member | Phase 2 should return original documents alongside query answers | The user must be able to view the source document directly from query results |
| UR-107 | Should | Primary Archivist, Family Member | Phase 2 should support browsing documents directly | Supports curation and exploration workflows |
| UR-108 | Should | Primary Archivist, Family Member, Occasional Contributor | Phase 3 should introduce filter and facet search | Improves precision for users with large archives |
| UR-109 | Must | Occasional Contributor | Phase 3 must allow Occasional Contributors to query the archive | Query is the primary use case for Occasional Contributors |

---

## 14. Curation Web UI

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-110 | Must | Primary Archivist | The system must provide a minimal curation web UI in Phase 1 covering: document curation queue view, vocabulary review queue view, flag management, and metadata correction | Curation is via a web UI in Phase 1; it is not a CLI-only function |
| UR-111 | Must | Primary Archivist | The document curation queue and vocabulary review queue must be distinct views within the web application; they must not be combined into a single interface | Different queues serve different review tasks |
| UR-112 | Must | Primary Archivist | The curator must be able to view the document curation queue: documents awaiting review or flagged with issues | The curator needs to see what requires attention |
| UR-113 | Must | Primary Archivist | The curator must be able to clear a flag to mark a document ready to resume pipeline processing from the next incomplete step | Flag-clearing is the manual action for pipeline resumption in Phase 1 |
| UR-114 | Must | Primary Archivist | The curator must be able to correct document metadata (type, date, people, organisations, description) via the curation UI | Automated metadata detection may be incorrect; the curator is the correction path |
| UR-115 | Must | — | There must be no in-application mechanism to remove, replace, or delete documents in Phase 1 or Phase 2; the Primary Archivist has direct out-of-band access to the underlying system; document deletion as a managed application feature is deferred to Phase 3 | Scope constraint |
| UR-116 | Should | Primary Archivist, Family Member | Phase 2 should enhance the intake form, curation, and vocabulary management UI | Phase 2 increases usability and scope of the web interface |
| UR-117 | Should | Primary Archivist, Family Member | Phase 2 should give Family Members the same curation access as the Primary Archivist with one exception: Family Members cannot delete documents; Family Members can curate any document regardless of who submitted it. Note: Family Members do not gain document deletion in Phase 2; which user type(s) gain document deletion in Phase 3 is an open question to be resolved at Phase 3 scope definition (see UR-132). | Family Member shares the curation workload but does not have destructive access |

---

## 15. Web Application

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-118 | Must | Primary Archivist | Document upload, curation, and vocabulary management must be sections of a single web application | A single application avoids the complexity of multiple separate applications |
| UR-119 | Must | Primary Archivist | The web application must be unpolished but functional in Phase 1; the same standard applies to all sections; it is not required to be a polished or fully-featured interface at this stage | Phase 1 is a prove-the-pipeline phase; UI polish is a Phase 2+ concern |
| UR-120 | Must | Primary Archivist | Phase 1 is designed for use in a single browser session at a time; concurrent session support is not a Phase 1 requirement | Phase 1 is a single-user local system |

---

## 16. User Management and Access Control

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-121 | Must | Primary Archivist | Phase 1 must have a single user with no authentication; the Primary Archivist is the system | Authentication is unnecessary for a single-user local system |
| UR-122 | Must | Primary Archivist | In Phase 1, all curation access (document curation queue, vocabulary review queue, flag management, and metadata correction) is restricted to the Primary Archivist; no other user type has curation access in Phase 1 | Phase 1 is a single-user system; no other user type exists in Phase 1 |
| UR-123 | Must | — | There must be no public or anonymous access at any phase; there must be no self-registration | The system is private at all phases |
| UR-124 | Should | Primary Archivist, Family Member | Phase 2 should introduce user authentication | Required before a second user is admitted |
| UR-125 | Must | Primary Archivist | The system must record submitter identity on every document from Phase 1; in Phase 1 this field is always the Primary Archivist, but the field must exist in the data model to support multi-user phases without schema changes | Supports multi-user phases without a schema change at the phase boundary |
| UR-126 | Must | Primary Archivist | Submitter identity must be visible in the curation queue only; it must not be shown in query results or document views | Submitter identity is an operational field for the curator, not a user-facing attribute |
| UR-127 | Should | System Administrator | Phase 3 should introduce user account management | Required before external users are admitted |
| UR-128 | Should | Occasional Contributor | Phase 3 should allow Occasional Contributors to submit documents to the archive | Widens the archive to trusted external contributors |
| UR-129 | Should | Occasional Contributor | Phase 3 Occasional Contributors should have no curation access; they may submit and query only | Occasional Contributors are contributors and readers, not curators |
| UR-130 | Should | System Administrator | Phase 3 should introduce document visibility scoping by user type | Controls what different user types can see |
| UR-131 | Should | System Administrator | Phase 3 should introduce the System Administrator role, separated from the Primary Archivist; the System Administrator manages infrastructure and user accounts | Separates operational responsibilities as the system scales |
| UR-132 | Should | — | Phase 3 should introduce replace and delete document capabilities as managed application features; which user type(s) gain this capability is an open question to be resolved at Phase 3 scope definition | Deferred from Phase 1 and Phase 2; user type assignment deferred to Phase 3 scope |

---

## 17. Non-Functional Requirements

### 17.1 Configuration

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-133 | Must | — | Every external service (storage, database, OCR, embedding, LLM) must be abstracted via an interface; concrete implementations must be selected at runtime via configuration with no hardcoded providers | `[ARCHITECTURAL FLAG — for Head of Development]` Core design constraint; drives interface design throughout |
| UR-134 | Must | — | All configurable operational values (quality score thresholds, file size limit, retry limit, and similar) must be read from a configuration file external to the codebase at runtime; they must not be hardcoded or set only via environment variables | Operational values must be changeable without code changes |

### 17.2 Error Messages

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-135 | Must | — | All error messages delivered during human interaction (CLI output, curation queue, summary reports) must be actionable: they must state what went wrong and what the user can do to resolve it | Poor error messages produce unresolvable failures; this is a design constraint throughout |

### 17.3 Data Integrity

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-136 | Must | — | Regular database backups are assumed to protect vocabulary data; backup implementation is outside the application's direct responsibility | `[ARCHITECTURAL FLAG — for Head of Development]` Hosting and operational concern |

### 17.4 Maintainability

| ID | Priority | User Type | Requirement | Rationale |
| --- | --- | --- | --- | --- |
| UR-137 | Must | — | The Phase 1 data model must be minimal; fields introduced in later phases must be added at the phase boundary; the Phase 1 schema must not be pre-populated with unused future fields; submitter identity is the one explicitly required exception | Premature schema complexity adds maintenance cost with no Phase 1 benefit |
| UR-138 | Must | — | The data model must be designed to allow fields to be added at phase boundaries without requiring destructive schema migrations | `[ARCHITECTURAL FLAG — for Head of Development]` Supports incremental delivery across phases |

---

## Architectural Flags

The following requirements have architectural implications and are flagged for the Head of Development to resolve before implementation begins. They must not be resolved by the Product Owner or by implementation decisions made without architectural review.

| Requirement ID | Implication |
| --- | --- |
| UR-008 | Web UI upload atomicity mechanism — how partial uploads are detected and rolled back |
| UR-018 | Bulk ingestion run atomicity and rollback — how an interrupted run is detected and cleaned up |
| UR-026 | Whether a failure to create the output directory causes the run to abort or affects only the file write, depending on when directory creation is attempted |
| UR-036 | CLI mechanism for expressing a virtual document group — how multiple files are specified as a single logical unit at the command line |
| UR-057 | Metadata fields assessed for completeness and the scoring method depend on what the extraction pipeline can reliably produce |
| UR-058 | The format of the system-generated unique document identifier |
| UR-061 | The archive reference derivation rule — which fields contribute and in what format |
| UR-063 | Embedding provider and embedding model selection |
| UR-064 | The AI agent used for semantic chunking and its operating model |
| UR-071 | The surface by which the manual processing trigger is exposed in Phase 1 and any automated triggering in later phases |
| UR-075 | Pipeline re-entrancy design — how pipeline state is tracked to support enrichment reprocessing without a full rewrite |
| UR-086 | Vocabulary schema and full seed content depend on domain modelling and extraction pipeline design |
| UR-133 | Provider-agnostic interface pattern and runtime provider selection mechanism — drives the entire system architecture |
| UR-136 | Database backup strategy and tooling |
| UR-138 | Database migration strategy — how fields are added at phase boundaries without destructive migrations |
