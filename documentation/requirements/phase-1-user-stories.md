# Phase 1 User Stories

Derived from: `documentation/requirements/user-requirements.md` (approved 2026-02-17).
Covers all 138 requirements (UR-001 to UR-138).
Stories are assigned to Phase 1, Phase 2, Phase 3, or Phase Future based on the priority and phase assignment in the requirements document. Phase Future = no phase assigned yet; no implementation expected until a specific phase is assigned.

**Convention note**: User stories for system-wide non-functional requirements (privacy, provider abstraction, configuration, error messages, backups, schema constraints) use "As a Primary Archivist" as a representative protagonist. These constraints apply regardless of user type and are not privileges specific to the Primary Archivist.

**Convention note**: Stories that document deliberate system constraints (things the system does not do in a given phase) use "As a [user], I want the system to [not do X]..." framing with a **Note** block explaining the constraint purpose. These are intentional scope boundary stories, not feature stories.

---

## Table of Contents

1. [Document Intake — Web UI](#1-document-intake--web-ui)
2. [Document Intake — Bulk Ingestion](#2-document-intake--bulk-ingestion)
3. [Bulk Ingestion Summary Report](#3-bulk-ingestion-summary-report)
4. [File Validation](#4-file-validation)
5. [Virtual Document Groups](#5-virtual-document-groups)
6. [Text Extraction and Quality Scoring](#6-text-extraction-and-quality-scoring)
7. [Metadata Detection and Completeness](#7-metadata-detection-and-completeness)
8. [Embeddings and Chunking](#8-embeddings-and-chunking)
9. [Pipeline Processing](#9-pipeline-processing)
10. [Flags and Curation Queue](#10-flags-and-curation-queue)
11. [Supplementary Context](#11-supplementary-context)
12. [Vocabulary Management](#12-vocabulary-management)
13. [Query and Retrieval](#13-query-and-retrieval)
14. [Curation Web UI](#14-curation-web-ui)
15. [Web Application](#15-web-application)
16. [User Management and Access Control](#16-user-management-and-access-control)
17. [Non-Functional Requirements](#17-non-functional-requirements)

---

## 1. Document Intake — Web UI

### US-001: Upload a document via the web UI

Derived from: UR-001

As a Primary Archivist, I want to upload a document through a web form so that I can add documents to the archive without using the command line.

**Acceptance criteria**

- [ ] A web form is accessible that accepts document uploads
- [ ] A submitted document is stored and enters the processing pipeline
- [ ] The form is reachable as part of the single web application

**Definition of done**: A document can be selected and submitted via the web form and appears in the system as an accepted document awaiting processing.

**Phase**: Phase 1

---

### US-002: Provide date and description at intake

Derived from: UR-002

As a Primary Archivist, I want to enter a date and description when uploading a document so that the document has the minimum metadata needed for the archive.

**Acceptance criteria**

- [ ] The intake form contains a date field and a description field
- [ ] Both the date field and description field are visible and accessible before the submit action can be attempted
- [ ] Submission is not possible unless the date field contains a valid date (per US-003) and the description field contains a non-empty string (per US-003b)

**Definition of done**: A submitted document has a date and description recorded in the metadata model.

**Phase**: Phase 1

---

### US-003: Reject a form submission with an empty or invalid date

Derived from: UR-003, UR-004

As a Primary Archivist, I want the form to reject an empty or syntactically invalid date so that structurally invalid dates cannot enter the metadata model.

**Acceptance criteria**

- [ ] Submitting the form with an empty date field is rejected and the user is prompted to correct it
- [ ] Submitting the form with a syntactically invalid date (e.g. `1962-13-32`) is rejected and the user is prompted to correct it
- [ ] The rejection is enforced client-side (immediate feedback) and server-side (authoritative check)
- [ ] A valid date allows the form to proceed to submission

**Definition of done**: A form submission with an empty or invalid date is blocked at both client and server, and the user receives a prompt to correct the field.

**Phase**: Phase 1

---

### US-003b: Reject a form submission with an empty or whitespace-only description

Derived from: UR-010

As a Primary Archivist, I want the form to reject an empty or whitespace-only description so that descriptions cannot be omitted from the metadata model.

**Acceptance criteria**

- [ ] Submitting the form with an empty description field is rejected and the user is prompted to correct it
- [ ] Submitting the form with a whitespace-only description (e.g. spaces or tabs only) is treated as empty and rejected
- [ ] The rejection is enforced client-side (immediate feedback) and server-side (authoritative check)
- [ ] A non-empty description allows the form to proceed to submission

**Definition of done**: A form submission with an empty or whitespace-only description is blocked at both client and server, and the user receives a prompt to correct the field.

**Phase**: Phase 1

---

### US-004: Pre-populate date and description from a conforming filename

Derived from: UR-005, UR-006

As a Primary Archivist, I want the date and description fields to be pre-populated when I select a file whose name follows the `YYYY-MM-DD - short description` convention so that I avoid re-entering information already in the filename.

**Acceptance criteria**

- [ ] When a file matching the `YYYY-MM-DD - short description` pattern is selected, the date field is populated with the parsed date and the description field is populated with the parsed description
- [ ] If the parsed date is not a valid calendar date, the date field is left empty with no error shown; the user fills it in manually
- [ ] The form fields are always the canonical input — the user may edit pre-populated values freely
- [ ] A file whose name does not follow the convention is accepted; the fields remain empty for manual entry
- [ ] Pre-population does not prevent submission of a file with any filename

**Definition of done**: Selecting a conforming filename pre-populates the date and description fields; selecting a non-conforming filename does not pre-populate them and produces no error; a parsed date that is not a valid calendar date leaves the date field empty with no error.

**Phase**: Phase 1

---

### US-005: Restrict and validate file format in the web UI

Derived from: UR-007, UR-009

As a Primary Archivist, I want the file picker to show only accepted formats and the server to reject any unrecognised format so that only processable documents enter the system.

**Acceptance criteria**

- [ ] The file picker is restricted to PDF, TIFF, JPEG, and PNG
- [ ] A file of an unrecognised format submitted by any means (e.g. bypassing the file picker) is rejected server-side with an actionable error message
- [ ] Accepted formats pass server-side format validation and proceed to the next validation step
- [ ] The actionable error message states what format was received and what formats are accepted

**Definition of done**: Only PDF, TIFF, JPEG, and PNG files can be submitted via the web UI; any other format is rejected at the server with a message that states what went wrong and what the user should do.

**Phase**: Phase 1

---

### US-006: Ensure web UI document submission is atomic

Derived from: UR-008

As a Primary Archivist, I want an interrupted upload to leave nothing stored so that a failed submission cannot create a partial or corrupt record.

**Acceptance criteria**

- [ ] If a web UI upload is interrupted before completion, no record of the document is stored
- [ ] Re-submission behaviour following a failed or interrupted upload is covered by US-020
- [ ] The mechanism for ensuring atomicity is determined at the architecture phase `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: An interrupted upload leaves the system in the same state as before the upload was attempted; no partial record exists.

**Phase**: Phase 1

---

### US-007: Accept DOCX and EML files (Phase 2)

Derived from: UR-011

As a Primary Archivist or Family Member, I want to upload DOCX and EML files so that harder document types introduced in Phase 2 can enter the archive.

**Acceptance criteria**

- [ ] DOCX and EML are added to the accepted format list in the file picker and server-side validation
- [ ] Existing Phase 1 format validation behaviour is unchanged

**Definition of done**: DOCX and EML files are accepted at the web UI intake form in Phase 2.

**Phase**: Phase 2

---

### US-008: Family Member uploads via the web UI (Phase 2)

Derived from: UR-012

As a Family Member, I want to upload documents via the web UI so that I can contribute to the archive.

**Acceptance criteria**

- [ ] A Family Member can access the upload form after authentication
- [ ] Upload behaviour for a Family Member is identical to that for the Primary Archivist
- [ ] The submitted document records the Family Member as submitter

**Definition of done**: A Family Member can submit a document via the web UI and the submission is processed identically to a Primary Archivist submission.

**Phase**: Phase 2

---

## 2. Document Intake — Bulk Ingestion

### US-009: Run bulk ingestion from a directory via CLI

Derived from: UR-013, UR-022

As a Primary Archivist, I want to run a CLI command pointing at a directory of files so that I can load an existing document collection into the archive in one operation, separately from pipeline processing.

**Acceptance criteria**

- [ ] A CLI command accepts a path to a source directory as input
- [ ] The command stores accepted files in the archive
- [ ] File acceptance is gated on the naming convention enforced by US-010; files that do not conform are rejected before reaching the archive
- [ ] Bulk ingestion and document processing are separate steps; running ingestion does not trigger processing
- [ ] A watched directory mode is not provided at any phase
- [ ] The storage mechanism (file copy, reference, or other) is an architectural decision `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: Running the CLI command with a valid source directory stores accepted files in the archive; processing must be triggered separately.

> **Note — hard blocking dependency**: The storage mechanism (file copy, reference, or other) is defined by UR-013 and must be resolved by the Head of Development before this story can be fully implemented. Without knowing the storage mechanism, the core acceptance criterion ("the command stores accepted files in the archive") cannot be implemented.

**Phase**: Phase 1

---

### US-010: Enforce the bulk ingestion naming convention

Derived from: UR-014, UR-015

As a Primary Archivist, I want files that do not follow the `YYYY-MM-DD - short description` naming convention to be rejected so that all ingested files have the metadata needed to enter the metadata model.

**Acceptance criteria**

- [ ] Files whose names do not match `YYYY-MM-DD - short description` are rejected
- [ ] The rejection reason is included in the summary report per file
- [ ] For conforming files, the filename stem is parsed into date and description fields and populates the same metadata model as a web UI submission
- [ ] Archive reference derivation behaves identically regardless of which intake route was used

**Definition of done**: Non-conforming filenames are rejected with a reason in the summary report; conforming filenames are parsed into date and description and the resulting metadata is identical to a web UI submission.

**Phase**: Phase 1

---

### US-011: Reject a source directory that contains sub-directories

Derived from: UR-016, UR-017

As a Primary Archivist, I want the bulk ingestion run to halt if the source directory contains sub-directories so that unexpected directory structures do not cause silent mis-ingestion.

**Acceptance criteria**

- [ ] If the source directory contains any sub-directories, the run does not proceed
- [ ] A summary report is produced with zero counts and an actionable error message identifying the sub-directories found
- [ ] The error message names each sub-directory found, not just a count
- [ ] No files are processed when a sub-directory is detected

**Definition of done**: A source directory containing sub-directories stops the run immediately; the summary report names each sub-directory found, shows zero counts, and no files are processed.

**Phase**: Phase 1

---

### US-012: Roll back an interrupted bulk ingestion run

Derived from: UR-018, UR-019, UR-020

As a Primary Archivist, I want an interrupted ingestion run to be rolled back so that a crashed or killed run does not leave partial data in the archive.

**Acceptance criteria**

- [ ] If a bulk ingestion run is interrupted (process killed, system crash), no files from the interrupted run are stored
- [ ] Cleanup of any incomplete prior run occurs at the start of every ingestion run, before any new work is accepted
- [ ] No summary report is produced for an interrupted run
- [ ] The rollback mechanism is determined at the architecture phase `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: Restarting the CLI after an interrupted run finds no partial data from the interrupted run; cleanup has run before new files are accepted.

> **Note — hard blocking dependency**: The rollback mechanism is defined by UR-018 and must be resolved by the Head of Development before this story can be implemented. Without knowing the rollback mechanism (transaction log, staging directory, or other), the cleanup and rollback criteria cannot be implemented.

**Phase**: Phase 1

---

### US-013: Concurrent bulk ingestion runs are undefined (Phase 1 known limitation)

Derived from: UR-021

As a Primary Archivist, I want the system to have no concurrent run detection in Phase 1 so that this known limitation is documented and understood rather than silently causing problems.

**Note**: This is a scope boundary constraint story. It documents what the system deliberately does not do in this phase, rather than a user capability. The acceptance criteria are the verifiable form of the constraint.

**Acceptance criteria**

- [ ] No locking mechanism, error, or concurrent-session detection is implemented for simultaneous ingestion runs in Phase 1
- [ ] The limitation is documented in the CLI help output or README

**Definition of done**: The known limitation is documented in the CLI help output or README; no concurrent-session protection is implemented in Phase 1.

**Phase**: Phase 1

---

## 3. Bulk Ingestion Summary Report

### US-014: Produce and output a summary report after each ingestion run

Derived from: UR-023, UR-024

As a Primary Archivist, I want a summary report printed to stdout and saved to a file after each completed bulk ingestion run so that I have an immediate and persistent record of what happened.

**Acceptance criteria**

- [ ] After a completed run, a summary report is printed to stdout
- [ ] The summary report is also written to a timestamped file in the configured output directory
- [ ] The report includes: a header with total submitted, accepted, and rejected counts; a per-file record of filename, outcome, and rejection reason where applicable

**Definition of done**: After a completed run, the summary report appears on stdout and a timestamped file exists in the output directory containing the same content.

**Phase**: Phase 1

---

### US-015: Create the output directory automatically if it does not exist

Derived from: UR-025, UR-026

As a Primary Archivist, I want the output directory to be created automatically if it does not exist so that I do not have to create it manually before the first run.

**Acceptance criteria**

- [ ] If the output directory does not exist at run time, it is created automatically
- [ ] If the output directory cannot be created, an actionable error is reported
- [ ] Whether a creation failure causes the run to abort or affects only the file write of the report is determined at the architecture phase `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: Running the CLI when the output directory does not exist results in the directory being created and the report written; a creation failure produces an actionable error.

**Phase**: Phase 1

---

### US-016: Produce a report when the source directory is empty or contains no conforming files

Derived from: UR-027

As a Primary Archivist, I want a summary report produced even when the source directory is empty or contains no conforming files so that I know the command ran and why nothing was accepted.

**Acceptance criteria**

- [ ] If the source directory is empty, the report is produced with zero counts and a note that no files were found
- [ ] If files are present but none conform to the naming convention, the report is produced with zero counts and a note that no conforming files were found
- [ ] The report format is the same as for a normal run

**Definition of done**: Running ingestion against an empty directory or a directory where no files conform to the naming convention produces a report with zero counts and a note; no silent no-op occurs.

**Phase**: Phase 1

---

## 4. File Validation

### US-017: Apply format validation before size validation

Derived from: UR-028, UR-029

As a Primary Archivist, I want format checking to run before size checking so that I receive a clear format error rather than a misleading size error when submitting an unsupported file type.

**Acceptance criteria**

- [ ] Format validation runs first; if it fails, size validation is not reached
- [ ] A file with no extension is treated as a format validation failure and rejected
- [ ] A file with an unrecognised extension is treated as a format validation failure and rejected
- [ ] A file that passes format validation then proceeds to size validation

**Definition of done**: A file of an unsupported format produces a format rejection reason, not a size rejection reason, regardless of its size.

**Phase**: Phase 1

---

### US-018: Reject unparseable files at intake

Derived from: UR-030

As a Primary Archivist, I want files that cannot be opened or parsed — including empty or zero-byte files — to be rejected at intake so that dead records are never created.

**Acceptance criteria**

- [ ] A file that cannot be opened or parsed is rejected at intake
- [ ] An empty or zero-byte file is rejected at intake
- [ ] Rejected files are not stored
- [ ] The rejection reason appears in the summary report (bulk) or as an error message (web UI)

**Definition of done**: Submitting an empty or corrupt file results in a rejection with an actionable reason; no record of the file is stored.

**Phase**: Phase 1

---

### US-019: Enforce a configurable maximum file size

Derived from: UR-031, UR-032

As a Primary Archivist, I want the system to enforce a configurable maximum file size per file so that excessively large files do not enter the pipeline.

**Acceptance criteria**

- [ ] Files exceeding the configured maximum are rejected
- [ ] The limit applies to each individual file including files within a virtual document group
- [ ] The limit is read from a configuration file external to the codebase at runtime
- [ ] A configured limit of zero or a negative value is rejected at startup with an actionable error message

**Definition of done**: A file exceeding the configured limit is rejected; a misconfigured (zero or negative) limit is caught at startup before any run begins.

**Phase**: Phase 1

---

### US-020: Detect and reject exact duplicate files by hash

Derived from: UR-033, UR-035

As a Primary Archivist, I want exact duplicate files — identified by file hash — to be rejected regardless of intake route or group membership so that the same content is never stored and indexed more than once.

**Acceptance criteria**

- [ ] Each file is hashed at intake
- [ ] The hash is compared against the full archive of previously accepted files across all runs
- [ ] A file matching an existing hash is rejected as a duplicate regardless of its filename or intake route
- [ ] Duplicate detection applies to individual files within a virtual document group
- [ ] A rejected file is not stored; re-submission in a later run is treated as a fresh submission

**Definition of done**: Submitting a file whose content already exists in the archive results in a rejection; no duplicate record is created; re-submitting the same file in a later run is rejected again by the same mechanism.

**Phase**: Phase 1

---

### US-021: Content-based duplicate detection (future phase)

Derived from: UR-034

As a Primary Archivist, I want rescanned copies of the same document to be detected as duplicates so that the archive is not cluttered with multiple versions of the same source document.

Note: duplicate detection behaviour for inline email attachments (such as signature images) is an open question deferred to Phase 2 scope definition.

**Note**: This story is a Phase Future scope placeholder. The specific implementation approach (similarity method, tooling, phase assignment) is deferred until tooling and extraction capability are confirmed. All acceptance criteria and the DoD will be decomposed into specific testable stories when a phase is assigned. No implementation is expected against this story directly.

**Acceptance criteria**

- [ ] Content-based duplicate detection (beyond hash matching) is implemented in the phase assigned to this story

**Definition of done**: This story is closed when it has been decomposed into specific testable stories during the relevant phase scope definition; no implementation is expected against this story directly.

**Phase**: Phase Future

---

## 5. Virtual Document Groups

### US-022: Group multiple files into a single virtual document

Derived from: UR-036

As a Primary Archivist, I want to submit multiple files as a single virtual document via bulk ingestion so that a multi-part scanned document is treated as one logical archival unit and referenced as such in query results.

**Acceptance criteria**

- [ ] The bulk ingestion CLI allows multiple files to be associated as a single virtual document
- [ ] In Phase 1 grouping is available via bulk ingestion CLI only — web UI grouping is deferred to Phase 2
- [ ] The group is processed as one logical unit throughout the pipeline
- [ ] Query results reference the virtual document as a single unit, not as individual files
- [ ] The CLI mechanism for expressing a group (flag, manifest file, or other) is an architectural decision `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: A multi-file virtual document group can be submitted via the bulk ingestion CLI, is processed as one unit, and appears as a single document in query results.

> **Note — hard blocking dependency**: The CLI mechanism for expressing a group (flag, manifest file, or other) is defined by UR-036 and must be resolved by the Head of Development before this story can be implemented. Without knowing the group expression mechanism, the CLI cannot be designed or tested.

**Phase**: Phase 1

---

### US-023: Reject an entire group if any file fails validation

Derived from: UR-037, UR-038

As a Primary Archivist, I want the entire virtual document group to be rejected if any file fails validation so that no partial or semantically incomplete group is stored.

**Note**: Virtual document grouping is available via bulk ingestion CLI only in Phase 1 (per US-022 and UR-036). The fail-fast and "not attempted" outcomes in this story apply to CLI bulk ingestion only; web UI grouping is deferred to Phase 2.

**Acceptance criteria**

- [ ] If any file in a group fails intake validation (including duplicate detection), the entire group is rejected
- [ ] No files from a rejected group are stored
- [ ] Phase 1 uses fail-fast validation: processing stops on the first failure
- [ ] Files not reached due to fail-fast are reported with outcome "not attempted"
- [ ] The failing file is reported with its rejection reason
- [ ] Passing files are not listed individually in the report

**Definition of done**: A group with one failing file is entirely rejected; no files from the group are stored; the summary report lists the failing file with a reason and remaining files as "not attempted".

**Phase**: Phase 1

---

### US-024: Try-all group validation (Phase 2)

Derived from: UR-039

As a Primary Archivist, I want an option to validate every file in a group and report all failures in a single pass so that I can fix all problems in one resubmission cycle.

**Acceptance criteria**

- [ ] Phase 2 introduces a per-request CLI flag to switch from fail-fast to try-all validation
- [ ] Try-all validation reports all failures in a single pass
- [ ] The default validation behaviour (fail-fast or try-all) is determined during Phase 2 implementation once both options are available

**Definition of done**: Providing the try-all flag causes all files in the group to be validated and all failures reported before rejecting the group; fail-fast behaviour (US-023) continues to work; the default behaviour is confirmed during Phase 2 implementation.

**Phase**: Phase 2

---

### US-025: Accept a single-file virtual document group

Derived from: UR-040

As a Primary Archivist, I want a group containing a single file to be valid and processed identically to a standalone submission so that single-file groups do not require special handling.

**Acceptance criteria**

- [ ] A group of one file passes group-level validation
- [ ] A group of one file is accepted, processed, and produces the same pipeline outcome as a standalone submission with the same file
- [ ] There is no error or warning for a single-file group

**Definition of done**: Submitting a group of one file succeeds and the file is processed as a standalone document with no group-specific errors.

**Phase**: Phase 1

---

### US-026: Reject a zero-file group

Derived from: UR-041

As a Primary Archivist, I want a group containing no files to be rejected at intake so that empty groups cannot create records with no content.

**Acceptance criteria**

- [ ] A group with zero files is rejected at intake with an actionable error message
- [ ] No record is created for a zero-file group

**Definition of done**: Submitting a zero-file group produces an actionable rejection at intake; no record is created.

**Phase**: Phase 1

---

### US-027: Reject a group containing duplicate filenames

Derived from: UR-042

As a Primary Archivist, I want a group that contains two files sharing the same filename to be rejected at intake so that ambiguous groups with duplicate filenames are never stored.

**Acceptance criteria**

- [ ] If two files in the same group share a filename, the group is rejected at intake
- [ ] The rejection reason is actionable and identifies the duplicate filename
- [ ] No files from the group are stored

**Definition of done**: A group with a duplicate filename is rejected at intake with an actionable reason; no files from the group are stored.

**Phase**: Phase 1

---

## 6. Text Extraction and Quality Scoring

### US-028: Extract text from typed and printed documents

Derived from: UR-043

As a Primary Archivist, I want text to be extracted from typed and printed documents automatically so that the document content is available for processing, embedding, and search.

**Acceptance criteria**

- [ ] Text is extracted from Phase 1 document types (typewritten and printed documents; modern digital PDFs)
- [ ] Text is extracted from image-format documents (TIFF, JPEG, PNG) submitted in Phase 1 using OCR
- [ ] Extracted text is available to downstream pipeline steps

**Definition of done**: A typed or printed document submitted in Phase 1 has its text extracted and passed to the next pipeline step.

**Phase**: Phase 1

---

### US-029: Extract text from Phase 2 document types (Phase 2)

Derived from: UR-043

As a Primary Archivist or Family Member, I want text to be extracted from handwritten documents, maps, plans, surveys, and emails so that Phase 2 document types are available for processing, embedding, and search.

**Acceptance criteria**

- [ ] Text extraction is extended in Phase 2 to cover handwritten letters and notes, maps, plans and surveys, and emails (EML format)
- [ ] Extracted text from Phase 2 document types is available to the same downstream pipeline steps as Phase 1 types

**Definition of done**: A handwritten document, map, plan, survey, or email submitted in Phase 2 has its text extracted and passed to the next pipeline step.

**Phase**: Phase 2

---

### US-030: Produce a quality score per page and for the document as a whole

Derived from: UR-044

As a Primary Archivist, I want each page and the document as a whole to receive a quality score (0–100) so that the system can identify poor-quality extractions automatically.

**Acceptance criteria**

- [ ] Each page receives a quality score in the range 0–100
- [ ] The document as a whole receives a quality score in the range 0–100
- [ ] The score represents confidence that the extracted text faithfully and completely represents the document content

**Definition of done**: After text extraction, every page has a quality score and the document has an overall quality score; both are stored and available to downstream checks.

**Phase**: Phase 1

---

### US-031: Evaluate all pages — no fail-fast within a document

Derived from: UR-045

As a Primary Archivist, I want all pages in a document to be evaluated regardless of whether an earlier page fails so that I receive a complete picture of all failing pages.

**Acceptance criteria**

- [ ] Every page in a document is scored, regardless of the outcome of any other page
- [ ] Evaluation does not stop early on the first failing page
- [ ] Flag reason content requirements for failing pages are covered by US-036

**Definition of done**: After extraction, all pages have scores; no page is skipped regardless of the outcome of preceding pages.

**Phase**: Phase 1

---

### US-032: Flag a document if any page fails the text quality threshold

Derived from: UR-046, UR-047

As a Primary Archivist, I want a document flagged for review if any page score falls below the configurable quality threshold so that documents with unreliable extractions are not silently passed to embedding.

**Acceptance criteria**

- [ ] A document is flagged if any page score falls below the configured threshold
- [ ] The text quality threshold is configurable via the external configuration file
- [ ] The flag reason identifies the failing pages; including scores per page is an implementer decision (UR-046 requires page identification only)

**Definition of done**: A document with any page below the configured threshold is flagged; the threshold is changeable without a code change.

**Phase**: Phase 1

---

### US-033: Store and flag a document with no extractable text

Derived from: UR-048, UR-082

As a Primary Archivist, I want a document that yields no extractable text to be stored and flagged rather than rejected so that it is not silently discarded and can be reviewed later.

**Acceptance criteria**

- [ ] A document that produces no extractable text is stored
- [ ] The document is flagged for manual review
- [ ] The document is absent from the search index
- [ ] In Phase 1, there is no in-app resolution path; the document remains flagged until Phase 2 supplementary context is available
- [ ] See also US-047 for the general rule on search exclusion during pipeline processing

**Definition of done**: A document with no extractable text is stored, appears in the curation queue as flagged, and is absent from search results.

**Phase**: Phase 1

---

### US-034: Store and flag a document with partial text extraction

Derived from: UR-049

As a Primary Archivist, I want a document where only some pages yield text to be stored and flagged, with no partial embeddings generated, so that incomplete content does not produce misleading search results.

**Acceptance criteria**

- [ ] A document with mixed extractable and non-extractable pages is stored and flagged
- [ ] No partial embeddings are generated for such a document
- [ ] The document is absent from the search index until the flag is cleared and processing completes
- [ ] See also US-047 for the general rule on search exclusion during pipeline processing

**Definition of done**: A document with partially extractable content is flagged; no partial embeddings exist; it does not appear in search results.

**Phase**: Phase 1

---

### US-035: Store and flag a document with zero pages

Derived from: UR-050

As a Primary Archivist, I want a document that opens successfully but contains zero pages to be stored and flagged rather than rejected so that it is not silently discarded.

**Acceptance criteria**

- [ ] A document that opens successfully but has zero pages is stored
- [ ] The document is flagged for manual review with a reason identifying the zero-page condition
- [ ] The document is absent from the search index

**Definition of done**: A zero-page document is stored, flagged, and absent from search results.

**Phase**: Phase 1

---

### US-036: Include all failing pages in the flag reason

Derived from: UR-051

As a Primary Archivist, I want the flag reason for a text quality failure to list every failing page so that I have a complete picture of what needs review.

**Acceptance criteria**

- [ ] The flag reason for a text quality failure includes the page number for each failing page; including scores is an implementer decision (UR-051 requires page identification only)
- [ ] No failing page is omitted from the flag reason

**Definition of done**: Viewing the flag on a quality-failed document shows the full list of failing pages; no pages are omitted.

**Phase**: Phase 1

---

## 7. Metadata Detection and Completeness

### US-037: Detect metadata automatically from document content

Derived from: UR-052, UR-053

As a Primary Archivist, I want the system to detect document type, dates, people, organisations, and description automatically so that I do not have to enter these fields manually for every document.

**Acceptance criteria**

- [ ] The system detects document type, dates, people, organisations, and description from document content
- [ ] If the system detects a description, it overwrites the description provided at intake
- [ ] If the system does not detect a description, the intake description is preserved
- [ ] When the system detects no value for a non-description metadata field, that field is not populated; the intake description is preserved per UR-053
- [ ] The curator can correct any detected metadata field via the curation UI

**Definition of done**: After processing, a document has system-detected values for all metadata fields the pipeline can produce; the system-generated description overwrites the intake description only when a description was detected; if no description was detected, the intake description is preserved.

**Phase**: Phase 1

---

### US-038: Assess metadata completeness independently of text quality

Derived from: UR-054, UR-056

As a Primary Archivist, I want metadata completeness to be assessed with its own configurable threshold, independently of text quality, so that a document can fail or pass each check on its own merits.

**Acceptance criteria**

- [ ] Metadata completeness is assessed with a separate configurable threshold from text quality
- [ ] A document can fail metadata completeness while passing text quality, or vice versa
- [ ] Partial detection (some fields found, others not) is not itself a flag trigger; the score is evaluated against the threshold
- [ ] A document with partial detection may pass or fail depending on its score

**Definition of done**: Two documents with identical text quality but different metadata completeness scores are assessed independently; each may pass or fail the metadata threshold on its own.

**Phase**: Phase 1

---

### US-039: Record both failures as a single flag when both thresholds fail

Derived from: UR-055

As a Primary Archivist, I want a single flag with multiple reasons when both text quality and metadata completeness fail simultaneously so that the curation queue is not cluttered with duplicate entries.

**Acceptance criteria**

- [ ] When both thresholds fail on the same document, a single flag is raised
- [ ] The flag reason includes the text quality failure with the full list of failing pages per US-036 and the metadata completeness failure
- [ ] Two separate flags are not raised
- [ ] When only one threshold fails, a single flag is raised with one reason (not two flags, not a combined-failure flag)

**Definition of done**: A document failing both thresholds has exactly one flag with both reasons recorded in the reason field.

**Phase**: Phase 1

---

### US-040: Metadata completeness fields and scoring method (implementation decision)

Derived from: UR-057

As a Primary Archivist, I want the specific metadata fields assessed for completeness and the scoring method determined during implementation so that the assessment reflects the actual document collection and the capabilities of the chosen extraction tooling.

**Acceptance criteria**

- [ ] The completeness assessment evaluates a defined set of metadata fields `[ARCHITECTURAL FLAG — for Head of Development: fields are determined during implementation informed by corpus analysis; see UR-057]`
- [ ] The scoring method produces a numeric score in a documented range for each assessed document `[ARCHITECTURAL FLAG — for Head of Development: scoring method is determined during implementation informed by extraction tooling selected; see UR-057]`

**Definition of done**: The implementer has defined which fields contribute to the completeness score and how the score is calculated, and has documented this decision before US-038 is closed.

**Phase**: Phase 1

---

### US-041: Store documents under a system-generated internal identifier

Derived from: UR-058

As a Primary Archivist, I want each document stored under a unique internal identifier that is never exposed to me so that the system has a stable key for every document that cannot be affected by metadata changes.

**Acceptance criteria**

- [ ] Every accepted document is assigned a system-generated unique identifier at intake
- [ ] The identifier is used throughout the system as the stable key
- [ ] The identifier is never displayed to the user
- [ ] The format of the identifier is determined at the architecture phase `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: Every document has an internal identifier; no user-facing surface exposes it.

**Phase**: Phase 1

---

### US-042: Derive a human-readable archive reference from curated metadata

Derived from: UR-059, UR-060, UR-061

As a Primary Archivist, I want each document to have a human-readable archive reference derived from its curated metadata at display time so that citations are meaningful and reflect current metadata.

**Acceptance criteria**

- [ ] A human-readable archive reference is derived from curated metadata at display time
- [ ] The reference is mutable — if metadata is corrected, the reference changes on next display
- [ ] Two documents may share the same reference if their metadata is identical; they remain distinct by internal identifier
- [ ] The derivation rule (which fields contribute and in what format) is determined at the architecture phase `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: Every document citation includes a human-readable archive reference; correcting metadata causes the reference to reflect the updated values on next display.

> **Note — hard blocking dependency**: The archive reference derivation rule (which fields contribute and in what format) is defined by UR-061 and must be resolved by the Head of Development before this story can be implemented. Without the derivation rule, the archive reference cannot be computed or displayed.

**Phase**: Phase 1

---

### US-043: Metadata correction updates fields only in Phase 1

Derived from: UR-062

As a Primary Archivist, I want metadata corrections in Phase 1 to update the metadata fields only, without triggering re-embedding, so that the Phase 1 and Phase 2 scope boundary is clear.

**Acceptance criteria**

- [ ] Correcting metadata via the curation UI updates the metadata fields
- [ ] Re-embedding is not triggered in Phase 1
- [ ] If the document is already in the search index, it remains there with its existing embeddings unchanged; corrected metadata fields are reflected in the document record and citations on next display
- [ ] If the document is not yet in the search index (e.g. flagged before the embedding step completed), metadata correction updates the stored metadata fields only; the document will be indexed when pipeline processing completes

**Definition of done**: Correcting a metadata field updates the stored value; no re-embedding is triggered; the document remains searchable.

**Phase**: Phase 1

---

### US-044: Re-embedding triggered by metadata correction (Phase 2)

Derived from: UR-062

As a Primary Archivist or Family Member, I want correcting document metadata to automatically trigger re-embedding so that search results reflect the corrected metadata.

**Acceptance criteria**

- [ ] Phase 2 introduces automatic re-embedding when a curator corrects document metadata
- [ ] The document remains searchable with its existing embeddings until re-embedding completes
- [ ] Re-embedding uses the same processing pipeline as the original embedding step

**Definition of done**: Correcting a metadata field in Phase 2 triggers re-embedding; the document remains searchable throughout; updated embeddings reflect the corrected metadata.

**Phase**: Phase 2

---

## 8. Embeddings and Chunking

### US-045: Generate embeddings for each document chunk

Derived from: UR-063

As a Primary Archivist, I want embeddings generated for each chunk of a document so that the document content is searchable via semantic query.

**Acceptance criteria**

- [ ] Embeddings are generated for each chunk of an accepted, fully-extracted document
- [ ] The embedding provider is abstracted via an interface and selected at runtime via configuration `[ARCHITECTURAL FLAG — for Head of Development]`
- [ ] A document is absent from the search index until embeddings are complete

**Definition of done**: After the embedding step completes, the document's chunks are represented as embeddings in the search index.

**Phase**: Phase 1

---

### US-046: Use AI-agent-determined semantic chunking

Derived from: UR-064

As a Primary Archivist, I want chunk boundaries to be determined by an AI agent reading the document content so that related content is kept together in a single embedding rather than split arbitrarily.

**Acceptance criteria**

- [ ] Chunk boundaries are determined by an AI agent that reads the document and identifies semantically meaningful units
- [ ] Fixed-size splitting is not used
- [ ] The AI agent used for chunking and its operating model are architectural decisions `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: Chunk boundaries are reviewed against at least two Phase 1 document types (e.g. a typewritten document and a digital PDF) from the archive. The Primary Archivist confirms no boundary splits a logically indivisible unit (e.g. a clause, a named transaction, or a named party's entry) and records the review outcome before the story is closed. Human review is the appropriate verification method for AI-determined chunk boundaries; no automated test is expected.

> **Note — hard blocking dependency**: The AI agent used for chunking and its operating model are defined by UR-064 and must be resolved by the Head of Development before this story can be implemented. Without selecting the agent and its operating model (prompting strategy, token limits, retry logic), semantic chunking cannot be implemented or verified.

**Phase**: Phase 1

---

### US-047: Exclude documents from search until embedding completes

Derived from: UR-065, UR-066

As a Primary Archivist, I want a document to be absent from search results until its embedding step completes successfully so that incomplete or partially-embedded documents are never surfaced to a query.

**Acceptance criteria**

- [ ] A document does not appear in search results until the embedding step has completed successfully
- [ ] There is no transient visibility window during pipeline resumption
- [ ] A document with mixed extractable and non-extractable pages is held pending review with no partial embeddings
- [ ] See also US-033 and US-034 for related zero-text and partial-extraction cases

**Definition of done**: A document cannot be returned by a query until all its chunks have embeddings; a partially-embedded or flagged document does not appear in search results.

**Phase**: Phase 1

---

## 9. Pipeline Processing

### US-048: Record pipeline step completion independently of quality outcome

Derived from: UR-067

As a Primary Archivist, I want each pipeline step to record its own completion status independently of whether its output passed a quality threshold so that the system knows precisely which steps have run and where to resume.

**Acceptance criteria**

- [ ] Each pipeline step records a completion status on completion
- [ ] A step that ran successfully is marked complete even if its output failed a quality threshold
- [ ] A step that failed due to a technical error is recorded as incomplete
- [ ] Resumption starts from the first incomplete step, not from the beginning
- [ ] Processing resumption starts on the next processing run; the trigger mechanism is covered by US-050

**Definition of done**: A document whose quality failed at extraction has the extraction step marked complete; on resumption, the pipeline skips completed steps and starts from the next incomplete step.

**Phase**: Phase 1

---

### US-049: Retry technically failed steps on the next processing run

Derived from: UR-068, UR-069

As a Primary Archivist, I want a step that fails due to a technical error to be retried on the next processing run so that transient failures do not permanently block a document.

**Acceptance criteria**

- [ ] A step that fails due to a technical error (service unavailable, unhandled exception) is recorded as incomplete
- [ ] The step is retried on the next processing run
- [ ] A configurable retry limit prevents infinite retry loops
- [ ] When the retry limit is exceeded, the document is flagged with the error reason and surfaced in the curation queue
- [ ] Processing runs are triggered manually in Phase 1 (see US-050); there is no automatic retry between runs; this criterion cannot be fully verified until UR-071 is resolved by the Head of Development

**Definition of done**: A document blocked by a recurring technical failure is flagged in the curation queue after the configured retry limit is reached; transient failures that resolve within the limit do not flag the document.

**Phase**: Phase 1

---

### US-050: Manual processing trigger in Phase 1

Derived from: UR-070, UR-071

As a Primary Archivist, I want to trigger document processing manually in Phase 1 so that I control when processing runs.

**Acceptance criteria**

- [ ] Processing does not start automatically in Phase 1; manual triggering is the only mechanism
- [ ] The specific trigger surface is defined by UR-071 `[ARCHITECTURAL FLAG — for Head of Development]` and must be resolved before this story can be closed
- [ ] Triggering processing does not automatically clear flags

**Definition of done**: Processing does not start automatically in Phase 1; manual triggering is the only mechanism. The negative constraint (processing does not start automatically) is testable in Phase 1. The positive constraint (manual trigger invokes processing) cannot be fully verified until UR-071 is resolved by the Head of Development. The story cannot be fully closed until UR-071 is resolved and the trigger surface is implemented and tested.

> **Note — hard blocking dependency**: The trigger surface for this story is defined by UR-071, which must be resolved by the Head of Development before this story can be fully closed. The negative constraint (no automatic processing) can be implemented and verified independently. The positive constraint (manual trigger works) cannot be implemented or tested until UR-071 is resolved. This is not an informational architectural flag — the story is partially blocked until UR-071 is resolved.

**Phase**: Phase 1

---

### US-051: Flag a document with a missing or unreadable stored file

Derived from: UR-072, UR-073

As a Primary Archivist, I want a document with a missing or unreadable stored file to be flagged with an actionable message so that I know to act on storage directly, and processing continues for other documents.

**Acceptance criteria**

- [ ] If a stored file is missing or unreadable when reprocessing is attempted, the document is flagged with the error reason
- [ ] The flag message states that there is no in-app resolution path and directs the user to act on storage directly
- [ ] Processing continues for other documents; the missing file does not halt the run
- [ ] Stored files are immutable once accepted

**Definition of done**: A document with a missing file appears in the curation queue with a flag that names the error and directs the user to act on storage; other documents in the same run are unaffected.

**Phase**: Phase 1

---

### US-052: Flag mechanism is the single reporting location for document-level failures

Derived from: UR-074

As a Primary Archivist, I want all document-level failures to be reported through the flag mechanism so that I have a single place to find all documents that need attention.

**Acceptance criteria**

- [ ] Every document-level failure raises a flag and surfaces the document in the curation queue
- [ ] There is no separate error log or secondary report for document-level failures
- [ ] The flag reason is sufficient for the curator to understand what went wrong

**Definition of done**: All document-level failures appear in the curation queue as flagged documents; no document-level failure is reported only in a log or secondary output.

**Phase**: Phase 1

---

### US-053: Pipeline is re-entrant by design

Derived from: UR-075

As a Primary Archivist, I want the processing pipeline to be re-entrant so that previously processed documents can be re-embedded in future phases to incorporate new vocabulary or domain context without a full pipeline rewrite.

**Acceptance criteria**

- [ ] The pipeline design supports re-processing a document from any step without re-running completed steps unnecessarily `[ARCHITECTURAL FLAG — for Head of Development]`
- [ ] Pipeline state is tracked in a way that supports this re-entrancy

**Definition of done**: A document that has completed extraction but not embedding can be re-processed starting from the embedding step without re-running extraction; pipeline state is persisted across processing runs. The pipeline state tracking mechanism is defined by UR-075 `[ARCHITECTURAL FLAG — for Head of Development]` and must be resolved before this story can be closed.

> **Note — hard blocking dependency**: This story cannot be implemented until the Head of Development has resolved UR-075 (pipeline state tracking mechanism). This is not an informational architectural flag — no implementation decisions can be made for this story until UR-075 is resolved. Stories such as US-041 carry architectural flags that provide context only and do not block implementation; this story is different.

**Phase**: Phase 1

---

## 10. Flags and Curation Queue

### US-054: Flag documents that fail quality checks or experience technical failures

Derived from: UR-076, UR-077

As a Primary Archivist, I want documents that fail any quality check or experience a technical failure to be flagged automatically so that I can review and resolve them.

**Acceptance criteria**

- [ ] Any document failing a quality check (text quality or metadata completeness) is flagged
- [ ] Any document experiencing a technical pipeline failure (after retry limit exceeded) is flagged
- [ ] Flags are system-generated only; there is no manual flag capability

**Definition of done**: Every document-level failure surfaces in the curation queue as a flagged document; the curator cannot manually flag a document.

**Phase**: Phase 1

---

### US-055: Clear a flag to mark a document ready to resume

Derived from: UR-078, UR-079

As a Primary Archivist, I want to clear a flag to mark a document ready to resume from the next incomplete step so that I can manually release a document for continued processing after reviewing it.

**Acceptance criteria**

- [ ] Clearing a flag marks the document as ready to resume from the next incomplete step
- [ ] Clearing a flag does not re-run completed steps
- [ ] Clearing a flag does not automatically trigger processing
- [ ] Clearing a flag clears the flag reason field
- [ ] The UI mechanism for clearing a flag is covered by US-081

**Definition of done**: After clearing a flag, the document is no longer flagged, its reason field is empty, and it will be picked up by the next manual processing trigger starting from the next incomplete step.

**Phase**: Phase 1

---

### US-056: Re-flag a document if processing fails again after a flag is cleared

Derived from: UR-080

As a Primary Archivist, I want a document to be re-flagged with a fresh reason if processing fails again after I cleared a previous flag so that the reason field always reflects the current failure, not accumulated history.

**Acceptance criteria**

- [ ] If processing fails after a flag is cleared, the document is re-flagged
- [ ] The reason field is written fresh; no prior reasons are retained or appended
- [ ] The document returns to the curation queue

**Definition of done**: Clearing a flag, triggering processing, and experiencing a further failure results in the document re-appearing in the curation queue with only the new failure reason.

**Phase**: Phase 1

---

### US-057: Curation queue ordered by flag timestamp

Derived from: UR-081

As a Primary Archivist, I want the curation queue to be ordered by the timestamp of the last successfully completed pipeline step that raised the flag so that I can work through the queue in a consistent and predictable order.

**Acceptance criteria**

- [ ] Documents are ordered by the timestamp of the last successfully completed pipeline step that raised the flag, ascending (oldest-flagged first)
- [ ] When two documents share an identical timestamp, order is determined by natural database ordering
- [ ] No history of previous flag/clear cycles is shown or retained in the queue

**Definition of done**: The curation queue is consistently ordered by flag timestamp ascending (oldest-flagged first); documents with the same timestamp appear in natural database order; no flag history is shown.

**Phase**: Phase 1

---

## 11. Supplementary Context

### US-058: Attach supplementary context to a document (Phase 2)

Derived from: UR-083, UR-084

As a Primary Archivist or Family Member, I want to attach human-provided text to a document that the system cannot interpret automatically so that documents that Phase 1 leaves permanently flagged can progress through the pipeline in Phase 2.

**Acceptance criteria**

- [ ] Phase 2 allows a curator to attach supplementary context text to a flagged document
- [ ] Supplementary context text is combined with any available extracted text and used as input to the embedding step, making the document embeddable and searchable `[ARCHITECTURAL FLAG — for Head of Development: the specific pipeline mechanics of how supplementary context interacts with the text extraction and embedding steps depend on UR-071 and UR-075]`
- [ ] Supplementary context is embedded and searchable
- [ ] When a query draws on supplementary context, the citation identifies it as supplementary context added by the curator, not text extracted from the document
- [ ] After supplementary context is attached and processing completes, the document appears in search results

**Definition of done**: A Phase 1 document with no extractable text can receive supplementary context in Phase 2 and become searchable; its citations clearly identify the supplementary source.

**Phase**: Phase 2

---

## 12. Vocabulary Management

### US-059: Maintain a domain vocabulary in the database

Derived from: UR-085, UR-087

As a Primary Archivist, I want a domain vocabulary of institution-specific terms stored in the database so that the system has a single authoritative source for specialised language used in extraction and query.

**Acceptance criteria**

- [ ] The vocabulary is stored entirely in the database
- [ ] On restart, the system reconnects to the existing database; no vocabulary rebuild is required
- [ ] Regular database backups are assumed to protect vocabulary data `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: Restarting the system reconnects to the existing vocabulary without any rebuild step; vocabulary data persists across restarts.

**Phase**: Phase 1

---

### US-060: Initialise the database from a seed script

Derived from: UR-086

As a Primary Archivist, I want the database to be initialised from a seed script that provides a non-empty vocabulary so that the system starts with useful institution-specific terms rather than an empty vocabulary.

**Acceptance criteria**

- [ ] A seed script exists and is run on first use and in development environments
- [ ] The seed script provides an initial vocabulary that is not empty
- [ ] The schema and full content of the seed script are defined at the architecture phase `[ARCHITECTURAL FLAG — for Head of Development]`

**Definition of done**: Running the seed script on a fresh database produces a non-empty vocabulary; the system is immediately useful without manual vocabulary entry.

> **Note — hard blocking dependency**: The vocabulary schema and seed script content are defined by UR-086 and must be resolved by the Head of Development before this story can be implemented. Without the schema and seed content, neither the seed script nor the database initialisation can be written.

**Phase**: Phase 1

---

### US-061: Store each vocabulary term as a structured record

Derived from: UR-088

As a Primary Archivist, I want each vocabulary term stored as a structured record with term, category, description, aliases, and relationships so that heterogeneous term types can be stored and displayed consistently.

**Acceptance criteria**

- [ ] Each vocabulary term record contains at minimum: term, category, description, aliases (a list, may be empty), and relationships
- [ ] Category is a first-class attribute and drives which fields are relevant to the record
- [ ] A term may have zero or more aliases

**Definition of done**: Adding a term to the vocabulary stores all required structured fields; the category field determines which other fields are applicable.

**Phase**: Phase 1

---

### US-062: Add vocabulary terms manually via the curation web UI

Derived from: UR-089

As a Primary Archivist, I want to add vocabulary terms manually via the curation web UI at any time so that I can add terms the system did not propose automatically.

**Acceptance criteria**

- [ ] The vocabulary management section of the web UI allows the archivist to add a new term
- [ ] The form captures all required fields for the term record
- [ ] The added term is stored in the vocabulary immediately; it is available to the extraction pipeline from the next processing run

**Definition of done**: A term added manually via the UI appears in the vocabulary and is available to the extraction pipeline on the next processing run.

**Phase**: Phase 1

---

### US-063: Surface vocabulary candidates in the review queue after processing

Derived from: UR-090, UR-091

As a Primary Archivist, I want candidate vocabulary terms to be proposed automatically and appear in the vocabulary review queue as each document completes processing so that I can review potential new terms without manually reading every document.

**Acceptance criteria**

- [ ] Candidate terms are proposed as each document completes processing
- [ ] Candidates appear in the vocabulary review queue ordered by the step-completion timestamp that raised them, ascending (oldest-raised first)
- [ ] When two candidates share an identical timestamp, order is determined by natural database ordering
- [ ] Candidates remain in the queue regardless of the source document's subsequent pipeline state (flagged, removed out-of-band, etc.)

**Definition of done**: After a document completes processing, its proposed candidates appear in the vocabulary review queue in timestamp order ascending; candidates are not withdrawn if the source document is later flagged.

**Phase**: Phase 1

---

### US-064: Accepted vocabulary terms are independent of source documents

Derived from: UR-092

As a Primary Archivist, I want accepted vocabulary terms to persist independently of the documents that raised them so that removing a document out-of-band does not affect the vocabulary.

**Acceptance criteria**

- [ ] Accepting a vocabulary term creates a permanent record in the vocabulary, independent of the source document
- [ ] Removing a document out-of-band does not remove or alter the accepted terms it raised

**Definition of done**: An accepted term remains in the vocabulary after its source document is removed; no cascade deletion occurs.

**Phase**: Phase 1

---

### US-065: Deduplicate vocabulary candidates by normalised comparison

Derived from: UR-093, UR-094

As a Primary Archivist, I want near-identical candidate forms to be treated as the same term so that the review queue is not cluttered with minor variants of accepted terms.

**Acceptance criteria**

- [ ] Candidate deduplication is performed against both the accepted vocabulary and the rejected-terms list before a candidate is raised
- [ ] Deduplication is normalised: case-insensitive and punctuation-stripped
- [ ] When a candidate matches a term in the rejected-terms list after normalisation, it is suppressed from the review queue and is not appended to any aliases list
- [ ] When a candidate matches an accepted term after normalisation, it is suppressed from the review queue
- [ ] The normalised variant is appended to the aliases list of the existing term if not already present
- [ ] Duplicate aliases are silently ignored

**Definition of done**: A candidate that is a near-identical variant of an accepted term is suppressed from the review queue and, if new, appended to the existing term's aliases list.

**Phase**: Phase 1

---

### US-066: Accept or reject a vocabulary candidate

Derived from: UR-093, UR-095

As a Primary Archivist, I want to accept or reject each vocabulary candidate in the review queue so that I am the human gate for all vocabulary additions.

**Acceptance criteria**

- [ ] Each candidate in the vocabulary review queue can be accepted (adding it to the vocabulary) or rejected (adding it to the rejected list)
- [ ] An accepted candidate becomes an active vocabulary term immediately
- [ ] A rejected candidate is added to the rejected-terms list and will not resurface as a candidate
- [ ] The rejected-terms list is stored in the database and persists across system restarts; it is not an in-memory structure that resets on restart (persistence requirement from UR-093; see also US-065)
- [ ] If a candidate is accepted that matches a term already in the vocabulary (added after the candidate was raised), it is treated as a duplicate and silently ignored; no duplicate term is added to the vocabulary

**Definition of done**: Accepting a candidate adds it to the vocabulary; rejecting it adds it to the database-persisted rejected list; neither action requires additional confirmation.

**Phase**: Phase 1

---

### US-067: Editing and deleting accepted vocabulary terms (Phase 2)

Derived from: UR-096

As a Primary Archivist, I want to edit and delete accepted vocabulary terms via the curation web UI so that incorrect or outdated terms can be maintained.

**Acceptance criteria**

- [ ] Phase 2 introduces the ability to edit accepted or manually-added vocabulary terms via the web UI
- [ ] Phase 2 introduces the ability to delete accepted or manually-added vocabulary terms via the web UI
- [ ] Both terms accepted from the candidate queue and terms added manually via the UI are editable and deletable

**Definition of done**: An accepted term can be edited and its changes take effect immediately; a deleted term is removed from the vocabulary; this applies equally to candidate-accepted and manually-added terms.

**Phase**: Phase 2

---

### US-068: Family Member vocabulary management access (Phase 2)

Derived from: UR-097

As a Family Member, I want the same vocabulary management access as the Primary Archivist so that I can contribute fully to vocabulary curation.

**Acceptance criteria**

- [ ] In Phase 2, a Family Member can add terms, review candidates, accept, and reject in the vocabulary review queue
- [ ] Family Member vocabulary access is equivalent to Primary Archivist vocabulary access

**Definition of done**: A Family Member in Phase 2 has identical vocabulary management capabilities to the Primary Archivist.

**Phase**: Phase 2

---

## 13. Query and Retrieval

### US-069: Answer natural language questions via the CLI with citations

Derived from: UR-098, UR-099, UR-100, UR-101

As a Primary Archivist, I want to ask a natural language question via the CLI and receive a synthesised answer with source citations so that I can find out what the archive says about a topic without knowing which documents are relevant.

**Acceptance criteria**

- [ ] The CLI accepts a natural language question
- [ ] The system returns a synthesised response and source citations
- [ ] Each citation includes the document description, date, and human-readable archive reference
- [ ] If no relevant documents exist, the system states this explicitly
- [ ] The system does not give legal advice or legal interpretation
- [ ] Answers are grounded only in archived document content; no general knowledge or inference beyond document content is drawn upon

**Definition of done**: Asking a question via the CLI returns an answer with citations; asking a question with no relevant documents returns an explicit "nothing found" response; responses contain no legal advice and no content sourced from outside the archive; a representative set of queries that could elicit legal interpretation (e.g. "do we have a right of way?") is run manually and reviewed by the Primary Archivist; responses describe document content only without legal conclusions; the review outcome is recorded before the story is closed. Human review is the appropriate verification method for LLM behaviour; no automated test is expected.

**Phase**: Phase 1

---

### US-070: CLI query remains available at all phases

Derived from: UR-102

As a Primary Archivist, I want the CLI query interface to remain available at all phases so that I can continue using it after a web UI is introduced.

**Acceptance criteria**

- [ ] The CLI query interface is not removed or deprecated when Phase 2 introduces web UI query
- [ ] The CLI query interface continues to function at Phase 2 and Phase 3

**Definition of done**: The CLI query command is functional in Phase 1. A regression check is performed at Phase 2 delivery to confirm the CLI remains functional and unchanged after Phase 2 deploys web UI query.

**Phase**: Phase 1

---

### US-071: Natural language query only in Phase 1 and Phase 2

Derived from: UR-103

As a Primary Archivist, I want the system to provide natural language query only, with no structured filtering options in Phase 1 or Phase 2, so that the query scope is clearly bounded until Phase 3.

**Note**: This is a scope boundary constraint story. It documents what the system deliberately does not do in this phase, rather than a user capability. The acceptance criteria are the verifiable form of the constraint.

**Acceptance criteria**

- [ ] No structured filtering options are provided in Phase 1
- [ ] No structured filtering options are introduced in Phase 2 — this criterion is verified at Phase 2 delivery as a regression check
- [ ] All queries use natural language only

**Definition of done**: The Phase 1 query interface accepts natural language input only; no filter or facet options are present. The Phase 2 regression check confirms no structured filtering was introduced at Phase 2 delivery.

**Phase**: Phase 1

---

### US-072: Page-level citation (future phase)

Derived from: UR-104

As a Primary Archivist, I want citations to eventually reference specific pages within a document so that I can locate the exact passage the answer draws from.

**Acceptance criteria**

- [ ] Page-level citation is deferred to a later phase (Phase 4 or beyond)
- [ ] Full-document citation is used in Phase 1, Phase 2, and Phase 3

**Definition of done**: This story is a scope placeholder only. No implementation is expected until a specific phase is assigned.

**Phase**: Phase Future

---

### US-073: Web UI query (Phase 2)

Derived from: UR-105

As a Primary Archivist or Family Member, I want a web UI query interface in Phase 2 so that I can query the archive without using the command line.

**Acceptance criteria**

- [ ] Phase 2 provides a web UI for query in addition to the CLI
- [ ] Query behaviour is identical via both interfaces

**Definition of done**: A query submitted via the Phase 2 web UI retrieves the same underlying documents and produces a response of equivalent content to the same query submitted via the CLI; minor variation in synthesised wording and rendering differences between interfaces are acceptable.

**Phase**: Phase 2

---

### US-074: Return original documents alongside query answers (Phase 2)

Derived from: UR-106

As a Primary Archivist or Family Member, I want original documents returned alongside query answers so that I can view the source document directly from results.

**Acceptance criteria**

- [ ] Phase 2 returns the original document alongside the query answer for each citation
- [ ] The original document is accessible from the citation link or result entry

**Definition of done**: Each Phase 2 query result provides access to the original document for each cited source.

**Phase**: Phase 2

---

### US-075: Browse documents directly (Phase 2)

Derived from: UR-107

As a Primary Archivist or Family Member, I want to browse documents directly without issuing a query so that I can explore the archive and support curation workflows.

**Acceptance criteria**

- [ ] Phase 2 provides a browse view of documents in the archive
- [ ] The browse view is accessible from the web application

**Definition of done**: A user can navigate to the browse view in Phase 2 and see a list of documents without submitting a query.

**Phase**: Phase 2

---

### US-076: Filter and facet search (Phase 3)

Derived from: UR-108

As a Primary Archivist, Family Member, or Occasional Contributor, I want to filter search results by date range, document type, and similar facets so that I can narrow results when the archive is large.

**Acceptance criteria**

- [ ] Phase 3 introduces filter and facet search options
- [ ] Filters can be applied in addition to natural language query

**Definition of done**: Phase 3 query returns filtered results when filter options are applied.

**Phase**: Phase 3

---

### US-077: Occasional Contributor query access (Phase 3)

Derived from: UR-109

As an Occasional Contributor, I want to query the archive so that I can find information stored in it.

**Acceptance criteria**

- [ ] Phase 3 allows an authenticated Occasional Contributor to query the archive
- [ ] Query behaviour is equivalent to other user types for their permitted access level

**Definition of done**: An Occasional Contributor in Phase 3 can submit a query and receive an answer with citations.

**Phase**: Phase 3

---

## 14. Curation Web UI

### US-078: Provide a minimal curation web UI in Phase 1

Derived from: UR-110

As a Primary Archivist, I want a minimal curation web UI covering the document curation queue, vocabulary review queue, flag management, and metadata correction so that I can curate the archive without using the command line.

**Acceptance criteria**

- [ ] The web application includes a document curation queue view
- [ ] The web application includes a vocabulary review queue view
- [ ] The web application includes flag management (clear flag)
- [ ] The web application includes metadata correction

**Definition of done**: All four curation capabilities are accessible via the web UI; no curation action requires the command line.

**Phase**: Phase 1

---

### US-079: Document curation queue and vocabulary review queue are distinct views

Derived from: UR-111

As a Primary Archivist, I want the document curation queue and vocabulary review queue to be separate views so that I can focus on one type of review task at a time without the views being merged.

**Acceptance criteria**

- [ ] The document curation queue is a distinct view from the vocabulary review queue
- [ ] The two queues are not combined into a single interface
- [ ] Both views are accessible from the web application

**Definition of done**: Navigating to the curation section shows two distinct views; flagged documents and vocabulary candidates are never mixed in the same list.

**Phase**: Phase 1

---

### US-080: View the document curation queue

Derived from: UR-112

As a Primary Archivist, I want to view the document curation queue so that I can see which documents require attention.

**Acceptance criteria**

- [ ] The curation queue displays all flagged documents; "flagged" and "awaiting review" refer to the same state — there is no separate non-flagged awaiting-review queue state
- [ ] Each entry shows at minimum the document description, date, flag reason, and submitter identity
- [ ] The submitter identity is visible in the curation queue
- [ ] The queue is ordered per US-057 (by flag timestamp ascending, tie-broken by natural database ordering)

**Definition of done**: The curation queue lists all flagged documents with description, date, flag reason, and submitter identity visible; the order matches the defined sort order.

**Phase**: Phase 1

---

### US-081: Clear a flag via the curation UI

Derived from: UR-113

As a Primary Archivist, I want to clear a flag via the curation UI so that I can release a reviewed document for pipeline resumption.

**Acceptance criteria**

- [ ] The curation queue provides a clear-flag action for each flagged document
- [ ] Clearing the flag marks the document ready to resume from the next incomplete step (per US-055)
- [ ] The document is removed from the flagged view after the flag is cleared

**Definition of done**: Clicking clear flag on a document removes it from the flagged view and marks it ready to resume; the flag reason field is cleared.

**Phase**: Phase 1

---

### US-082: Correct document metadata via the curation UI

Derived from: UR-114

As a Primary Archivist, I want to correct document metadata (type, date, people, land references, description) via the curation UI so that incorrect system-detected values can be fixed.

**Acceptance criteria**

- [ ] The curation UI allows editing of: document type, date, people, land references, and description
- [ ] Corrected values are saved and reflected in subsequent display and citations
- [ ] Metadata correction does not trigger re-embedding in Phase 1 (per US-043)

**Definition of done**: Correcting a metadata field saves the new value; the updated value appears in citations and the curation queue on next display; no re-embedding is triggered.

**Phase**: Phase 1

---

### US-083: No in-application document removal in Phase 1 or Phase 2

Derived from: UR-115

As a Primary Archivist, I want the system to provide no in-application mechanism to remove, replace, or delete documents in Phase 1 or Phase 2 so that I know to act on storage directly for any removal needs.

**Note**: This is a scope boundary constraint story. It documents what the system deliberately does not do in this phase, rather than a user capability. The acceptance criteria are the verifiable form of the constraint.

**Acceptance criteria**

- [ ] No remove, replace, or delete document option is available in the web UI in Phase 1 or Phase 2 — this constraint is verified at Phase 2 delivery as a regression check
- [ ] The Primary Archivist can remove documents out-of-band by acting on storage directly
- [ ] Phase 3 introduces replace and delete as managed features (see US-095)

**Definition of done**: The Phase 1 and Phase 2 web UI contains no document removal capability; document deletion as a managed feature is deferred to Phase 3. At Phase 2 delivery, a regression check confirms that no removal capability was introduced.

**Phase**: Phase 1

---

### US-084: Enhanced intake, curation, and vocabulary management UI (Phase 2)

Derived from: UR-116

As a Primary Archivist or Family Member, I want an enhanced web UI for intake, curation, and vocabulary management in Phase 2 so that the interface improves beyond the Phase 1 unpolished baseline.

**Note**: This story is a Phase 2 scope placeholder. The specific enhancements are to be defined during Phase 2 scope definition. The acceptance criteria and DoD will be decomposed into specific testable stories before Phase 2 implementation begins.

**Acceptance criteria**

- [ ] Enhanced intake, curation, and vocabulary management UI is implemented in Phase 2 as defined during Phase 2 scope definition

**Definition of done**: This story is closed when it has been decomposed into specific testable Phase 2 stories during Phase 2 scope definition; no implementation is expected against this story directly.

**Phase**: Phase 2

---

### US-085: Family Member curation access (Phase 2)

Derived from: UR-117

As a Family Member, I want the same curation access as the Primary Archivist (except document deletion) so that I can share the curation workload.

**Acceptance criteria**

- [ ] In Phase 2, a Family Member can view the curation queue, clear flags, and correct metadata
- [ ] A Family Member can curate any document regardless of who submitted it
- [ ] A Family Member cannot delete documents

**Definition of done**: A Family Member in Phase 2 has all curation capabilities except document deletion; they can act on any document in the queue.

**Phase**: Phase 2

---

## 15. Web Application

### US-086: Upload, curation, and vocabulary management in a single web application

Derived from: UR-118, UR-119

As a Primary Archivist, I want document upload, curation, and vocabulary management to be sections of a single web application so that I do not have to navigate between separate applications.

**Acceptance criteria**

- [ ] Document upload, curation, and vocabulary management are sections of one web application
- [ ] The application is unpolished but functional in Phase 1
- [ ] The same "unpolished but functional" standard applies to all sections

**Definition of done**: All three sections are accessible within a single web application; the application is functional for its defined Phase 1 scope.

**Phase**: Phase 1

---

### US-087: Phase 1 designed for a single browser session at a time

Derived from: UR-120

As a Primary Archivist, I want the Phase 1 application to support only a single browser session at a time so that I do not rely on concurrent session support that is not implemented.

**Note**: This is a scope boundary constraint story. It documents what the system deliberately does not do in this phase, rather than a user capability. The acceptance criteria are the verifiable form of the constraint.

**Acceptance criteria**

- [ ] Concurrent session support is not a Phase 1 requirement
- [ ] The system is not tested for concurrent session behaviour in Phase 1

**Definition of done**: The Phase 1 application is delivered without concurrent session handling; the limitation is documented in the application README or equivalent known-limitations section.

**Phase**: Phase 1

---

## 16. User Management and Access Control

### US-088: Single user, no authentication in Phase 1

Derived from: UR-121, UR-122

As a Primary Archivist, I want Phase 1 to have a single user with no authentication so that I can run the system locally without login complexity.

**Acceptance criteria**

- [ ] Phase 1 has no authentication mechanism
- [ ] All curation access is available to the single user without login
- [ ] No other user type exists in Phase 1

**Definition of done**: The Phase 1 application is accessible without authentication; all capabilities are available to the single user.

**Phase**: Phase 1

---

### US-089: No public or anonymous access at any phase

Derived from: UR-123

As a Primary Archivist, I want the system to be private at all phases with no public or anonymous access and no self-registration so that the archive is accessible only to known users.

**Acceptance criteria**

- [ ] No public or anonymous access is possible at any phase
- [ ] Self-registration is not available at any phase

**Definition of done**: In Phase 1, the system is local and single-user; no public-facing deployment is intended and no anonymous access is possible by design. From Phase 2, all user access is controlled via authentication and self-registration is absent — this is verified at Phase 2 delivery as a regression check.

**Phase**: Phase 1

---

### US-090: User authentication (Phase 2)

Derived from: UR-124

As a Primary Archivist or Family Member, I want user authentication introduced in Phase 2 so that access is controlled before a second user is admitted.

**Acceptance criteria**

- [ ] Phase 2 introduces an authentication mechanism
- [ ] All users must authenticate before accessing the system in Phase 2 and later

**Definition of done**: Phase 2 requires authentication; unauthenticated requests are rejected.

**Phase**: Phase 2

---

### US-091: Record submitter identity on every document from Phase 1

Derived from: UR-125, UR-126

As a Primary Archivist, I want submitter identity recorded on every document from Phase 1 so that the data model supports multi-user phases without a schema change.

**Acceptance criteria**

- [ ] Every accepted document has a submitter identity field set at intake
- [ ] In Phase 1, the submitter identity value is set to a fixed value representing the Primary Archivist at intake with no runtime selection; in Phase 2 this is replaced by the authenticated user identity
- [ ] Submitter identity is visible in the curation queue
- [ ] Submitter identity is not shown in query results or document views

**Definition of done**: Every document record contains a submitter identity field; the field is visible in the curation queue only; no schema change is required to support multi-user phases.

**Phase**: Phase 1

---

### US-092: User account management (Phase 3)

Derived from: UR-127, UR-131

As a Primary Archivist, I want a System Administrator role introduced in Phase 3 so that infrastructure and user account management are separated from archival responsibilities.

**Note**: This story is written from the Primary Archivist's perspective rather than the System Administrator's because the System Administrator role does not yet exist when this story is implemented — the story is about introducing that role. The Primary Archivist is the actor who benefits from the separation of responsibilities.

**Acceptance criteria**

- [ ] Phase 3 introduces user account management capabilities
- [ ] The System Administrator role is separated from the Primary Archivist role in Phase 3
- [ ] The System Administrator manages infrastructure and user accounts

**Definition of done**: Phase 3 provides user account management; System Administrator capabilities are distinct from Primary Archivist capabilities.

**Phase**: Phase 3

---

### US-093: Occasional Contributor access (Phase 3)

Derived from: UR-128, UR-129

As an Occasional Contributor, I want to submit documents and query the archive in Phase 3 so that I can contribute to and benefit from the archive.

**Acceptance criteria**

- [ ] Phase 3 allows authenticated Occasional Contributors to submit documents and query the archive
- [ ] Occasional Contributors have no curation access

**Definition of done**: An Occasional Contributor in Phase 3 can submit and query; curation options are absent from their interface.

**Phase**: Phase 3

---

### US-094: Document visibility scoping by user type (Phase 3)

Derived from: UR-130

As a System Administrator, I want document visibility scoped by user type in Phase 3 so that different users see only the documents they are permitted to access.

**Acceptance criteria**

- [ ] Phase 3 introduces visibility scoping rules by user type
- [ ] A document's visibility is determined by the scoping rules applied at Phase 3

**Definition of done**: Phase 3 enforces document visibility scoping; a user sees only documents within their permitted scope.

**Phase**: Phase 3

---

### US-095: Replace and delete documents (Phase 3)

Derived from: UR-132

As a user with appropriate permissions, I want to replace and delete documents as managed application features in Phase 3 so that erroneously submitted documents can be corrected through the application.

**Acceptance criteria**

- [ ] Phase 3 introduces replace and delete document capabilities as managed application features
- [ ] The user type(s) that gain these capabilities are determined at Phase 3 scope definition

**Definition of done**: Phase 3 provides replace and delete document actions; access is controlled per the Phase 3 scope definition.

**Phase**: Phase 3

---

## 17. Non-Functional Requirements

### US-096: Abstract every external service via an interface

Derived from: UR-133

As a Primary Archivist, I want every external service abstracted via an interface with the concrete implementation selected at runtime via configuration so that the system can run with different providers without code changes.

**Acceptance criteria**

- [ ] Storage, database, OCR, embedding, and LLM services are each abstracted via an interface `[ARCHITECTURAL FLAG — for Head of Development]`
- [ ] The concrete implementation for each service is selected at runtime via the configuration file
- [ ] No provider is hardcoded anywhere in the codebase

**Definition of done**: Changing the configured provider for any external service requires only a configuration change, not a code change; the Head of Development has defined the interface pattern and runtime selection mechanism.

**Phase**: Phase 1

---

### US-097: Read all configurable operational values from an external configuration file

Derived from: UR-134

As a Primary Archivist, I want all operational values (thresholds, file size limit, retry limit) to be read from a configuration file external to the codebase at runtime so that I can change them without modifying or redeploying code.

**Acceptance criteria**

- [ ] Quality score thresholds, file size limit, retry limit, and similar operational values are read from an external configuration file
- [ ] These values are not hardcoded in the codebase
- [ ] These values are not set only via environment variables
- [ ] Changing a value in the configuration file takes effect on the next run without a code change

**Definition of done**: All configurable operational values are sourced from an external configuration file; no restart requiring a code change is needed to update them.

**Phase**: Phase 1

---

### US-098: All error messages must be actionable

Derived from: UR-135

As a Primary Archivist, I want every error message to state what went wrong and what I can do to resolve it so that I am never left with an unresolvable error.

**Acceptance criteria**

- [ ] Every error message delivered via CLI output, the curation queue, or summary reports states what went wrong
- [ ] Every error message states what the user can do to resolve the situation
- [ ] No error message is a bare error code or opaque system message

**Definition of done**: A representative sample of error scenarios (format rejection, duplicate rejection, processing failure, missing file) produces messages that both describe the error and direct the user to a resolution action.

**Phase**: Phase 1

---

### US-099: Regular database backups protect vocabulary data

Derived from: UR-136

As a Primary Archivist, I want regular database backups to protect vocabulary and archive data so that a database failure does not cause permanent data loss.

**Note**: This story is a Head of Development deliverable. The implementer's responsibility is to confirm the strategy exists and is documented; no application code is required.

**Acceptance criteria**

- [ ] A database backup strategy is defined and in place `[ARCHITECTURAL FLAG — for Head of Development]`
- [ ] Backup implementation is outside the application's direct responsibility

**Definition of done**: The Head of Development has defined and documented the backup strategy; the application itself does not implement backups.

**Phase**: Phase 1

---

### US-100: Phase 1 data model is minimal

Derived from: UR-137

As a Primary Archivist, I want the Phase 1 data model to contain only the fields required for Phase 1 so that premature schema complexity does not add maintenance cost with no Phase 1 benefit.

**Acceptance criteria**

- [ ] The Phase 1 schema contains only fields required for Phase 1 functionality
- [ ] Fields for later phases are added at the phase boundary when the feature is introduced
- [ ] Submitter identity is the one explicitly required exception, present from Phase 1 for a concrete known reason
- [ ] No other future-phase fields are pre-populated in the Phase 1 schema

**Definition of done**: A review of the Phase 1 schema finds no fields that are unused in Phase 1 other than submitter identity.

**Phase**: Phase 1

---

### US-101: Data model supports adding fields at phase boundaries without destructive migrations

Derived from: UR-138

As a Primary Archivist, I want the data model designed so that fields can be added at phase boundaries without destructive schema migrations so that incremental delivery across phases is safe and reliable.

**Acceptance criteria**

- [ ] The database migration strategy is defined at the architecture phase `[ARCHITECTURAL FLAG — for Head of Development]`
- [ ] Phase 2 and Phase 3 fields can be added without dropping or modifying existing Phase 1 data

**Definition of done**: The Head of Development has defined the migration strategy; the Phase 2 migration can be applied to a live Phase 1 database without data loss.

**Phase**: Phase 1

---

## Architectural Flags Summary

The following stories contain requirements flagged for the Head of Development. These must be resolved before implementation of the relevant stories begins.

| Story | Requirement | Implication |
| --- | --- | --- |
| US-006 | UR-008 | Web UI upload atomicity mechanism |
| US-009 | UR-013 | Storage mechanism for accepted files (file copy, reference, or other) |
| US-012 | UR-018 | Bulk ingestion run atomicity and rollback |
| US-022 | UR-036 | CLI mechanism for expressing a virtual document group |
| US-015 | UR-026 | Whether output directory creation failure aborts the run |
| US-040 | UR-057 | Metadata fields assessed for completeness and the scoring method depend on what the extraction pipeline can reliably produce |
| US-041 | UR-058 | Format of the system-generated unique document identifier |
| US-042 | UR-061 | Archive reference derivation rule |
| US-045 | UR-063 | Embedding provider and model selection |
| US-046 | UR-064 | AI agent used for semantic chunking and its operating model |
| US-050 | UR-071 | Surface by which the manual processing trigger is exposed |
| US-053 | UR-075 | Pipeline re-entrancy design and state tracking |
| US-060 | UR-086 | Vocabulary schema and seed script content |
| US-096 | UR-133 | Provider-agnostic interface pattern and runtime provider selection mechanism |
| US-099 | UR-136 | Database backup strategy |
| US-101 | UR-138 | Database migration strategy |
