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

## Git Commits

**CRITICAL: Never commit to git without explicit user instruction.** This is a hard rule, not a preference.

- Do not run `git commit` or `git push` under any circumstances unless the user explicitly says "commit" or "push"
- If you have staged changes and complete a task, stop and ask the user for permission before committing
- Committing without permission breaks the user's workflow and will require manual git history management
- User controls all commits to maintain clean, intentional git history with proper batch grouping

**When work is complete:**

1. Present the changes to the user
2. Wait for explicit instruction: "commit these changes" or "push to GitHub"
3. Only then proceed with git commands

---

## Project Overview

This is the **Institutional Knowledge** project — a family document archiving system (1950s–present) with an AI/ML learning component. See [documentation/README.md](documentation/README.md) for full navigation.

### Quick Orientation

- **Current phase**: Skills and agents creation. No implementation code exists yet.
- **Design status**: All design documents approved. See [documentation/approvals.md](documentation/approvals.md).
- **Next actionable step**: Create remaining agents (Integration Lead, Senior Developer × 2, Implementer, Pair Programmer, Code Reviewer, Project Manager). See Current Next Steps below.
- **Full project status**: [documentation/SUMMARY.md](documentation/SUMMARY.md)

### Component Architecture (4 components)

| Component | Name | Status |
| --- | --- | --- |
| C1 | Document Intake | Skills written, spec not started |
| C2 | Text Extraction, Processing & Embedding | Skills written, spec not started |
| C3 | Query & Retrieval | Skill written, spec not started |
| C4 | Continuous Ingestion | Placeholder (Phase 2+) |

### Core Principle

**Infrastructure as Configuration**: every external service (storage, database, OCR, embedding, LLM) is abstracted via an interface. Concrete implementation is selected at runtime via config. No hardcoded providers.

---

## Documentation Structure

```text
documentation/
├── README.md                     ← Navigation index
├── SUMMARY.md                    ← Project status, milestone timeline, .claude/ setup guide
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

- Skills: `agent-file-conventions.md`, `approval-workflow.md`, `configuration-patterns.md`, `dependency-composition-pattern.md`, `metadata-schema.md`, `pipeline-testing-strategy.md`, `ocr-extraction-workflow.md`, `embedding-chunking-strategy.md`, `notion-lab-entry.md`, `overview-review-workflow.md`, `user-stories-review-workflow.md`, `adr-review-workflow.md`, `rag-implementation.md`, `document-review-workflow.md`
- Agents: `product-owner.md`, `head-of-development.md`, `integration-lead.md`, `senior-developer-frontend.md`, `senior-developer-python.md`, `project-manager.md`, `implementer.md`, `pair-programmer.md`, `code-reviewer.md`

**All agents and skills written.** Design phase complete.

**Current next steps:**

1. ✅ DONE: All skills written (14 total)
2. ✅ DONE: All agents written (9 total) — ADR-001 to ADR-046 approved
3. ✅ DONE: Head of Development reviewed `architecture.md` and `system-diagrams.md` for ADR-046 consistency; both re-approved 2026-03-02. Design phase complete.
4. NEXT: Invoke Senior Developer Frontend to produce `documentation/tasks/senior-developer-frontend-plan.md`
5. Then: Invoke Senior Developer Python to produce `documentation/tasks/senior-developer-python-plan.md`
6. Then: Invoke Integration Lead to review plans, produce contracts and backend plan
7. Then: Invoke Project Manager × 3 to decompose plans into task lists
8. Then: Begin implementation with Implementer (frontend + backend) and Pair Programmer (Python)

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
