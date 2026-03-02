# Document Review Workflow

This skill defines the generic process for working through any review document with the
developer — discussing each finding, resolving decisions, applying changes to the target
document, and archiving the review.

Use this skill whenever an agent has produced a review file and the developer wants to work
through it. The caller's prompt specifies which review document and target document to use.

---

## Trigger Prompt

The developer starts the workflow with a prompt of this form:

> I would like to go through `[review-file-path]` and discuss each point so that
> `[target-document-path]` can be modified to satisfy the review.

If the developer does not specify the paths, ask them before proceeding.

---

## Workflow

### Step 1 — Load context

Read these files before starting:

1. The **review document** specified by the developer (contains the findings to work through)
2. The **target document** specified by the developer (the document to be updated)
3. Any **supporting documents** referenced in the review — the developer may specify these,
   or they may be listed in the review document itself (e.g. a contracts doc that the plan
   document references)

If the review document contains a Resolution Tracker table, note its current state.

### Step 2 — Confirm approach

Ask the developer how they want to work through the review:

- One at a time (recommended — allows careful deliberation)
- Category at a time
- Higher-severity items first, then lower-severity
- Summary first, then prioritise

### Step 3 — Work through each point

For each review point, in order:

1. Present the finding clearly: what the review says, the relevant current text with file and
   line reference, and the question or decision that needs resolution
2. Classify the resolution type and state it explicitly:
   - **Mechanical fix** — unambiguous correction; state the proposed change and ask for
     confirmation rather than asking an open question
   - **Decision required** — multiple valid options; present each option with its implications
     and wait for the developer to choose before drafting a change
   - **Deferral candidate** — fix is valid but not urgent; ask whether to resolve now or defer
3. Wait for the developer's response before moving to the next point
4. Once the developer confirms a resolution, draft the exact wording change to the target
   document and present it; then analyse the drafted wording to check it does not introduce
   new ambiguity, contradictions, or inconsistencies — state the result of the analysis
   explicitly before moving to the next point; if the analysis finds a problem, resolve it
   before continuing
5. Do not apply the edit to any file yet — accumulate all drafted changes for the plan step
6. If a point is resolved by an earlier discussion, note this and move on without re-asking
7. If the developer raises a new issue not in the review document, treat it as an additional
   change and include it in the plan

### Step 4 — Write the plan

Once all points are discussed, write a plan file at the path provided by the plan mode system.

The plan must include:

- A context section: which review document, which target document, date
- Every change grouped by target file (if multiple files are affected)
- Within each file group, changes ordered by document section or line number
- For each change: what to add/remove/reword, which review finding it resolves, and the exact
  line reference in the target file
- Any additional changes that emerged from the discussion but were not in the original review
- Deferred items: list each with the reason for deferral
- A verification section: re-read the updated document after all changes are applied and
  confirm all findings are addressed; markdownlint runs automatically via the hook

### Step 5 — Apply changes

Apply all changes to the target document. Work section by section. The markdownlint hook runs
automatically after each edit — fix any lint errors before continuing to the next edit.

If multiple files are affected, apply changes file by file in the order listed in the plan.

### Step 6 — Update the resolution tracker (if present)

If the review document contains a Resolution Tracker table:

- Change each resolved finding's status from "Open" to "Resolved"
- For deferred findings, change status to "Deferred — [reason]"

If there is no tracker table, skip this step.

### Step 7 — Archive the review and update memory

Once all changes are applied:

1. Get the current date and time: run `date "+%Y-%m-%d %H%M"` in the terminal
2. Move the review file to the archive:
   `archive/review documents/[review-filename]-YYYY-MM-DD-HHMM.md`
   Derive the archive filename from the review document's own filename — strip any existing
   date suffix and append the current timestamp.
3. Update `MEMORY.md` at the project memory path:
   - Record that the review was completed, the archived path, and any items deferred
   - Note key decisions made if they are significant enough to affect future sessions

---

## Archive Naming Convention

```text
archive/review documents/[document-name]-review-YYYY-MM-DD-HHMM.md
```

Check `archive/review documents/` before archiving to confirm no naming collision with an
existing file.

---

## Notes

- Draft wording changes during the discussion phase but do not apply them yet — accumulate all
  drafts and apply them in Step 5
- If a discussion reveals a conflict with an approved upstream document, surface it before
  proceeding — do not make a change that contradicts an approved document without flagging it
- If a deferred item is deferred, record the reason; do not silently skip it
- The workflow is complete when: all findings resolved or explicitly deferred, all target files
  updated, tracker updated (if present), review archived, and MEMORY.md updated
