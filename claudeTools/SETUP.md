# claudeTools — Setup & Update Guide

This folder contains tools for exporting Claude Code sessions to Markdown.
The files here are the **source of record** in git. To make changes active,
you need to copy them to the locations where Claude Code reads them.

---

## Files

| File | Installed location |
|------|--------------------|
| `claude-export.mjs` | `~/.local/bin/claude-export` |
| `claude-stop-hook.json` | Merged into `~/.claude/settings.json` |

---

## Initial setup (first time only)

### 1. Install the CLI script

```bash
cp claudeTools/claude-export.mjs ~/.local/bin/claude-export
chmod +x ~/.local/bin/claude-export
```

Verify it works:

```bash
claude-export --list
```

### 2. Install the Stop hook

Open `~/.claude/settings.json` and merge in the contents of `claude-stop-hook.json`.
The result should include the `hooks` block alongside any existing settings, for example:

```json
{
  "enabledPlugins": {
    "figma@claude-plugins-official": true
  },
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

The hook takes effect at the start of the next Claude Code session.

---

## Making changes

### 1. Edit the file in the repo

Make your changes to `claudeTools/claude-export.mjs` or `claudeTools/claude-stop-hook.json`
in the chatorama repo as you would any other source file.

### 2. Copy to the installed location

**For the CLI script:**
```bash
cp claudeTools/claude-export.mjs ~/.local/bin/claude-export
```

**For the hook** — if you changed `claude-stop-hook.json`, manually update the
corresponding section in `~/.claude/settings.json` to match.

### 3. Test the change

```bash
# Verify the CLI script runs correctly
claude-export --list

# Spot-check an export
claude-export -o /tmp/test-export.md && head -20 /tmp/test-export.md
```

### 4. Commit and push

```bash
git add claudeTools/
git commit -m "Update claude-export: <describe your change>"
git push
```

---

## Verifying the hook is active

In Claude Code, type `/hooks` to open the hooks management UI.
The Stop hook should appear in the list. If it doesn't:

1. Check that `~/.claude/settings.json` is valid JSON (`jq . ~/.claude/settings.json`)
2. Start a new Claude Code session — hooks are loaded at session start
3. Re-copy the hook config and check the merge was done correctly

---

## Disabling the hook temporarily

In `~/.claude/settings.json`, add `"async": false` and `"command": "true"` to
no-op the hook, or simply remove the `Stop` block entirely. The repo copy is
unaffected — re-copy when you want to re-enable it.
