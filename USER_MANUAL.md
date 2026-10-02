# Chatorama User Manual

Chatorama is a personal knowledge system made of several cooperating tools:

| Tool | What it is | Where it runs |
|---|---|---|
| **Chatalog** | The knowledge base: Subjects → Topics → Notes, search, imports, recipes, quick notes | Web app at `http://localhost:8008` |
| **Chatworthy** | Chrome extension that exports AI chats to Markdown and captures recipes | ChatGPT, Gemini, Claude.ai, NYT Cooking, Bon Appétit |
| **Claude Code Exporter** | Local web app for exporting selected turns of Claude Code sessions | `http://localhost:9090` |
| **`claude-export` CLI** | Command-line export of whole Claude Code sessions (+ optional auto-export hook) | Terminal |

The usual flow: export a conversation (Chatworthy, Claude Code Exporter, or `claude-export`) → import the `.md` file into Chatalog → organize, relate, and search it.

---

## 1. Getting started

### Running Chatalog
1. Create `packages/chatalog/backend/.env` (see `.env.example`). Required: `MONGO_URI`. Optional: `PORT` (default `8008`; the Chatworthy extension expects this port), `MONGO_DB_NAME`.
   - Semantic search and embeddings need `OPENAI_API_KEY`.
   - Google Doc import needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (and optionally `GOOGLE_REDIRECT_URI`).
2. Build the shared packages and the frontend: `npm run build:chatalog` from the repo root (the frontend is bundled into `backend/public/`). During development, `npm run watch` in `packages/chatalog/frontend` rebuilds on change.
3. Start the backend: `npm run dev` in `packages/chatalog/backend`.
4. Open `http://localhost:8008`.

### The top bar
Always visible across Chatalog:

- **Search box**: type and press Enter (see [Search](#5-search)). If you are viewing a topic or a note inside a topic, the search is automatically limited to that subject/topic.
- **Notes**: the Subject/Topic tree and note lists.
- **Quick Notes**: unfiled scratch notes.
- **Manage Hierarchy**: create, rename, reorder, and delete subjects and topics.
- **Relations**: a table of every note relation.
- Action icons, left to right:
  - **Import file** (.md or .zip): chat exports and plain Markdown documents ([Imports](#4-importing-content))
  - **Import PDF**
  - **Import Google Doc**
  - **Quick Capture**: create a quick note
  - **Settings**

### Home page
`/` shows a welcome screen with quick-link cards for the first three subjects (alphabetically) and up to three of each subject's topics. Click a card to open the subject, or a topic chip to open that topic.

### Links and URLs
Every view is encoded in the URL, so refresh, bookmarks and deep links all work:
- `/s/<subject>`: subject overview
- `/s/<subject>/t/<topic>`: topic notes
- `/s/<subject>/t/<topic>/n/<note>` or `/n/<noteId>`: a note
- `/search?...`: a search, including all its filters
- `/quick-notes`, `/quick-notes/<id>`, `/subjects/manage`, `/relations`

---

## 2. Organizing: Subjects, Topics, Notes

### Notes page (tree + note list)
The left panel has the **Subjects & Topics** tree (alphabetical) and **Import History**. Click a subject to open its overview, or a topic to list its notes on the right.

In a topic's note list:
- **Click a note** to open it.
- **Drag the ⋮⋮ handle** to reorder notes. The order is saved.
- **⋮ → Properties** shows the note's properties without opening it.
- The **status glyph** after a title shows the note's status: `?` not set, `✓` completed, `•` any other status. Hover to see the status text. You can hide each kind in [Settings](#settings).
- Toolbar:
  - **Import File**: imports into this subject/topic, which become the defaults in the import dialog.
  - **Select All** / **Clear**
  - **Move (n)**: move the selected notes to another subject/topic.
  - **Merge (n)**: combine two or more selected notes into one ([Merging notes](#merging-notes)).
  - **Delete (n)**: permanently delete the selected notes, after a confirmation.

Below the list:
- **Related notes by subject** and **Directly related notes**: notes connected through relations.
- **Incoming references to this topic**: other topics and notes whose relations point at this topic. **Link note to topic** adds such a relation ([Relations](#3-relations)).

### Import History
The left panel lists past imports, newest first, with "N imported, M remaining" counts.
- Click an entry to list just the notes that import created. You can select, move, or delete them from there. Merge and reorder are not available in this view.
- Click the trash icon on an entry to remove that history record. **Clear history…** removes all records. Neither deletes the notes themselves.

### Subject overview
`/s/<subject>` shows **Topics in this subject** and **Subject relations** (related topics and notes that reference the subject). **Link note to subject** adds a relation from any note to this subject.

### Manage Hierarchy
- **New subject** / **New topic**: type a name and press Enter or click the add button.
- **Rename**: double-click a subject or topic name. Enter saves, Escape cancels.
- **Reorder subjects…** / **Reorder…** (topics): drag items into a new order, then save.
- **Delete**: deleting a subject removes its topics and notes. Deleting a topic removes all its notes. Both ask for confirmation first.

### Working with a note
A note opens in **preview** mode. Toolbar:
- **← / →**: previous/next note in the same topic (preview mode only)
- **Jump to top**
- Save-status chip: *Saved* / *Unsaved changes* / *Saving...*
- **Edit / Done**: toggle edit mode
- **Insert Image...**: edit mode, non-PDF notes
- **Open PDF**: PDF notes
- **Insert doc link** and **Open Google Doc**: Google Doc notes
- **Properties**
- **Export .md**: download the note's Markdown
- **Delete**: asks for confirmation, then moves to the next or previous note in the topic

**Editing** (click **Edit**):
- **Title**, **Subject**, and **Topic** fields. Subject and Topic accept existing names or new ones; a new name is created when the note saves.
- **Relations** editor ([Relations](#3-relations)).
- **Markdown** body (for PDF notes this is the **PDF Summary**), with a live **Preview** below.
- **Autosave** runs about 1 second after you stop typing. **Cmd/Ctrl+S** saves immediately.
- **Images**: **Insert Image...** uploads a picture and inserts it at the cursor. In edit mode, click an image in the preview to set its width (Small 320px, Medium 520px, Large 760px, Full, or Custom px).

**Preview features:**
- A **Context** box shows Subject/Topic chips and the note's relations. Click a chip or the open icon to navigate.
- Markdown supports GitHub-flavored tables and task lists, syntax-highlighted code, and line breaks as written.
- `#anchor` links scroll within the note. External links open in a new tab.
- **Table of contents**: chat-import notes (with **Prompt** markers) get a collapsible TOC listing each turn. Click an entry to jump to it.
- PDF and Google Doc notes show an embedded PDF preview with an **Open in new tab** link. If a Google Doc has no PDF rendition, the imported text is shown instead.

### Note Properties
A read-only dialog grouped into sections:
- **Identity**: note ID with a copy button, subject, topic, status, tags
- **Time**
- **Google Doc**: file name, Drive ID, last imported, last modified in Drive, sync status
- **Sources**: URLs with copy buttons
- **Chatworthy provenance**: file name, chat ID (copy, or open the source chat), chat title, turn index, total turns
- **Legacy** fields

When a Google Doc note is out of date with Drive, **Re-import from Google Doc** refreshes the stored copy, after a confirmation.

### Merging notes
Select two or more notes in a topic and click **Merge**. In the dialog:
1. Choose the **primary** note.
2. Use the up/down arrows to order the notes.
3. Optionally edit the **Merged title**.

The primary note is updated with the contents concatenated in that order, separated by dividers, and with tags combined. **The other notes are deleted.**

### Settings
The ⚙ dialog controls where the status glyph appears: when status is not set, when it is "completed", and for other statuses. These choices are saved in the browser and remembered across reloads.

---

## 3. Relations

A relation links a note to a **topic**, **subject**, or another **note**, with a kind:

| Kind | Meaning |
|---|---|
| `also-about` | Generic association (default) |
| `see-also` | Cross-reference |
| `supports` | Evidence or argument for |
| `contrasts-with` | Comparison or disagreement |
| `warning` | Risk or negative effect |
| `background` | Background reading |

There are three ways to add a relation:
- **Note editor → Relations → Add relation**: choose the target type, the target, and the kind. The ↗ icon opens the target, and the ✕ removes the relation.
- **Topic page → Link note to topic**: pick any note and a kind. The relation is stored on that note.
- **Subject overview → Link note to subject**: the same, for a subject.

The **Relations** page (top bar) lists every relation with its source note, kind, target, and target type. Each row has an **Open** link.

---

## 4. Importing content

All imports put notes under a Subject and Topic. Wherever you choose labels, you can pick existing names or type new ones, which are created automatically.

### Import File (.md / .zip)
Click the top bar's **Import file** icon, or a topic's **Import File** button to preselect that subject/topic. Chatalog detects the file type:
- **Chat exports**: any `.zip`, or a `.md` whose front matter has `noteId`, `chatId`, or `chatTitle`. These come from Chatworthy, the Claude Code Exporter, or `claude-export`. They open the **Review Imported Notes** dialog.
- **Any other `.md` / `.markdown`** file opens the **Import Markdown** dialog.

Limits: 100 MB for chat exports.

#### Review Imported Notes (chat exports)
- **Import mode** (multi-turn chats): **One note per turn** or **Single note for entire conversation**. A warning appears when a single note would exceed the 8,000-character embedding limit, because only the first ~8,000 characters are indexed for semantic search.
- **Default Subject / Topic labels** apply to every row you haven't edited by hand.
- Each row has an include checkbox, an editable title, Subject/Topic fields, and a **Dupes** indicator:
  - ✓ no duplicate turns
  - ⚠ some turns already exist in Chatalog
  - ⛔ every turn already exists

  Hover the indicator to see which existing notes match.
- For rows with duplicates, a **Decision** toggle chooses **Keep as new** or **Replace existing**. The preview pane can also resolve duplicates per turn: **Use imported** or **Use existing**.
- **Layout** toggle: **Simple** shows the table only. **Markdown** adds a preview pane. **Full** also shows an **Existing hierarchy** tree, where you can click an existing note to preview it. The dividers between panes can be dragged, and the layout is remembered.
- **Import** creates the notes and opens the first one. If existing notes contain multiple turns that may need manual cleanup, a banner lists them.

#### Import Markdown (plain documents)
- **One note per section**: each `##` heading becomes its own note. This mode is chosen automatically for files over 8,000 characters, and a list shows each section's size with a ⚠ on oversized ones.
- **Single note for entire document**: the note title comes from the first `#` heading, or the file name if there is none.
- Subject and Topic are required. After import, Chatalog opens the topic.

### Import PDF
Click the top bar's **Import PDF** icon, pick a PDF (50 MB max), choose Subject and Topic, and write a **Summary (Markdown)** (required). This creates a PDF note: the summary is the editable body, and the PDF is embedded below it. The PDF's extracted text is searchable.

### Import Google Doc
Click the top bar's **Import Google Doc** icon. Paste a Google Doc URL or file ID; the detected ID is shown. Choose Subject and Topic, which are prefilled when you start from a topic or note page.
- The first time, click **Connect Google Drive**, finish authorization in the new tab, then click **Refresh connection status**.
- Imported Google Doc notes show a PDF rendition and keep the doc's text for search. The note's Markdown body is for **your own notes about the doc**; **Insert doc link** adds a `Source:` link to it.
- Use **Properties → Re-import from Google Doc** when Drive reports the doc has changed.

### Recipes
Recipes enter Chatalog through Chatworthy's **Capture Recipe** button ([Recipe capture](#recipe-capture)) and land in **Recipes / Uncategorized**. A recipe note's preview adds:
- **Source** link, plus **Times** (prep, cook, total)
- Ingredients with **Current / Original / Diff** views. Diff lists **Modified**, **Deleted**, and **Added** ingredients.
- **Edit Ingredients**: edit, delete, add, **Reset** or **Restore** individual ingredients. The original list is always kept.
- **Recipe Properties**: author, yield, cuisine, category, keywords, rating, nutrition, description
- **Cooked history** (expand it): **Cooked this** logs a date, an optional 1–5 rating, and notes. This history feeds the recipe search filters.

---

## 5. Search

Type in the top-bar search box and press Enter. An empty search browses everything in the current scope.

### Query syntax
| Syntax | Effect |
|---|---|
| `lemon chicken` | Words; multiple words are tried as a phrase first, then individually |
| `"black pepper"` | Exact phrase |
| `-garlic` | Exclude a word |
| `pasta OR risotto` (or `\|`) | Match either |
| `is:recipes` / `is:notes` / `is:all` | Set scope |
| `tag:foo` or `tag:foo,bar` | Require tags (all must match) |
| `status:completed` | Filter by note status |
| `after:YYYY-MM-DD` / `before:YYYY-MM-DD` | Content updated within a date range |
| `subject:<name-or-slug>` | Limit to a subject (quote names with spaces: `subject:"Travel Planning"`) |
| `topic:<name-or-slug>` | Limit to a topic (scoped to `subject:` if both are given) |
| `imported:true` | Only notes created by an import |

Operators can appear anywhere in the query and are case-insensitive.

### The Search page
- **Scope**: **All** / **Notes** / **Recipes**. Your last choice is remembered.
- **Mode**:
  - **Auto**: keyword plus semantic, fused.
  - **Hybrid**: results are grouped under **Keyword matches** and **Semantic matches**.
  - **Semantic**: meaning-based only (needs embeddings).
  - **Keyword**: text index only.
- **Limit**: 1–100 results (default 20).
- Each result shows its score, its sources (keyword/semantic), and Subject / Topic. Keyword snippets highlight the matched terms.
- **Explain results**: Hybrid mode only. Shows **Why this matched** on each result, including its keyword and semantic ranks and how they were fused.
- **Keyboard**: ↑/↓ to move through results, Enter to open the selected one.
- **Filter chips** show the active filters. Click ✕ on a chip to remove that filter.

### Add filters…
- **All scopes**:
  - Mode
  - **Min semantic score** (0–1; Semantic/Hybrid only)
  - **Content updated from / to**
  - **Subject** / **Topic**
  - **Imported only**
- **Recipes scope** also adds:
  - **Cuisine**, **Category**, **Keywords**
  - **Include ingredients** / **Exclude ingredients** (comma- or newline-separated)
  - **Max prep / cook / total time**
  - **Cooked**: any, at least once, or never
  - **Cooked within**: 7, 30, 90, or 365 days
  - **Avg rating at least**

**Clear** resets the filters.

### Saved searches
- **Save…** names the current search, including its scope, mode, and filters.
- Choose a saved search from the **Saved Searches** dropdown to rerun it.
- **Manage…** deletes saved searches.

### Developer debug panel
In development builds, **Cmd/Ctrl+Shift+D** (or the debug button) opens **Search Debug**, which shows the request spec and raw response.

See `docs/SEARCH.md` for the behavioral guarantees of search.

---

## 6. Quick Notes

Quick notes are for capturing something fast, before deciding where it belongs.

- **Quick Capture** (top bar):
  - An optional title. If left blank, one is derived from the body.
  - A Markdown body. **Cmd/Ctrl+Enter** saves.
  - **Insert link** (http(s), mailto:, or tel:) and **Insert Image...**
  - An optional Subject/Topic. Leave it **Unfiled** if you like.
- **Quick Notes** page: lists all quick notes. Click one to open it.
- A quick note's page has:
  - **Edit**: title and body, with link and image insertion and image width sizing. **Save** or **Cancel** when done.
  - **Delete**: permanent, after a confirmation.
  - **Convert to Note**: choose a Subject and Topic (existing or new). This creates a full note, deletes the quick note, and opens the new note.

---

## 7. Chatworthy (Chrome extension)

### Install
1. `npm i` at the repo root, then `npm run build` in `packages/chatworthy` (or `npm run watch`).
2. In `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `packages/chatworthy/dist/`.

### Exporting chats
Chatworthy works on **ChatGPT** (`chatgpt.com`, `chat.openai.com`), **Gemini** (`gemini.google.com`), and **Claude** (`claude.ai`).

- A floating **Chatworthy** panel lists every prompt in the conversation. Drag the panel by its title; its position is remembered.
- Messages in the chat are relabeled **Prompt** / **Response**.
- **Click a list item** to scroll to that prompt. The highlighted item follows as you scroll.
- **Checkboxes** select prompts. **All** and **None** select or clear every prompt, including ones the chat has unloaded while scrolling.
- **Export** downloads the selected prompt/response pairs as Markdown with YAML front matter: `<chat-title>-<YYYYMMDDHHmm>.md`. Import that file into Chatalog with **Import file**.
- **Hide List / Show List** collapses the panel; this is remembered.
- On ChatGPT, long chats load lazily. If you see **"⚠ Scroll through the chat to load all prompts"**, scroll through the conversation until **"✓ All N prompts loaded"** appears. Prompts the page has dropped can still be exported, but their responses cannot.

### Review status (needs Chatalog running)
- **Show Status / Hide Status** toggles a status row: chat ID, registry status (UNREGISTERED / UNREVIEWED / REVIEWED), and backend health.
- **Mark Reviewed / Mark Unreviewed** records in Chatalog's chat registry whether you've reviewed this chat.

### Disabling Chatworthy on a page
Set `localStorage['chatworthy:disable'] = '1'` on the site, or add `?chatworthy-disable` to the URL.

### Recipe capture
On a recipe page on **NYT Cooking** (`/recipes/…`) or **Bon Appétit** (`/recipe/…`), a **Capture Recipe** box appears in the top-right. Click it to send the recipe to Chatalog, which must be running on port 8008. The status reads *Imported ✅*, *Already imported (duplicate)*, or an error.

### NYT Recipe Box bulk import (developer command)
Requirements: logged in to NYT Cooking, Chatalog running, and the extension loaded. On the NYT Recipe Box page, open the DevTools console and run:
- `window.__chatworthyBulkImportRecipes({ dryRun: true })`: lists recipe URLs and downloads `nyt-recipe-urls.json`.
- `window.__chatworthyBulkImportRecipes({ concurrency: 2 })`: imports every recipe and downloads `nyt-import-results.json`.
- `window.__chatworthyBulkImportRecipes({ retryFailed: true })`: retries only the failures.

Progress is saved in extension storage (`chatworthy:nytRecipeBoxImport`), so a run can resume.

---

## 8. Claude Code exports

### Claude Code Exporter (web app)
1. Run `npm start` in `packages/claude-code-exporter` (or `npm run dev` without rebuilding the client).
2. Open `http://localhost:9090`.
3. Pick a session from the dropdown, listed by date and title. The full conversation is shown with **Prompt** / **Response** labels.
4. Check prompts (or use **All** / **None**), then click **Export (n)**.

The export downloads `<title>-<date>.md` in the same front-matter format as Chatworthy, ready for **Import file**. The session list refreshes automatically when Claude Code writes new session data.

### `claude-export` CLI and auto-export hook
`claude-export` exports a whole session to Markdown, and an optional Claude Code `Stop` hook re-exports the current session after every response. Common commands:

```bash
claude-export                     # most recent session → ~/Desktop/<title>-<date>.md
claude-export --list              # list sessions
claude-export c8e7e9b7            # session by ID prefix
claude-export -o ~/notes/x.md     # custom output path
claude-export --dir ~/Documents/Projects/chatorama   # latest session for a project
```

Installation, the hook, and how to update them are covered in `claudeTools/SETUP.md` and `docs/claude-export.md`.

---

## 9. Maintenance

Backend maintenance and audit scripts (seeding, embedding backfills, duplicate-turn reports and dedup plans, Chatworthy download audits, backups) are command-line tools for the Chatalog backend. They are documented in `SCRIPTS.md`. Database index migrations are in `MIGRATION_NOTES.md`.
