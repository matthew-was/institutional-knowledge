#!/bin/bash
# PostToolUse hook: run markdownlint after any Write or Edit tool call.
# Blocks (exit 2) if lint errors are found, feeding the error output back to Claude.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip non-markdown files
[[ "$FILE_PATH" != *.md ]] && exit 0

# Skip files that don't exist (e.g. deletions)
[[ ! -f "$FILE_PATH" ]] && exit 0

# Skip files outside the project directory (e.g. plan files in ~/.claude/plans/)
[[ "$FILE_PATH" != "$CLAUDE_PROJECT_DIR"/* ]] && exit 0

# Prefer a markdownlint on PATH (for example a Homebrew install). Otherwise use the
# copy installed by `pnpm install` in this repo. That copy needs node, which on
# machines using fnm is loaded only by interactive shells, so find it directly.
LINT=markdownlint
if ! command -v markdownlint >/dev/null 2>&1; then
  LOCAL_LINT="$CLAUDE_PROJECT_DIR/node_modules/.bin/markdownlint"
  if [[ -x "$LOCAL_LINT" ]]; then
    LINT="$LOCAL_LINT"
    if ! command -v node >/dev/null 2>&1; then
      NODE_BIN=$(ls -d "$HOME"/.local/share/fnm/node-versions/*/installation/bin 2>/dev/null | tail -1)
      [[ -n "$NODE_BIN" ]] && export PATH="$NODE_BIN:$PATH"
    fi
  fi
fi

if ! OUTPUT=$("$LINT" "$FILE_PATH" 2>&1); then
  echo "markdownlint failed for $FILE_PATH — fix these errors:" >&2
  echo "$OUTPUT" >&2
  exit 2
fi

exit 0
