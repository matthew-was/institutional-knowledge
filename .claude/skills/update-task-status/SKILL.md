# Update Task Status

This skill is the only permitted mechanism for changing a task status in any task file. Agents
invoke it for transitions they are permitted to make. Users invoke it for user-only transitions.

The hook in `.claude/hooks/protect-task-status.sh` blocks any direct Edit or Write to a
`**Status**:` field in a task file — this skill is the only path through.

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
| `review_failed` | `ready_for_review` | **User only** |
| `review_failed` | `changes_requested` | **User only** |
| `changes_requested` | `code_written` | Implementer (after checklist) |
| `reviewed` | `done` | PM agent |
| `done` | `review_failed` | Code reviewer or PM agent |

---

## Workflow

### Step 1 — Read the task file

Read the task file. Find the task block by locating the heading `### Task [N]:`. Read the
current `**Status**:` value from that block.

### Step 2 — Validate the transition

Check the transition against the table above.

**If the transition is not in the table**: output the following and stop:

> "The transition from `[current]` to `[requested]` is not a valid transition. Valid next
> states from `[current]` are: [list]. No change has been made."

**If the transition is user-only and this skill is being invoked by an agent** (Implementer,
Code Reviewer, or PM agent): output the following and stop:

> "The transition from `[current]` to `[requested]` must be made by the user. The agent is
> not permitted to make this change. Please invoke `/update-task-status` directly and specify
> task file, task number, and new status."

### Step 3 — Run the completion checklist (code_written transitions only)

If the new status is `code_written`, run the following before applying the change:

1. `pnpm biome check apps/backend/src` (backend tasks) or the equivalent for the service
2. `pnpm --filter backend exec tsc --noEmit` (backend tasks) or the equivalent for the service
3. `pnpm --filter backend test` (backend tasks) or the equivalent

If any command fails, output the failure and stop. Do not apply the status change until all
three pass. Fix the failures first, then re-invoke this skill.

### Step 4 — Apply the change

Edit the task file: replace `**Status**: [current]` with `**Status**: [new]` within the
identified task block.

### Step 5 — Confirm

Output:

> "Task [N] status updated: `[old]` → `[new]`."
