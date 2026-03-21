#!/bin/bash
# PostToolUse hook: block Claude tool calls that would set a user-only status.
#
# User-only statuses (may only be set by the user editing the file directly in their editor):
#   ready_for_review, reviewed, changes_requested
#
# All other status transitions are permitted via Claude tool calls.
# Legitimate writes (verification notes, description edits) that don't change
# the status value are always permitted.

USER_ONLY_STATUSES="ready_for_review|reviewed|changes_requested"

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
  NEW=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

  # Extract status values from old and new strings (if present)
  OLD_STATUS=$(echo "$OLD" | grep -oE '^\*\*Status\*\*: \S+' | sed 's/\*\*Status\*\*: //')
  NEW_STATUS=$(echo "$NEW" | grep -oE '^\*\*Status\*\*: \S+' | sed 's/\*\*Status\*\*: //')

  # Only act if both old and new have a status and they differ
  if [ -n "$OLD_STATUS" ] && [ -n "$NEW_STATUS" ] && [ "$OLD_STATUS" != "$NEW_STATUS" ]; then
    # Block if the new status is user-only
    if echo "$NEW_STATUS" | grep -qE "^($USER_ONLY_STATUSES)$"; then
      echo "The status '$NEW_STATUS' is a user-only transition." >&2
      echo "Please edit the file directly in your editor. Claude will provide the exact line and value to change." >&2
      exit 2
    fi
  fi
fi

if [ "$TOOL_NAME" = "Write" ]; then
  NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

  if [ ! -f "$FILE_PATH" ]; then
    exit 0  # New file — nothing to protect
  fi

  # For each status line in the current file, check if it has been changed to a user-only value
  while IFS= read -r line; do
    current_status=$(echo "$line" | sed -n 's/^\*\*Status\*\*: //p')
    [ -z "$current_status" ] && continue

    # If this status line is unchanged in the new content, it's fine
    if echo "$NEW_CONTENT" | grep -qF "$line"; then
      continue
    fi

    # The status line changed — find what it changed to
    new_status=$(echo "$NEW_CONTENT" | grep -oE '^\*\*Status\*\*: \S+' | sed 's/\*\*Status\*\*: //' | head -1)
    if echo "$new_status" | grep -qE "^($USER_ONLY_STATUSES)$"; then
      echo "The status '$new_status' is a user-only transition." >&2
      echo "Please edit the file directly in your editor. Claude will provide the exact line and value to change." >&2
      exit 2
    fi
  done < <(grep -E '^\*\*Status\*\*: ' "$FILE_PATH")
fi

exit 0
