# Claude Code Session Export

Tools for exporting Claude Code sessions to Markdown files, for archiving or ingestion into Chatalog.

## Overview

Claude Code automatically saves every session as a `.jsonl` file at:

```
~/.claude/projects/<working-dir-slug>/<session-id>.jsonl
```

Each line is a JSON event. The `claude-export` script reads these files and renders the user/assistant turns as a readable Markdown document.

Two complementary mechanisms are provided:

| Mechanism | Trigger | Use case |
|-----------|---------|----------|
| `claude-export` CLI | Manual | Export any session on demand |
| Auto-export hook | Automatic | Keep a live snapshot after every response |

---

## `claude-export` CLI

### Installation

The script lives at `~/.local/bin/claude-export` and requires Node.js. It is already executable and on `$PATH` via `~/.local/bin`.

### Usage

```bash
# Export the most recent session → ~/Desktop/<title>-<date>.md
claude-export

# List all sessions (most recent first) with directory and date
claude-export --list

# Export a specific session by ID (prefix match)
claude-export c8e7e9b7

# Export to a custom output path
claude-export -o ~/notes/my-session.md

# Export the most recent session for a specific project directory
claude-export --dir ~/Documents/Projects/chatorama
```

### Output format

The exported Markdown file contains:

- A title derived from the first user message (up to 80 characters)
- Session ID and export date as metadata
- Each turn rendered as a `## User` or `## Claude` heading followed by the message text
- Horizontal rules (`---`) separating turns

Example filename: `building-ios-app-from-web-app-source-2026-06-05.md`

### How it works

1. Scans `~/.claude/projects/` for all `.jsonl` session files
2. Sorts by modification time (most recent first)
3. Parses the target session, extracting `type: "user"` and `type: "assistant"` entries
4. Renders turns to Markdown and writes to the output file

---

## Auto-export hook

### What it does

A `Stop` hook in `~/.claude/settings.json` runs `claude-export` automatically after every Claude response. It overwrites the same Desktop file each turn, so you always have an up-to-date snapshot of the current session without any manual steps.

### Configuration

The hook is defined in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/Users/tedshaffer/.local/bin/claude-export --stdin",
            "async": true,
            "statusMessage": "Exporting session..."
          }
        ]
      }
    ]
  }
}
```

Key settings:
- **`async: true`** — runs in the background so it never delays Claude's response
- **`--stdin`** — the hook receives a JSON payload on stdin containing `session_id`, which the script uses to export the exact current session rather than guessing from recency

### Modifying or disabling

Open `/hooks` in Claude Code to view, edit, or disable the hook via the UI. Or edit `~/.claude/settings.json` directly — remove the `Stop` key to disable entirely, or set `"async": false` if you want the export to complete before the next prompt is accepted.

---

## Changing the output directory

By default exports go to `~/Desktop`. To change this, edit `claude-export` and update the `defaultOut` line near the bottom:

```js
const defaultOut = join(homedir(), 'Desktop', `${slug}-${date}.md`);
```

For example, to export into a dedicated folder:

```js
const defaultOut = join(homedir(), 'Documents', 'claude-sessions', `${slug}-${date}.md`);
```

Make sure the target directory exists before changing it.

---

## Feeding exports into Chatalog

Exported Markdown files use the same format as Chatworthy exports (title + dated turns). They can be imported into Chatalog via the standard import flow. A future enhancement could watch the export directory and auto-ingest new files, similar to the Chatworthy → Chatalog pipeline.
