# Update Task Status

This skill manages task status transitions in task files. The
`protect-task-status.sh` hook blocks Claude tool calls that attempt to set a
user-only status — those transitions must be made by the user editing the file
directly in their editor.

---

## Arguments

The caller must supply:

- **Task file**: one of `documentation/tasks/backend-tasks.md`,
  `documentation/tasks/frontend-tasks.md`, or `documentation/tasks/python-tasks.md`
- **Task number**: integer (e.g. `15`)
- **New status**: the target status value

If any argument is missing, ask for it before proceeding.

---

## Transition table

| From | To | Who |
| --- | --- | --- |
| `not_started` | `coding_started` | Implementer |
| `coding_started` | `code_written` | Implementer (after checklist) |
| `code_written` | `ready_for_review` | **User only** |
| `ready_for_review` | `in_review` | Code reviewer |
| `in_review` | `review_passed` | Code reviewer |
| `in_review` | `review_failed` | Code reviewer |
| `review_passed` | `reviewed` | **User only** |
| `review_passed` | `ready_for_review` | **User only** |
| `review_passed` | `changes_requested` | **User only** |
| `review_failed` | `ready_for_review` | **User only** |
| `review_failed` | `changes_requested` | **User only** |
| `changes_requested` | `coding_started` | Implementer |
| `reviewed` | `done` | PM agent |
| `done` | `review_failed` | Code reviewer or PM agent |

User-only statuses: `ready_for_review`, `reviewed`, `changes_requested`

---

## Workflow

### Step 1 — Read the task file

Read the task file. Find the task block by locating the heading `### Task [N]:`.
Read the current `**Status**:` value from that block. Note the line number.

### Step 2 — Validate the transition

Check the transition against the table above.

**If the transition is not in the table**: output the following and stop:

> "The transition from `[current]` to `[requested]` is not a valid transition.
> Valid next states from `[current]` are: [list]. No change has been made."

**If the new status is user-only** (`ready_for_review`, `reviewed`,
`changes_requested`): output the following and stop:

> "The transition to `[status]` is user-only. Please edit the file directly:
>
> [backend-tasks.md:LINE](documentation/tasks/backend-tasks.md#LLINE)
>
> Change: `**Status**: [current]`
> To: `**Status**: [new]`"

### Step 3 — Run the completion checklist (code_written transitions only)

If the new status is `code_written`, run the following before applying the change:

1. `pnpm biome check apps/backend/src` (backend tasks) or equivalent for the service
2. `pnpm --filter backend exec tsc --noEmit` (backend tasks) or equivalent
3. `pnpm --filter backend test` (backend tasks) or equivalent

If any command fails, output the failure and stop. Fix the failures first, then
re-invoke this skill.

### Step 4 — Apply the change

Use the Edit tool to replace `**Status**: [current]` with `**Status**: [new]`
within the identified task block. The hook allows this because the new status
is not user-only.

### Step 5 — Confirm

Output:

> "Task [N] status updated: `[old]` → `[new]`."
