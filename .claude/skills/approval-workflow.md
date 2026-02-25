# Approval Workflow

This skill defines how agents record, check, and revoke document approvals. All agents that gate their work on document approvals must follow this workflow exactly. Consistent behaviour across agents is the goal — no agent may interpret these rules differently.

---

## Purpose

Documents produced during the development process are not acted upon until the developer has explicitly approved them. Approvals create an auditable record of what was reviewed and when. If a document is later questioned or changed, the audit trail shows what was approved, who raised the issue, and why.

---

## The Approvals File

**Location**: `documentation/approvals.md`

This file is created by the first agent to record an approval. It is never deleted. It has two sections:

### Section 1: Status Table

A table showing the current approval status of each tracked document.

| Document | Status | Last Updated |
| --- | --- | --- |
| `documentation/project/overview.md` | Unapproved | — |
| `.claude/docs/requirements/user-requirements.md` | Unapproved | — |
| `.claude/docs/requirements/phase-1-user-stories.md` | Unapproved | — |

Status values: `Approved` or `Unapproved`.

### Section 2: Audit Log

A chronological log of every status change. One entry per change, appended — never modified or deleted.

Format:

```text
YYYY/MM/DD HH:MM - [document] [action] - [requestor] - [reason]
```

Examples:

```text
2026/02/11 17:00 - overview.md approved - Developer - reviewed and confirmed
2026/02/11 17:45 - overview.md unapproved - Head of Development - clarification on error case required
2026/02/11 18:30 - overview.md approved - Developer - error case resolved and overview updated
2026/02/11 18:31 - user-requirements.md unapproved - Product Owner - cascade from overview.md change
```

---

## Document Dependency Order

For this project, documents have a dependency chain. A downstream document cannot be approved until all upstream documents it depends on are approved.

```text
documentation/project/overview.md
  └── .claude/docs/requirements/user-requirements.md
        └── .claude/docs/requirements/phase-1-user-stories.md
```

When a document is unapproved, all documents downstream of it are also unapproved.

---

## How to Record an Approval

When the developer explicitly states that a document is approved in the current session:

1. Update the document's row in the status table: set Status to `Approved`, set Last Updated to the current date/time
2. Append an audit log entry: `YYYY/MM/DD HH:MM - [document] approved - Developer - [any notes the developer gave]`
3. Do NOT approve downstream documents automatically — each must be approved individually

What counts as explicit approval: the developer says something like "that looks good", "approved", "I'm happy with that", or "let's proceed". If it is ambiguous, ask — do not assume.

---

## How to Record an Unapproval

When a document is challenged or must be revisited:

1. Update the document's row in the status table: set Status to `Unapproved`, set Last Updated to the current date/time
2. Append an audit log entry: `YYYY/MM/DD HH:MM - [document] unapproved - [requestor] - [reason]`
3. Identify all downstream documents and mark them unapproved using the same process
4. Present the full list of newly unapproved documents to the developer before proceeding

The requestor field is the agent or person who raised the issue (e.g. `Head of Development`, `Developer`, `Product Owner`).

---

## Re-Approval Trigger Rules

Any agent that raises a question that challenges the content of an approved document must:

1. State clearly which document is being challenged and why
2. Notify the Product Owner — the Product Owner owns the unapproval cascade
3. Not proceed with work that depends on the challenged document until it is re-approved

The Product Owner then:

1. Marks the challenged document unapproved (with the raising agent as requestor)
2. Cascades unapprovals downstream
3. Surfaces the issue to the developer via the appropriate review document
4. Waits for the developer to resolve the issue and re-approve

---

## What Agents Must NOT Do

- Proceed past a dependency that is not yet approved
- Self-approve a document (only the developer can approve)
- Silently bypass the workflow (e.g. by not checking `approvals.md` at session start)
- Delete or modify existing rows in the audit log
- Mark downstream documents as approved when an upstream document is still unapproved

---

## Checking Approval Status at Session Start

Any agent whose work depends on approved documents must read `documentation/approvals.md` at the start of every session and check the status of all documents it depends on before doing anything else.

If a required document is not yet approved, the agent must inform the developer and wait — it does not proceed.

If `approvals.md` does not exist, all documents are treated as unapproved.
