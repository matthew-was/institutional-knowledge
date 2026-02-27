# Project Consistency and Clarity Review

Review date: 2026-02-27

Scope: All files in `documentation/`, `.claude/`, root `CLAUDE.md`, root `README.md`,
and `INITIAL_PURPOSE.md`. Archive files reviewed for cross-reference accuracy only.

Precedence (per `approvals.md`, highest first):

1. `documentation/project/overview.md`
2. `documentation/requirements/user-requirements.md`
3. `documentation/requirements/phase-1-user-stories.md`
4. `documentation/decisions/architecture-decisions.md`
5. `documentation/project/architecture.md`
6. `documentation/project/system-diagrams.md`

---

## Summary

The project documentation is in strong shape overall. The approved documents
(`overview.md`, `user-requirements.md`, `phase-1-user-stories.md`,
`architecture-decisions.md`, `architecture.md`, `system-diagrams.md`) are internally
consistent with each other. The .claude/ skills and agents are consistent with the
approved documents.

Issues found fall into three categories: **stale references** in supporting documents
that have not been updated to reflect post-approval changes, **clarity gaps** where
a reader would need to cross-reference multiple documents to understand something that
could be stated in one place, and **housekeeping items** (orphan files, incomplete
status tracking).

No issues were found in the approved documents themselves.

---

## Inconsistencies

### I-1: SUMMARY.md — Stale Implementation Sequence (High)

**File**: `documentation/SUMMARY.md`

**Issue**: The "Recommended Implementation Sequence" section (Steps 1-24) is stale.
It references files and paths that no longer exist
(`components/component-1-document-intake/specification.md`,
`components/component-2-processing-and-embedding/`,
`components/component-3-query-retrieval/README.md`) — these were archived to
`archive/previous-documentation/components/`. Step numbers and ordering do not reflect
the actual sequence that was followed (skills were written in a different order than
specified here). Steps 15-24 still describe a future sequence based on pre-HoD
assumptions.

**Impact**: A reader following SUMMARY.md as a guide would be directed to
non-existent files and an outdated workflow.

**Recommendation**: Rewrite the implementation sequence to reflect what actually
happened (Steps 1-10 as completed) and what comes next (Step 11: create remaining
agents, then component implementation). Replace archived file paths with current
locations.

---

### I-2: SUMMARY.md — Stale Unresolved Questions Section (High)

**File**: `documentation/SUMMARY.md`

**Issue**: Section "Unresolved Questions to Answer Before Coding" lists UQ-001 to
UQ-005 and UQ-C2-001 to UQ-C2-002 as open questions. These have all been resolved
via ADRs (ADR-015 to ADR-041). The file `decisions/unresolved-questions.md` was
archived to `archive/previous-documentation/` but SUMMARY.md still references it as
if it exists in `documentation/decisions/`.

**Impact**: Creates the false impression that blocking questions remain open.

**Recommendation**: Replace this section with a note that all unresolved questions
have been resolved via ADRs, with cross-references to the relevant ADRs.

---

### I-3: SUMMARY.md — Target .claude/ Structure Missing rag-implementation.md (Medium)

**File**: `documentation/SUMMARY.md`

**Issue**: The "Target `.claude/` Structure" tree lists 9 skills but is missing
`rag-implementation.md`, which has been written. The tree also omits the three
review workflow skills (`overview-review-workflow.md`,
`user-stories-review-workflow.md`, `adr-review-workflow.md`) and
`notion-lab-entry.md`. The actual `.claude/skills/` directory contains 13 files,
not 9.

**Impact**: Reader gets an incomplete picture of what skills exist.

**Recommendation**: Update the tree to list all 13 skill files.

---

### I-4: SUMMARY.md — Agent Descriptions Reference Non-Existent Files (Medium)

**File**: `documentation/SUMMARY.md`

**Issue**: The agent descriptions section (Integration Lead, Senior Developer, etc.)
references context files that do not exist:
`decisions/unresolved-questions.md` (archived),
`components/component-1-document-intake/specification.md` (archived),
`components/component-2-processing-and-embedding/` (archived). These paths are also
present in `agent-workflow.md`.

**Impact**: An agent created from these descriptions would be pointed at non-existent
files.

**Recommendation**: Update file references to use current paths. Note that component
specifications do not yet exist (they will be produced by Senior Developers as new
documents, not carried forward from archive).

---

### I-5: skills-catalogue.md — Status Fields Out of Date (Medium)

**File**: `documentation/process/skills-catalogue.md`

**Issue**: Several skills show incorrect status:

- `metadata-schema.md`: Listed as "Not yet written — write second" but has been
  written
- `pipeline-testing-strategy.md`: Listed as "Not yet written — write third" but has
  been written
- `ocr-extraction-workflow.md`: Listed as "Not yet written — write before
  Component 2 implementation" but has been written
- `embedding-chunking-strategy.md`: Listed as "Not yet written — write after
  Component 2 Phase 1" but has been written
- `rag-implementation.md`: Listed as "Not yet written — write before Component 3
  design" but has been written

The Creation Order section at the bottom has status markers for items 1-4 only.

**Impact**: Reader cannot tell which skills are complete without checking the
`.claude/skills/` directory.

**Recommendation**: Update all status fields to reflect current state. Add status
markers to items 5-9 in the Creation Order.

---

### I-6: documentation/README.md — Reference to Non-Existent domain-context.md (Low)

**File**: `documentation/README.md`

**Issue**: The navigation section links to `project/domain-context.md` with the note
"Living document: approved terms, entities, and relationships (future)". The Document
Status table shows this file as "Not created". The SUMMARY.md source-to-destination
map lists it as a "New file synthesised" but it was never actually created.

**Impact**: A reader clicking this link would get a 404.

**Recommendation**: Either remove the link and note that vocabulary is managed in
the database (per ADR-014, UR-085), or create a brief placeholder explaining
where vocabulary lives (database, not file).

---

### I-7: development-principles.md — Stale LLM Provider Examples (Low)

**File**: `documentation/process/development-principles.md`

**Issue**: The "Concrete abstraction points" table lists LLM provider as
"Claude API" for Phase 1 and "GPT, local models" for Phase 2+. The approved
architecture (ADR-025, ADR-038) specifies local LLM via Ollama for Phase 1, with
API providers as later options. Similarly, Embedding service lists
"OpenAI/Anthropic" for Phase 1 but ADR-024 specifies a local model.

**Impact**: Contradicts the approved architecture. Low impact because
`architecture.md` is the authoritative source, but could confuse a reader.

**Recommendation**: Update the table to match the approved architecture:
LLM Phase 1 = "Local via Ollama", Embedding Phase 1 = "Local model".

---

### I-8: CLAUDE.md — C3 Status Says "Design Brief Only" (Low)

**File**: `CLAUDE.md`

**Issue**: The component table lists C3 as "Design brief only". The
`rag-implementation.md` skill has been written, which provides substantial design
guidance for C3 beyond a brief. While there is no formal specification yet, the
status is understated.

**Recommendation**: Update to "Skill written, spec not started" or similar.

---

### I-9: agent-workflow.md — References Archived Files (Low)

**File**: `documentation/process/agent-workflow.md`

**Issue**: Multiple agent descriptions reference files in `decisions/unresolved-questions.md`
(archived) and component specification paths that were archived. The context
documents table for the Head of Development agent includes
`decisions/unresolved-questions.md`. The Integration Lead key context includes
`decisions/unresolved-questions.md (UQ-001, UQ-003, UQ-005)`.

**Impact**: Low, because the HoD phase is complete and the questions are resolved.
However, if the Integration Lead agent is created from this description, it would
reference a non-existent file.

**Recommendation**: Update the Integration Lead context to reference
`architecture-decisions.md` (where UQs are resolved as ADRs) instead of
`unresolved-questions.md`.

---

### I-10: INITIAL_PURPOSE.md Still at Root (Low)

**File**: `INITIAL_PURPOSE.md`

**Issue**: SUMMARY.md states this was "Incorporated into `project/overview.md`".
The file still exists at the root. Per the archive convention in SUMMARY.md,
processed source files should be moved to `archive/`.

**Impact**: Minor housekeeping.

**Recommendation**: Move to `archive/initial documentation/` or delete, since its
content is in `overview.md`.

---

## Clarity Gaps

### C-1: No Single "Where Are We Now?" Document (High)

**Issue**: A new reader (or the developer returning after a break) has no single
document that answers: "What has been completed, what is the current state, and
what is the next actionable step?" The closest is CLAUDE.md's "Current next steps"
section, but that is mixed with configuration instructions. SUMMARY.md was the
original setup guide but is now stale (see I-1, I-2). `approvals.md` tracks
document approvals but not project progress.

**Recommendation**: Either update SUMMARY.md to serve this purpose (recommended,
since it already exists and is linked from multiple places) or designate a new
"project status" section in CLAUDE.md. This should include:

- Phase status (design complete, implementation not started)
- What has been approved (with dates)
- What has been created (skills, agents)
- What comes next (remaining agents, then C1 implementation)
- Known blockers (none currently)

---

### C-2: Approval Precedence Not Documented in approvals.md (Medium)

**Issue**: `approvals.md` lists approved documents but does not state their
precedence order. The user mentioned that approvals.md lists the order of
precedence. Currently the table implicitly orders them by approval date, but there
is no explicit statement like "In case of conflict, documents higher in this table
take precedence."

**Recommendation**: Add an explicit precedence statement to `approvals.md`:
"Documents are listed in precedence order. In case of contradiction, the
higher-listed document is authoritative."

---

### C-3: archive/ Directory Conventions Not Documented (Medium)

**Issue**: SUMMARY.md describes the archive convention
("any external document that is read and processed... should be moved to `archive/`")
but the actual `archive/` directory has five subdirectories with different naming
conventions:

- `initial documentation/` (spaces in name)
- `previous conversation descisions/` (typo: "descisions" for "decisions")
- `previous-documentation/` (hyphens)
- `review documents/` (spaces)
- `scope-working-documents/` (hyphens)

No README or index exists in `archive/` explaining what each subdirectory contains
or when to use which.

**Recommendation**: Minor housekeeping: fix the typo in the directory name,
standardise naming (either spaces or hyphens), and consider adding a brief
`archive/README.md` listing what each subdirectory contains.

---

### C-4: README.md "Implementation in Progress" Is Premature (Low)

**File**: `README.md`

**Issue**: The Project Status section shows "Implementation in progress" with a
spinner icon. No implementation code exists yet — the project is in the design and
skills-writing phase.

**Recommendation**: Update to reflect actual status, e.g. "Design and skills
complete; implementation not yet started."

---

### C-5: documentation/README.md — No Mention of .claude/ (Low)

**File**: `documentation/README.md`

**Issue**: The navigation guide has a section "If you are setting up Claude agents
and skills" that links to SUMMARY.md and process files, but does not mention the
actual `.claude/` directory where the skills and agents live. A reader looking for
the actual agent/skill files would need to know to look in `.claude/`.

**Recommendation**: Add a note like "Agent and skill definition files are in
`.claude/agents/` and `.claude/skills/`."

---

### C-6: User Type Name Inconsistency Between Documents (Low)

**Issue**: `overview.md` uses "Authorized User" for Phase 2. `user-requirements.md`
and `phase-1-user-stories.md` use "Family Member" for the same role.
`architecture.md` uses "Family Member". The overview was approved first with
"Authorized User"; the requirements refined this to "Family Member". The overview
was not updated to match.

**Recommendation**: Since `user-requirements.md` takes precedence per the document
hierarchy, and "Family Member" is the term used in all subsequent documents, update
`overview.md` to use "Family Member" for consistency. This would require unapproving
and re-approving `overview.md` per the approval workflow.

---

## Suggestions for Improvement

### S-1: Consolidate SUMMARY.md Into a Focused Setup Guide

SUMMARY.md currently serves multiple purposes: historical narrative ("What Was Done"),
setup guide ("Next Steps: Setting Up .claude/"), implementation sequence, and
unresolved questions tracker. Most of the historical narrative is now captured in
the archive and in the approvals audit log. The implementation sequence is stale.

Suggestion: Refocus SUMMARY.md as a pure "How to set up and resume work on this
project" guide. Move the historical source-to-destination map to the archive if it
has not been useful since the initial reorganisation.

---

### S-2: Add a Quick-Start Section to CLAUDE.md

CLAUDE.md is the first thing Claude reads in every session, but it frontloads
permission and git commit rules. A brief "Quick orientation" section near the top
(after the critical rules) would help new sessions orient faster:

- "This project is in the **skills and agents creation phase**. No implementation
  code exists yet."
- "Next actionable step: Create remaining agents (see Current Next Steps below)."
- "All design documents are approved. See `documentation/approvals.md`."

---

### S-3: Skills Catalogue Could Link to Actual Files

`documentation/process/skills-catalogue.md` describes each skill but does not link to
the actual `.claude/skills/` files. Adding direct links (e.g.
`[View skill](../../.claude/skills/configuration-patterns.md)`) would let readers
jump directly to the file.

---

### S-4: Consider a CHANGELOG or Decision Log Summary

The project has a rich audit trail (`approvals.md` audit log, archived review
documents, git history) but no concise chronological summary of major milestones.
A brief changelog would help the developer recall when things happened after a
break:

```text
2026-02-17: Overview, requirements, and user stories approved
2026-02-25: All 41 ADRs, architecture, and system diagrams approved
2026-02-25-27: All 10 foundational skills written
2026-02-27: Next — create remaining agents
```

This could be a section in SUMMARY.md rather than a separate file.

---

### S-5: rag-implementation.md Skill Notes C3 as Python

The `rag-implementation.md` skill states: "C3 is Python-based (aligns with C2;
leverages Python RAG/graph ecosystem)." However, no ADR explicitly confirms that C3
is implemented in Python. ADR-015 places only C2 (processing) in Python, and the
architecture states C3 queries go through the Express backend. The skill's statement
that C3 is Python-based appears to be a design decision made within the skill without
an ADR to back it. If C3 is intended to be Python, an ADR should record this. If C3
is Express-based (consistent with ADR-031 and `architecture.md`), the skill should
be corrected.

**Resolution**: C3 query logic is likely to be Python (learning component + better Python
ecosystem support for complex querying workflows), but the routing architecture
(Next.js → Express → Python vs Next.js → Python directly) requires an ADR before
implementation. The skill has been updated to reflect this: the unqualified "C3 is
Python-based" claim is removed; a note explains the likely Python direction and flags
the routing architecture as an open question requiring an ADR.

---

### S-6: C2 Skills Too Prescriptive for a Learning Component

**File**: `.claude/skills/ocr-extraction-workflow.md`, `embedding-chunking-strategy.md`,
`metadata-schema.md`

**Issue**: C2 (Text Extraction, Processing & Embedding) is a learning component like C3
— the developer is building new skills in OCR, embeddings, and document processing
pipelines. However, the C2 skills are detailed and prescriptive (specific interfaces,
pipeline steps, implementation patterns), similar in style to C1 (the non-learning
component). By contrast, C3's `rag-implementation.md` is intentionally a
design-questions learning guide that leaves implementation decisions to the developer.

**Impact**: If the C2 Senior Developer agent follows the C2 skills as prescriptive
templates, the learning value of implementing C2 is reduced. The specification phase
and implementation phase should preserve the developer's learning experience.

**Recommendation**: Before the Senior Developer agent runs for C2, revise the C2 skills
to a design-questions learning guide style: raise the key decisions, explain the
tradeoffs, and leave the concrete implementation choices to the developer. The skills
should guide thinking, not prescribe answers.

---

## Files With No Issues Found

The following files were reviewed and found to be consistent, clear, and up to date:

- `documentation/project/overview.md` (approved)
- `documentation/requirements/user-requirements.md` (approved)
- `documentation/requirements/phase-1-user-stories.md` (approved)
- `documentation/decisions/architecture-decisions.md` (approved)
- `documentation/project/architecture.md` (approved)
- `documentation/project/system-diagrams.md` (approved)
- `documentation/project/developer-context.md`
- `documentation/approvals.md` (audit log accurate)
- `.claude/agents/product-owner.md`
- `.claude/agents/head-of-development.md`
- `.claude/skills/agent-file-conventions.md`
- `.claude/skills/approval-workflow.md`
- `.claude/skills/configuration-patterns.md`
- `.claude/skills/dependency-composition-pattern.md`
- `.claude/skills/metadata-schema.md`
- `.claude/skills/pipeline-testing-strategy.md`
- `.claude/skills/ocr-extraction-workflow.md`
- `.claude/skills/embedding-chunking-strategy.md`
- `.claude/skills/notion-lab-entry.md`
- `.claude/skills/overview-review-workflow.md`
- `.claude/skills/user-stories-review-workflow.md`
- `.claude/skills/adr-review-workflow.md`

---

## Issue Count Summary

| Category | High | Medium | Low | Total |
| --- | --- | --- | --- | --- |
| Inconsistencies | 2 | 3 | 5 | 10 |
| Clarity gaps | 1 | 2 | 3 | 6 |
| Suggestions | — | — | — | 6 |
