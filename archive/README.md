# Archive

Provenance record for source material processed during the documentation phase. The `documentation/` directory is the single source of truth; this directory is read-only historical reference.

## Subdirectories

### `initial documentation/`

Original source files from before the documentation reorganisation: pre-approval component specifications (C1, C2), the original project context document, the working-with-claude.md agent workflow design, pipeline diagrams, and the initial project purpose statement. Also includes the `domain-context.md` file that was planned but superseded by database-managed vocabulary (ADR-014).

### `previous conversation decisions/`

Exported conversation transcripts (conversations 1–6) from the early design sessions that preceded the formal documentation phase.

### `previous-documentation/`

Two subdirectories:

- `components/` — Pre-HoD component specifications (C1, C2). Archived because they pre-date the Head of Development review and contain architectural assumptions superseded by ADR-001 to ADR-041. Senior Developers will produce new specifications.
- `previous documentation to be reviewed/` — Documentation from before the reorganisation that was read and processed into `documentation/`. Includes the original `decisions/unresolved-questions.md` (UQ-001 to UQ-006 resolved via ADRs) and pre-approval design documents.

### `review documents/`

Review output files produced by the Product Owner and Head of Development agents during approval cycles: overview reviews, user story reviews, ADR consistency reviews, architecture and system diagram reviews, and the skills consistency review. Archived after their issues were resolved and the relevant documents were approved.

### `scope-working-documents/`

Working documents used to define project scope during the initial requirements phase: users, functional scope, document types, query scope, phases and priorities. Content incorporated into `documentation/project/overview.md` and `documentation/requirements/user-requirements.md`.
