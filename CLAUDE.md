# Claude Code — Project Instructions

## Permission Requests

When a task requires a Bash command that is not in the current allow list, always present the permission request with an explicit option to add it to the `.claude/settings.json` allow list. The user prefers to grow the allow list incrementally rather than approving one-off commands.

Current allow list (`.claude/settings.json`):

- `Bash(mkdir:*)`
- `Bash(rm:*)`
- `Bash(mv:*)`
- `Bash(ls:*)`
- `Bash(tail:*)`
- `Bash(git:*)`
- `Bash(markdownlint:*)`
- `Bash(chmod:*)`
- `Edit(./*)`
- `Read(./*)`
- `Write(./*)`

When requesting a new permission, say clearly: "This requires `Bash(command:*)` — would you like to add it to the allow list in `.claude/settings.json`?"

---

## Project Overview

This is the **Estate Intelligence** project — a family document archiving system (1950s–present) with an AI/ML learning component. See [documentation/README.md](documentation/README.md) for full navigation.

### Component Architecture (4 components)

| Component | Name | Status |
| --- | --- | --- |
| C1 | Document Intake | Spec complete, not started |
| C2 | Text Extraction, Processing & Embedding | Spec complete, not started |
| C3 | Query & Retrieval | Design brief only |
| C4 | Continuous Ingestion | Placeholder (Phase 2+) |

### Core Principle

**Infrastructure as Configuration**: every external service (storage, database, OCR, embedding, LLM) is abstracted via an interface. Concrete implementation is selected at runtime via config. No hardcoded providers.

---

## Documentation Structure

```text
documentation/
├── README.md                     ← Navigation index
├── SUMMARY.md                    ← What was done + .claude/ setup guide
├── approvals.md                  ← Approval status and audit log (source of truth)
├── project/
│   ├── overview.md               ← Scope document
│   ├── architecture.md           ← System architecture (reflects all ADRs)
│   ├── system-diagrams.md        ← Visual diagrams (4 levels of detail)
│   └── developer-context.md      ← Developer background
├── decisions/
│   └── architecture-decisions.md ← All 41 ADRs (ADR-001 to ADR-041)
├── requirements/
│   ├── user-requirements.md      ← 138 requirements with Architectural Flags
│   └── phase-1-user-stories.md   ← 101 user stories for Phase 1
├── process/
│   ├── agent-workflow.md         ← 8-agent workflows and role definitions
│   ├── skills-catalogue.md       ← All identified skills and creation order
│   └── development-principles.md ← Core principles and constraints
└── tasks/                        ← Created during implementation phases
```

**Note**: `archive/previous-documentation/` contains archived pre-approval design documents and reference materials.

---

## Agent and Skills Setup

See [documentation/SUMMARY.md](documentation/SUMMARY.md) for the complete setup guide. All earlier unresolved questions (UQ-001 to UQ-006) have been resolved via ADRs; see [documentation/decisions/architecture-decisions.md](documentation/decisions/architecture-decisions.md) for ADR-036 to ADR-041 (graph-RAG, entity extraction, query routing).

**Existing `.claude/` files (do not recreate):**

- Skills: `agent-file-conventions.md`, `approval-workflow.md`, `notion-lab-entry.md`, `overview-review-workflow.md`, `user-stories-review-workflow.md`, `adr-review-workflow.md`
- Agents: `product-owner.md`, `head-of-development.md`

**Remaining to create:** Integration Lead, Senior Developer × 2, Implementer, Pair Programmer, Code Reviewer, Project Manager agents; `configuration-patterns.md`, `metadata-schema.md`, `pipeline-testing-strategy.md` skills.

**Current next steps:**

1. ✅ DONE: Approve `documentation/decisions/architecture-decisions.md` (ADR-001 to ADR-041) — approved 2026-02-25
2. ✅ DONE: Head of Development rewrites `architecture.md` and `system-diagrams.md` to reflect all ADRs — completed and approved 2026-02-25
3. ✅ DONE: Approve revised architecture and system diagrams — approved 2026-02-25
4. NEXT: Write 3 skills: `configuration-patterns.md`, `metadata-schema.md`, `pipeline-testing-strategy.md`
5. NEXT: Create remaining agents: Integration Lead, Senior Developer × 2, Implementer, Pair Programmer, Code Reviewer, Project Manager

### Key Output Locations

As agents complete their phases, outputs are written here:

```text
documentation/
├── requirements/
│   ├── user-requirements.md       ← Product Owner (Step 1) — authoritative scope baseline
│   └── phase-1-user-stories.md    ← Product Owner (Step 2)
└── tasks/
    ├── component-1-tasks.md       ← Project Manager (Step 10)
    └── component-2-tasks.md       ← Project Manager (Step 18)
```

These documents are the handoff mechanism between agents. Each subsequent agent reads from the relevant output documents of prior phases. When starting a new agent session, pass the appropriate documents as context — see [documentation/process/agent-workflow.md](documentation/process/agent-workflow.md) for the per-agent context table.

---

## Markdown Linting

A `PostToolUse` hook automatically runs `markdownlint` after every `Write` or `Edit` tool call. If lint errors are found, the hook blocks and feeds the errors back to Claude to fix before continuing.

Hook script: [.claude/hooks/lint-markdown.sh](.claude/hooks/lint-markdown.sh)

You do not need to manually run markdownlint after editing markdown files — the hook handles it. If you need to run it manually:

```bash
markdownlint path/to/file.md
```

`markdownlint` is installed at `/opt/homebrew/bin/markdownlint` (Homebrew global install).
