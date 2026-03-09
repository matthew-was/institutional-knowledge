# Notion Lab Entry

This skill manages multi-session lab notebook entries in Notion. A draft is accumulated
locally across sessions and published as a single Notion page when complete.

---

## When to use

Use this skill when the developer says any of the following (or close equivalents):

- "Start a lab entry" — begins a new entry
- "Append to lab entry: ..." or "Append commits ..." — adds to the current entry
- "Finish lab entry" — compiles and publishes the entry to Notion

---

## Draft file

All in-progress state is stored at `~/.claude/lab-entry-draft.json`. This file persists
across chat sessions. There is only ever one active draft at a time.

Schema:

```json
{
  "started_at": "2026-02-19T09:30:00",
  "date": "2026-02-19",
  "blocks": [
    {
      "timestamp": "2026-02-19T09:45:00",
      "note": "Text of the note, or null if commits-only",
      "commits": [
        { "sha": "abc1234", "message": "commit message", "url": "https://github.com/..." }
      ]
    }
  ]
}
```

Each block has a `note` (string or null) and a `commits` array (may be empty).

---

## Command: Start a lab entry

1. Check whether `~/.claude/lab-entry-draft.json` exists.
   - If it exists: tell the developer there is already an open draft (show its
     `started_at`). Ask whether to discard it or finish and publish it first. Do not
     overwrite unless they confirm discard.
   - If it does not exist: proceed.
2. Get the current date and time using `date -u +"%Y-%m-%dT%H:%M:%S"` (UTC).
3. Write `~/.claude/lab-entry-draft.json` with:
   - `started_at`: set to the output of the `date` command
   - `date`: set to today's date (YYYY-MM-DD format)
   - `blocks`: empty array
4. Confirm to the developer: "Lab entry started at [time from date command]."

---

## Command: Append to lab entry

Read `~/.claude/lab-entry-draft.json`. If it does not exist, tell the developer there is
no open draft and suggest starting one.

**Important**: Only create blocks when the developer explicitly asks. Do not infer or
assume blocks should be created. Each block requires an explicit request to append.

This command has two sub-cases:

### Append a note

The developer says something like "Append to lab entry: [text]".

1. **Get the current timestamp using the `date` command**: `date -u +"%Y-%m-%dT%H:%M:%S"` (UTC).
   Do not guess or fabricate timestamps.
2. Append a block to the `blocks` array:

```json
{
  "timestamp": "<output from date command>",
  "note": "<the text provided>",
  "commits": []
}
```

1. Confirm: "Appended note."

### Append commits

The developer says something like "Append commits abc1234 def5678".

1. Get the current timestamp using `date -u +"%Y-%m-%dT%H:%M:%S"` (UTC).
2. For each SHA provided:
   - Run `git show --no-patch --format="%H %s" <sha>` to get the full hash and subject line.
     Use the short form of the full hash (first 7 characters) as the display SHA.
   - Run `git remote get-url origin` to get the remote URL.
     - If it is a GitHub URL (`github.com`), construct the commit link:
       `https://github.com/<owner>/<repo>/commit/<full-hash>`
     - If it is not GitHub, set `url` to null and include only hash and message.
3. Append a block to the `blocks` array:

```json
{
  "timestamp": "<output from date command>",
  "note": null,
  "commits": [
    { "sha": "abc1234", "message": "commit subject", "url": "https://github.com/..." }
  ]
}
```

1. Confirm: "Appended [N] commit(s)."

---

## Command: Finish lab entry

1. Read `~/.claude/lab-entry-draft.json`. If it does not exist, tell the developer there
   is no open draft.

2. Ask for the entry title (Name) if the developer has not provided it inline.

3. Infer **Type** and **Outcome** from all accumulated blocks (notes + commit messages):
   - **Type**: Debugging, Feature, Refactor, Research, Note, or Documentation
   - **Outcome**: Success, Partial, or Failed

4. Fetch the MCP resource at `notion://docs/enhanced-markdown-spec`. Do not guess or
   hallucinate Notion Markdown syntax — always fetch first.

5. Assemble the page content. Two sections only:

   **What was done**

   Render each block as a unit, in order:
   - Output the block's `timestamp` as a heading (e.g. `## HH:MM UTC`).
   - If the block has a `note`, output it as a line of text under the heading.
   - For each commit in the block, output a bullet:
     `[sha](url) — message` (omit the link brackets if `url` is null, plain text only).

   **Next steps**

   Infer from the current conversation context. Omit if there is nothing to say.

6. Create the page in the Lab Entries data source
   (`collection://30a66aac-d77c-4da6-b243-0bbb9aecdf7c`):

   | Property | Value |
   | --- | --- |
   | `Name` | Entry title |
   | `Type` | Inferred |
   | `Outcome` | Inferred |
   | `date:Date:start` | Value of `date` from draft (YYYY-MM-DD) |
   | `date:Date:is_datetime` | 0 |
   | `date:Start:start` | Value of `started_at` from draft (ISO-8601 with time) |
   | `date:Start:is_datetime` | 1 |

7. Delete `~/.claude/lab-entry-draft.json`.

8. Confirm to the developer: "Lab entry published to Notion. Draft deleted."

---

## Notes

- Lab Entries database: `https://www.notion.so/c92903bec2524c48934b510d2e8e776c`
- Data source ID: `30a66aac-d77c-4da6-b243-0bbb9aecdf7c`
- Programming Lab Notebook page: `https://www.notion.so/d1e7e18f044a4d7bba5ddb1e0da968ca`
- Draft file: `~/.claude/lab-entry-draft.json`
- One active draft at a time — warn before overwriting
- Always fetch the Notion Markdown spec before creating a page
