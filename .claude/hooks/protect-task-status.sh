#!/bin/bash
# PostToolUse hook: block direct edits to **Status**: fields in task files.
# Status changes must go through the /update-task-status skill.
# Allows: writing not_started (PM decomposition), any change via the skill itself.
# Blocks: any Edit or Write that changes a **Status**: line from a non-not_started value.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only act on task files
case "$FILE_PATH" in
  */documentation/tasks/backend-tasks.md|\
  */documentation/tasks/frontend-tasks.md|\
  */documentation/tasks/python-tasks.md) ;;
  *) exit 0 ;;
esac

if [ "$TOOL_NAME" = "Edit" ]; then
  OLD=$(echo "$INPUT" | jq -r '.tool_input.old_string // empty')
  # If the old_string contains a Status line that is not not_started, block it
  if echo "$OLD" | grep -qE '^\*\*Status\*\*: ' && ! echo "$OLD" | grep -qE '^\*\*Status\*\*: not_started$'; then
    echo "Direct edits to the Status field in task files are not permitted." >&2
    echo "Use /update-task-status (task file, task number, new status) to change task status." >&2
    exit 2
  fi
fi

if [ "$TOOL_NAME" = "Write" ]; then
  NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

  # Read the current file content (before the write)
  if [ ! -f "$FILE_PATH" ]; then
    exit 0  # New file — no existing statuses to protect
  fi

  # For each Status line in the current file that is not not_started,
  # check if that exact line is absent or changed in the new content.
  while IFS= read -r line; do
    # Extract current status value
    current_status=$(echo "$line" | sed -n 's/^\*\*Status\*\*: //p')
    if [ -z "$current_status" ] || [ "$current_status" = "not_started" ]; then
      continue
    fi
    # Check if this status line still appears unchanged in the new content
    if ! echo "$NEW_CONTENT" | grep -qF "$line"; then
      echo "Direct edits to the Status field in task files are not permitted." >&2
      echo "Use /update-task-status (task file, task number, new status) to change task status." >&2
      exit 2
    fi
  done < <(grep -E '^\*\*Status\*\*: ' "$FILE_PATH")
fi

exit 0
