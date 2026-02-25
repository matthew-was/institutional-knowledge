# User Stories Review Workflow

This skill defines the process for reviewing `documentation/requirements/phase-1-user-stories.md`
with the developer, resolving all review points, updating the document, and archiving the review.

Use this skill when the Product Owner agent has produced a `user-stories-review.md` file at
`documentation/requirements/user-stories-review.md` and the developer wants to work through it.

---

## Trigger Prompt

The developer starts the workflow with a prompt of this form:

> I would like to go through the user stories review document and discuss each point so that
> `phase-1-user-stories.md` can be modified to satisfy the review.

---

## Workflow

### Step 1 — Load context

Read these files before starting:

1. `documentation/requirements/phase-1-user-stories.md` — current user stories document
2. `documentation/requirements/user-stories-review.md` — Product Owner review findings
3. `documentation/requirements/user-requirements.md` — authoritative requirements baseline
   (needed to verify decisions against the source)

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
4. Once the developer confirms a decision, draft the exact wording change to
   `phase-1-user-stories.md` and present it; then analyse the drafted wording to check it does
   not introduce new ambiguity, contradictions, or untestable criteria — state the result of the
   analysis explicitly before moving to the next point; if the analysis finds a problem, resolve
   it before continuing
5. Do not apply the edit to the file yet — accumulate all drafted changes for the plan step
6. If a point is resolved by an earlier discussion (e.g. an ambiguity answered by a related
   decision), note this and move on without re-asking
7. For findings flagged "Developer decision", present the options clearly and wait for the
   developer to choose before drafting a change

### Step 4 — Write the plan

Once all points are discussed, write a plan file at the path provided by the plan mode system.

The plan must include:

- A context section explaining why the changes are being made
- Every change grouped by review category (missing coverage, phase assignments, user type
  mismatches, untestable criteria, architectural assumptions, internal inconsistencies,
  misleading stories)
- For each change: what to add/remove/reword, and the exact line reference in
  `phase-1-user-stories.md`
- Any additional changes that emerged naturally from the discussion
- A verification section: re-read the full document, confirm all findings addressed, run
  markdownlint (the hook handles this automatically)

### Step 5 — Apply changes

Apply all changes to `documentation/requirements/phase-1-user-stories.md`. Work section by
section. The markdownlint hook runs automatically after each edit — fix any lint errors before
continuing.

### Step 6 — Archive the review and update memory

Once all changes are applied and verified:

1. Get the current date and time: `date "+%Y-%m-%d %H%M"`
2. Move the review file to the archive using this naming convention:
   `archive/review documents/user-stories-review-YYYY-MM-DD-HHMM.md`
3. Update `MEMORY.md` at the project memory path:
   - Update the "user-requirements.md Status" section or add a new "phase-1-user-stories.md
     Status" section as appropriate: record the review count, the archived review path, and a
     cumulative record of key decisions made
   - Mark `phase-1-user-stories.md` as approved if all findings are resolved

---

## Archive Naming Convention

Use this format, consistent with the existing `overview-review` archives:

```text
user-stories-review-YYYY-MM-DD-HHMM.md
```

Check `archive/review documents/` before archiving to confirm no naming collision.

---

## Notes

- Draft wording changes during the discussion phase but do not apply them to
  `phase-1-user-stories.md` yet — accumulate all drafts and apply them in Step 5
- If the developer raises a new issue not in the review document, treat it as an additional
  change and include it in the plan
- If a discussion reveals a conflict with `user-requirements.md` or `overview.md`, surface it
  before proceeding — do not make a change that contradicts an approved upstream document
- The workflow is complete when: all findings resolved, `phase-1-user-stories.md` updated,
  review archived, and `MEMORY.md` updated — approval is recorded separately by the Product Owner
