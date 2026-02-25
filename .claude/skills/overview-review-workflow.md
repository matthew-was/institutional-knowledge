# Overview Review Workflow

This skill defines the process for reviewing `documentation/project/overview.md` with the
developer, resolving all review points, updating the document, and archiving the review.

Use this skill when the Product Owner agent has produced an `overview-review.md` file at
`documentation/requirements/overview-review.md` and the developer wants to work through it.

---

## Trigger Prompt

The developer starts the workflow with a prompt of this form:

> I would like to go through the review document and discuss each point so that `overview.md`
> can be modified to satisfy the review.

---

## Workflow

### Step 1 — Load context

Read these files before starting:

1. `documentation/project/overview.md` — current scope document
2. `documentation/requirements/overview-review.md` — Product Owner review findings

### Step 2 — Confirm approach

Ask the developer how they want to work through the review:

- One at a time (recommended — allows careful deliberation)
- Category at a time
- Summary first, then prioritise

### Step 3 — Work through each point

For each review point, in order:

1. Present the issue clearly: what the review says, the relevant current text with file and line
   reference, and the question that needs a decision
2. Where there is an obvious resolution, state it and ask for confirmation rather than asking
   an open question
3. Wait for the developer's response before moving to the next point
4. Once the developer confirms a decision, draft the exact wording change to `overview.md` and
   present it; then analyse the drafted wording to check it does not introduce new ambiguity,
   contradictions, or missing information — state the result of the analysis explicitly before
   moving to the next point; if the analysis finds a problem, resolve it before continuing
5. Do not apply the edit to the file yet — accumulate all drafted changes for the plan step
6. If a point is resolved by an earlier discussion (e.g. an ambiguity answered by a contradiction
   fix), note this and move on without re-asking

### Step 4 — Write the plan

Once all points are discussed, write a plan file at the path provided by the plan mode system.

The plan must include:

- A context section explaining why the changes are being made
- Every change grouped by review category (contradictions, missing information, edge cases,
  ambiguities)
- For each change: what to add/remove/reword, and the exact line reference in `overview.md`
- Any additional changes that emerged naturally from the discussion (e.g. design constraints
  surfaced as a cross-cutting concern)
- A verification section: re-read the full document, confirm all points addressed, run
  markdownlint (the hook handles this automatically)

### Step 5 — Apply changes

Apply all changes to `documentation/project/overview.md`. Work section by section. The
markdownlint hook runs automatically after each edit — fix any lint errors before continuing.

### Step 6 — Archive the review and update memory

Once all changes are applied and verified:

1. Get the current date and time: `date "+%Y-%m-%d %H%M"`
2. Move the review file to the archive using the naming convention from existing files:
   `archive/review documents/overview-review-YYYY-MM-DD-HHMM.md`
3. Update `MEMORY.md` at the project memory path:
   - Update the "Overview.md Status" section: increment the review count, update the archived
     review path, and replace the key decisions list with a cumulative record of all decisions
     from this and prior reviews
   - Mark overview.md as ready for user requirements if all points are resolved

---

## Archive Naming Convention

Existing files in `archive/review documents/` use this format:

```text
overview-review-YYYY-MM-DD-HHMM.md
```

Check the existing filenames before archiving to confirm the convention is consistent.

---

## Notes

- Draft wording changes during the discussion phase but do not apply them to `overview.md` yet — accumulate all drafts and apply them in Step 5
- If the developer raises a new issue not in the review document, treat it as an additional
  change and include it in the plan
- If a discussion reveals that a decision from a prior review needs revisiting, note it and
  address it before closing
- The workflow is complete when: all review points resolved, overview.md updated, review
  archived, MEMORY.md updated
