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
- `Bash(pnpm:*)`
- `Bash(docker:*)`
- `Bash(date:*)`
- `Bash(python3:*)`
- `Edit(./*)`
- `Read(./*)`
- `Write(./*)`
- `Edit(~/.claude/lab-entry-draft.json)`
- `Write(~/.claude/lab-entry-draft.json)`
- `Bash(cat ~/.claude/lab-entry-draft.json)`
- `Bash(rm ~/.claude/lab-entry-draft.json)`

`ask` list (prompts before executing):

- `Bash(chmod:*)`
- `Edit(.claude/settings.json)`

When requesting a new permission, say clearly: "This requires `Bash(command:*)` — would you like to add it to the allow list in `.claude/settings.json`?"

---

## Task Status

Task status transitions use the `/update-task-status` skill (for agent-permitted transitions)
or the user editing the file directly in their editor (for user-only transitions). A hook
blocks Claude tool calls that attempt to set a user-only status.

### Valid statuses and who sets them

| Status | Set by |
| --- | --- |
| `not_started` | PM agent (decomposition) |
| `coding_started` | Implementer |
| `code_written` | Implementer (after checklist — skill enforces) |
| `ready_for_review` | **User only** |
| `in_review` | Code reviewer |
| `review_passed` | Code reviewer |
| `review_failed` | Code reviewer or PM agent |
| `changes_requested` | **User only** |
| `reviewed` | **User only** |
| `done` | PM agent |

### User-only transitions

The statuses `ready_for_review`, `reviewed`, and `changes_requested` may only be set by the
user editing the task file directly in their editor. The hook enforces this mechanically —
Claude tool calls that attempt to set these values are blocked.

When a user-only transition is needed, Claude outputs a clickable link to the exact line:

> "To move Task [N] to `ready_for_review`, edit [backend-tasks.md:LINE](documentation/tasks/backend-tasks.md#LLINE) —
> change `**Status**: [current]` to `**Status**: ready_for_review`."

### After a code review

**CRITICAL: Never action code review findings without explicit user instruction.**

- After the code reviewer returns, stop. Do not read the review and pre-emptively apply findings.
- The review file ends with "The review is ready for the user to check." — that is the handoff.
- Wait for explicit instruction before touching any code or changing any status.

### Implementation completion checklist

The `/update-task-status` skill enforces this automatically when setting `code_written`, but
for reference the three required checks are:

1. `pnpm biome check apps/backend/src` — lint and formatting
2. `pnpm --filter backend exec tsc --noEmit` — TypeScript type checking
3. `pnpm --filter backend test` — full test suite

For frontend tasks, substitute: `pnpm biome check apps/frontend/src`,
`pnpm --filter frontend exec tsc --noEmit`, `pnpm --filter frontend test`

---

## Git Commits

**CRITICAL: Never commit to git without explicit user instruction.** This is a hard rule, not a preference.

- Do not run `git commit` or `git push` under any circumstances unless the user explicitly says "commit" or "push"
- If you have staged changes and complete a task, stop and ask the user for permission before committing
- Committing without permission breaks the user's workflow and will require manual git history management
- User controls all commits to maintain clean, intentional git history with proper batch grouping
- **Permission does not carry forward.** If the user said "commit" earlier in the session, that applies to that specific batch only. Each subsequent commit requires a fresh explicit instruction. Do not infer standing permission from a prior commit instruction.

**Before committing:**

- Check whether any files exist in `documentation/tasks/code-reviews/`. If they do, remind the user to move them to `archive/code-reviews/[service]/` before committing — unless the user has explicitly said they don't want them moved.
- Code review files must be committed in the same commit as the implementation they relate to.

**When work is complete:**

1. Present the changes to the user
2. Wait for explicit instruction: "commit these changes" or "push to GitHub"
3. Only then proceed with git commands

---

## Project Overview

This is the **Institutional Knowledge** project — a family document archiving system (1950s–present) with an AI/ML learning component. See [documentation/README.md](documentation/README.md) for full navigation.

### Quick Orientation

- **Current phase**: Implementation in progress. All 19 backend tasks done + post-audit chores. All merged to main. Frontend Tasks 1–18, 13a, and 5a done (2026-03-28). Backend Chores 1, 2, and 4 done (2026-03-30). Chore 3 blocked on Node 26. Python Tasks 0, 1, 2, 3, 4, 5, 6, and 7 done (2026-04-07).
- **Design status**: All design documents approved (ADR-001 to ADR-052). See [documentation/approvals.md](documentation/approvals.md).
- **Next actionable step**: Python Task 8 (PatternMetadataExtractor interface and RegexPatternExtractor). Resolve OQ-3 before Python Task 15/22. Python tasks complete Phase 1.
- **Recent principles added**: CR-015 and `implementer.md` broadened to cover `typeof`/`instanceof`/`toBeTruthy` as vacuous assertion patterns (2026-03-27). Task and plan docs updated to remove prescriptive `(Client Component)` labels. `implementer.md` updated to require form schemas in `schemas.ts` and clarify CR-015 presence-checking (2026-03-28). Python `__init__.py` placement, Requirements File Standard, and module-structure stub rule added (2026-03-30). HTTP client interface/adapter/factory layout, config field constraints, and failure-path test rule added to Python principles and pair-programmer.md (2026-04-01). Fakes placement rule and implicit string truthiness prohibition added to Python principles and pair-programmer.md (2026-04-03).
- **Full project status**: [documentation/SUMMARY.md](documentation/SUMMARY.md)

### Component Architecture (4 components)

| Component | Name | Status |
| --- | --- | --- |
| C1 | Document Intake | Skills written, spec not started |
| C2 | Text Extraction, Processing & Embedding | Skills written, spec not started |
| C3 | Query & Retrieval | Skill written, spec not started |
| C4 | Continuous Ingestion | Placeholder (Phase 2+) |

### Monorepo Layout (ADR-015)

```text
apps/frontend/        # Hono custom server + Next.js (React UI)
apps/backend/         # Express
packages/shared/      # Shared TS types + Zod schemas
services/processing/  # Python (own virtualenv, Dockerfile)
```

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
│   └── architecture-decisions.md ← All 51 ADRs (ADR-001 to ADR-051)
├── requirements/
│   ├── user-requirements.md      ← 138 requirements with Architectural Flags
│   └── phase-1-user-stories.md   ← 101 user stories for Phase 1
├── process/
│   ├── agent-workflow.md                    ← 10-agent workflows and role definitions (incl. Platform Engineer)
│   ├── skills-catalogue.md                  ← All identified skills and creation order
│   ├── development-principles.md            ← Universal principles (all services)
│   ├── development-principles-backend.md    ← Backend-specific patterns
│   ├── development-principles-frontend.md   ← Frontend-specific patterns
│   └── development-principles-python.md     ← Python-specific patterns (stub)
└── tasks/                        ← Created during implementation phases
```

**Note**: `archive/previous-documentation/` contains archived pre-approval design documents and reference materials.

---

## Agent and Skills Setup

See [documentation/SUMMARY.md](documentation/SUMMARY.md) for the complete setup guide. All earlier unresolved questions (UQ-001 to UQ-006) have been resolved via ADRs; see [documentation/decisions/architecture-decisions.md](documentation/decisions/architecture-decisions.md) for ADR-036 to ADR-041 (graph-RAG, entity extraction, query routing).

**Existing `.claude/` files (do not recreate):**

- Skills: `agent-file-conventions.md`, `approval-workflow.md`, `configuration-patterns.md`, `dependency-composition-pattern.md`, `metadata-schema.md`, `pipeline-testing-strategy.md`, `ocr-extraction-workflow.md`, `embedding-chunking-strategy.md`, `overview-review-workflow.md`, `user-stories-review-workflow.md`, `adr-review-workflow.md`, `rag-implementation.md`, `document-review-workflow.md`, `update-task-status/` (invocable skill — `/update-task-status`), `finish-task/` (invocable skill — `/finish-task <service> <task-number>` — end-of-task routine: archive review, commit, push/PR, CLAUDE.md, MEMORY.md, lab entry)
- Global skills (in `~/.claude/skills/`): `lab-entry` — use `/lab-entry start|append|finish` across all projects
- Agents: `product-owner.md`, `head-of-development.md`, `integration-lead.md`, `senior-developer-frontend.md`, `senior-developer-python.md`, `project-manager.md`, `implementer.md`, `pair-programmer.md`, `code-reviewer.md`, `platform-engineer.md`

**All agents and skills written.** Design phase complete.

**Current next step:** Frontend Task 5. Resolve OQ-3 (embedding model) before Python Task 15/22.

**frontend-tasks.md rebuilt 2026-03-23** — 18 tasks; Hono custom server architecture; three-tier testing model; Base UI + Tailwind CSS (ADR-051); Temporal API via `@js-temporal/polyfill` (ADR-050).

### Key Output Locations

As agents complete their phases, outputs are written here:

```text
documentation/tasks/
├── frontend-tasks.md     ← 18 tasks (Hono custom server + Next.js frontend)
├── python-tasks.md       ← 23 tasks (Python processing service)
└── backend-tasks.md      ← 19 tasks (Express backend)
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

**Common MD032 gotcha**: lists immediately after blockquotes or prose without a blank line
trigger MD032. Always add a blank line between a blockquote and a following list, and
between prose and a list that follows it directly.
