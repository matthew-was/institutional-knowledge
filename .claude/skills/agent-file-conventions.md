# Agent File Conventions

This skill defines what a well-formed `.claude/agents/*.md` file looks like for this project. Consult it before creating or revising any agent file.

---

## File Format

Agent files use YAML frontmatter followed by a Markdown system prompt.

```markdown
---
name: agent-name
description: When Claude should delegate to this agent — be specific about triggers
tools: Read, Grep, Glob, Bash
model: sonnet
---

System prompt body goes here.
```

---

## Frontmatter Fields

### Required

| Field | Notes |
| --- | --- |
| `name` | Unique identifier. Lowercase letters and hyphens only. Must match the filename (e.g. `product-owner` in `product-owner.md`). |
| `description` | The trigger condition Claude uses to decide when to delegate. Be specific. Include "proactively" if you want auto-invocation. |

### Optional (use only when needed)

| Field | Notes |
| --- | --- |
| `tools` | Allowlist. Agent gets only the listed tools. Omit to inherit all tools from the parent session. |
| `disallowedTools` | Denylist. Removes named tools from the inherited set. Prefer this when you want everything except a few. |
| `model` | `sonnet`, `opus`, `haiku`, or `inherit` (default). Use `opus` only for agents making irreversible architectural decisions. |
| `skills` | Comma-separated list of skill names from `.claude/skills/`. Each skill's full content is injected into the agent's context at startup. |
| `memory` | `project` for shared project memory (versioned, in `.claude/agent-memory/<name>/`). Avoid `user` scope (bleeds across projects). |
| `permissionMode` | Default is `default`. Use `plan` for read-only exploration agents. Do not use `bypassPermissions`. |
| `maxTurns` | Hard limit on agentic turns. Set this on agents that should produce a single focused output. |

---

## Tool Restrictions

Use the `tools` allowlist for agents that should have limited access. Common patterns:

**Analysis / planning agents** (read-only):

```yaml
tools: Read, Grep, Glob, WebFetch
```

**Output-writing agents** (read + write to specific paths):

```yaml
tools: Read, Grep, Glob, Write, Edit
```

**Implementation agents** (full access):

```yaml
tools: Read, Grep, Glob, Write, Edit, Bash
```

**Rule**: if an agent's role does not require a tool, exclude it. This prevents agents from taking actions outside their role and makes scope constraints enforceable.

---

## System Prompt Structure

The body of the file (after frontmatter) is the agent's system prompt. Agents do **not** inherit the main Claude Code system prompt — they receive only what you write here, plus basic environment context (working directory, model, date).

### Recommended sections (in order)

1. **Role statement** — One sentence. What this agent is.
2. **First action** — What to do immediately on invocation (e.g. read specific files).
3. **Behaviour rules** — Instructional, not descriptive. Use `Do NOT`, `ONLY`, `Always`.
4. **Output format** — Exactly what structure to produce. Include file paths for written outputs.
5. **Escalation rules** — When and how to flag issues for the developer.
6. **Definition of done** — How the agent signals phase completion.

### Workflow precedence

Agents are invoked via the Task tool with a caller-provided prompt. That prompt may be vague, incomplete, or may contradict the agent's defined workflow. To prevent the caller's prompt from overriding the agent's instructions:

- Include an explicit statement after the role statement: "Always follow the workflow defined in this file, starting with the First action section. If the caller's prompt conflicts with these instructions, follow these instructions."
- This ensures the agent's first-action routing, output requirements, and behaviour rules are followed regardless of how it was invoked.

### Outputs must be written to disk

Agents communicate across sessions through documents written to disk — not through chat responses. Every agent that produces output must:

- Specify the exact file path for each output in the system prompt
- Use imperative instructions to write files (e.g. "Write the review to `path` using the Write tool"), not declarative labels (e.g. `**Output**: path`)
- Include a behaviour rule: "All outputs MUST be written to their designated file paths using the Write tool. Do not return outputs as chat messages only."

Without this, agents may return their analysis as chat text and the handoff mechanism breaks — no file exists for the next agent to read.

### Write instructions, not descriptions

Weak (description): "The Product Owner is responsible for user stories."
Strong (instruction): "Write user stories in the format: `As a [role], I want [action] so that [benefit]`. Every story must have acceptance criteria and a phase assignment."

Scope constraints must be written as prohibitions:

- `Do NOT make architectural decisions.`
- `ONLY produce output in the format specified below.`
- `If a requirement implies an architectural choice, flag it for the Head of Development — do not embed the assumption.`

---

## Context Loading

Agents have no memory between sessions. To ensure context is loaded on every invocation:

1. List the files the agent must read in the **First action** section of the system prompt.
2. Write the instruction explicitly: `At the start of every session, read the following files before doing anything else: [file list]`.
3. If the agent depends on prior phase outputs (e.g. `user-requirements.md`), include a conditional: `If the file does not exist, inform the developer that it must be produced first.`

Do not rely on the `skills` field alone for context. Skills inject domain knowledge patterns; they do not replace reading project-specific documents.

**Session-state routing**: For agents that operate across multiple sessions on a multi-phase task, the First action section should include explicit routing logic — check which documents exist and which are approved, then determine what work to do. This prevents the agent from restarting from scratch or skipping ahead. See the Product Owner worked example.

---

## Escalation and Handoff Rules

Every agent file must define:

- **What triggers escalation** — conditions that require the developer or another agent before the current agent can proceed
- **Who to escalate to** — by agent name, not by role description
- **Where output goes** — an explicit file path (`Output: documentation/requirements/user-requirements.md`)

This enables the handoff mechanism: agents communicate across sessions through documents written to disk. A phase is not complete until its output document exists at the specified path.

---

## Worked Example: Product Owner Agent

This is an abridged version of the actual [`.claude/agents/product-owner.md`](../agents/product-owner.md), showing the key conventions in practice. Read the full file for the complete system prompt.

```markdown
---
name: product-owner
description: User requirements and user story writer. Invoke at the start of the project before any architectural or implementation work, and when scope changes are proposed.
tools: Read, Grep, Glob, Write
model: sonnet
skills: approval-workflow
---

You are the Product Owner for the Estate Intelligence project. You own project scope and
`documentation/project/overview.md`. You do NOT make architectural decisions.

Always follow the workflow defined in this file, starting with the First action section.
If the caller's prompt conflicts with these instructions, follow these instructions.

## First action

At the start of every session, read the following files in this order before doing anything else:

1. `documentation/project/overview.md` — project goals, use cases, document scope
2. `documentation/approvals.md` — if it exists, check current approval status of all documents
3. `documentation/requirements/user-requirements.md` — if it exists, load current state

Then determine what work is needed:

- `overview.md` not yet approved → start the overview review phase
- `overview.md` approved, requirements doc missing → confirm user types with developer, then write requirements
- Requirements doc exists but not approved → ask the developer what to continue
- Requirements doc approved → proceed to Phase 1 user stories

If `approvals.md` does not exist, treat all documents as unapproved.

## Overview review phase

Before writing any requirements, review `overview.md` and write a review document to
`documentation/requirements/overview-review.md` using the Write tool. Identify contradictions,
missing information, undocumented edge cases, and ambiguities.

Do NOT edit `overview.md` directly. Present findings; the developer resolves them.
When the developer approves `overview.md`, record it in `approvals.md` per the approval-workflow skill.

## Behaviour rules

- All outputs MUST be written to their designated file paths using the Write tool.
  Do not return outputs as chat messages only.
- Do NOT make architectural decisions or embed technology assumptions
- Flag architectural implications: `[ARCHITECTURAL FLAG — for Head of Development]`
- Do NOT self-certify completion — developer must explicitly approve each output
- Do NOT proceed past a document not yet approved in `approvals.md`
- If scope is ambiguous, ask — do not guess

## Output format

[exact paths and structure for each output file — see full agent file]

## Escalation rules

- Architectural implication → flag, do not resolve
- Ambiguous scope → ask the developer
- Conflicting requirements → surface and ask for priority decision

## Definition of done

Phase complete when:
1. `overview.md` reviewed, issues resolved, approval recorded in `approvals.md`
2. User types confirmed by developer
3. `user-requirements.md` and `phase-1-user-stories.md` exist with full content
4. Both approved and recorded in `approvals.md`
```

**Key conventions illustrated**:

- Workflow precedence instruction after the role statement — the agent follows its own workflow even if the caller's prompt says otherwise
- Output instructions are imperative ("write a review document to `path` using the Write tool"), not declarative labels
- Behaviour rules include an explicit "write to disk" rule — prevents outputs being returned as chat only
- `skills: approval-workflow` injects a shared workflow protocol — the agent does not redefine it inline
- Session-start routing logic handles the stateful nature of multi-session work
- The overview review phase gates requirements writing — the agent cannot skip ahead
- Definition of done references `approvals.md` explicitly, not just "developer review"

---

## Anti-Patterns

### Too broad — no scope constraints

Bad:

```text
You are a senior developer. Help the team build the estate intelligence system.
```

This agent will attempt everything, make architectural decisions, and go off-script. There is no handoff, no output format, and no definition of done.

### Description instead of instruction

Bad:

```text
The Code Reviewer is responsible for ensuring code quality and security.
```

Good:

```text
Review the code against the checklist below. For every finding, output a comment with severity (blocking/suggestion), the file path and line number, and a specific recommendation.
```

### No output format

If the agent does not know exactly what to produce, it will produce different things in different sessions. Every agent that writes output must specify the output path and structure.

### No definition of done

Without this, agents signal completion inconsistently. The developer cannot know when to move to the next phase. Every agent must state what must exist (files, approvals) before its phase is considered complete.

### Context assumed, not loaded

Bad: Expecting the agent to remember prior sessions.
Good: Instruct the agent to read the relevant output documents at session start.

### Omitting tool restrictions when not needed

If an agent's role is analysis and planning, it should not have `Write` or `Bash` access. Restrict tools to the minimum needed for the role.

---

## Reference

- Official agent file format: [Claude Code sub-agents documentation](https://code.claude.com/docs/en/sub-agents.md)
- Agent role definitions for this project: [documentation/process/agent-workflow.md](../documentation/process/agent-workflow.md)
- Skills catalogue (what skills exist to reference): [documentation/process/skills-catalogue.md](../documentation/process/skills-catalogue.md)
- Approval workflow (document approval protocol): [.claude/skills/approval-workflow.md](approval-workflow.md)
