# ADR Review Workflow

This skill defines the process for reviewing `documentation/decisions/architecture-decisions.md`
with the developer, resolving all review points, updating the document and any related files,
and archiving the review.

Use this skill when a consistency review (such as `adr-consistency-review.md`) has been
produced for the ADR document and the developer wants to work through it.

---

## Trigger Prompt

The developer starts the workflow with a prompt of this form:

> I would like to go through the ADR review document and discuss each point so that
> `architecture-decisions.md` (and any related files) can be modified to satisfy the review.

---

## Workflow

### Step 1 — Load context

Read these files before starting:

1. `documentation/decisions/architecture-decisions.md` — the live ADR document
2. `documentation/decisions/adr-consistency-review.md` — the review findings
3. `documentation/project/architecture.md` — architecture synthesis (may also need changes)
4. `documentation/requirements/user-requirements.md` — authoritative requirements baseline
   (needed to verify decisions against the source, particularly for UR references in ADRs)

### Step 2 — Confirm approach

Ask the developer how they want to work through the review:

- Confirmed Issues first, then Observations (recommended)
- One at a time in document order
- Decision-required items first, then mechanical fixes
- Summary first, then prioritise

### Step 3 — Work through each point

Work through Confirmed Issues (CI-*) before Observations (OB-*). For each item, in order:

1. Present the issue clearly: what the review says, the relevant current text with file and
   line reference, and the question or decision that needs resolution
2. For mechanical fixes (label "Mechanical fix" in the tracker): state the proposed change
   and ask for confirmation rather than asking an open question
3. For items requiring a decision (label "Decision required"): present the options clearly
   with their implications and wait for the developer to choose before drafting a change
4. For gap and implementer decision items (labels "Gap", "Implementer decision",
   "Clarification"): state the options and ask whether to resolve now or defer explicitly
5. Wait for the developer's response before moving to the next item
6. Once the developer confirms a resolution, draft the exact wording change to the relevant
   file and present it; then analyse the drafted wording to check it does not introduce new
   contradictions, unreachable states, or inconsistencies with other ADRs — state the result
   of the analysis explicitly before moving to the next item; if the analysis finds a problem,
   resolve it before continuing
7. Do not apply the edit to any file yet — accumulate all drafted changes for the plan step
8. If a resolution to one item makes another item moot (e.g. removing `running` resolves
   both CI-004 and OB-002), note this and skip the redundant item without re-asking
9. If the developer raises a new issue not in the review document, treat it as an additional
   item and include it in the plan

### Step 4 — Write the plan

Once all items are discussed, write a plan file at the path provided by the plan mode system.

The plan must include:

- A context section explaining why the changes are being made
- Every change grouped by target file (`architecture-decisions.md`, `architecture.md`, or other)
- Within each file group, changes ordered by ADR number (or section) for ease of application
- For each change: what to add/remove/reword, the review item ID (`CI-*` or `OB-*`) it resolves,
  and the exact line reference in the target file
- Any additional changes that emerged from the discussion but were not in the original review
- A verification section:
  - Re-read the full `architecture-decisions.md` and confirm all CI-* items addressed
  - Re-read `architecture.md` if it was modified
  - Confirm the Resolution Tracker table in the review document matches the outcomes
  - Run markdownlint (the hook handles this automatically)

### Step 5 — Apply changes

Apply all changes in this order:

1. `documentation/decisions/architecture-decisions.md` — work ADR by ADR in ascending order
2. `documentation/project/architecture.md` — if changes were required (CI-007 or similar)
3. Any other files affected

The markdownlint hook runs automatically after each edit — fix any lint errors before
continuing to the next edit.

### Step 6 — Update the review tracker

After all file edits are applied, update the Resolution Tracker table at the bottom of
`documentation/decisions/adr-consistency-review.md`:

- Change each resolved item's Status from "Open" to "Resolved"
- For deferred items, change Status to "Deferred — [reason]"

### Step 7 — Archive the review and update memory

Once all changes are applied and the tracker is updated:

1. Get the current date and time: `date "+%Y-%m-%d %H%M"`
2. Move the review file to the archive:
   `archive/review documents/adr-consistency-review-YYYY-MM-DD-HHMM.md`
3. Update `MEMORY.md` at the project memory path:
   - Update the Phase Status table: mark `architecture-decisions.md` as reviewed and note
     any items deferred
   - If `architecture.md` was also updated, note that too
   - Add a brief record of key decisions made (CI-002, CI-004, CI-005 outcomes)

---

## Archive Naming Convention

Consistent with existing review archives:

```text
adr-consistency-review-YYYY-MM-DD-HHMM.md
```

Check `archive/review documents/` before archiving to confirm no naming collision.

---

## Notes

- Draft wording changes during the discussion phase but do not apply them to any file yet —
  accumulate all drafts and apply them in Step 5
- ADRs are append-friendly but not immutable — corrections and clarifications are valid edits
  before the document is formally approved; once approved, prefer addenda
- If a discussion reveals a conflict with an approved upstream document (`user-requirements.md`,
  `overview.md`, `user-stories.md`), surface it before proceeding — do not make an ADR change
  that contradicts an approved document without flagging it explicitly
- If an Observation item is explicitly deferred, record the deferral reason in the tracker
  and note it in the plan; do not silently skip it
- The workflow is complete when: all `CI-*` items resolved, all `OB-*` items either resolved or
  explicitly deferred, all target files updated, the tracker updated, the review archived,
  and MEMORY.md updated
