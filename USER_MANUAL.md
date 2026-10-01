# Chatorama User Manual

## Chatworthy — Export ChatGPT Conversations

Exports the current ChatGPT conversation to Markdown or JSON using a compact floating UI (format dropdown + Export button).

### Install
1. `npm i`
2. `npm run build` (or `npm run watch`)
3. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

### Use
- Open a chat at `https://chatgpt.com/` or `https://chat.openai.com/`.
- Bottom-right: choose **Markdown** or **JSON** from the dropdown → click **Export**.
- Keyboard shortcut **Ctrl/Cmd+Shift+E** exports Markdown directly.

Notes:
- The dropdown remembers your last format using `localStorage`.
- All export work happens locally; files are downloaded via the browser.
- DOM selectors may need tweaks if the ChatGPT UI changes.

## Chatalog — Search Operators (Power-User)

Inline filters are supported in the search query string:
- `subject:<name-or-slug>` (matches Subject name/slug)
- `topic:<name-or-slug>` (matches Topic name/slug; scoped to Subject if present)
- `tag:<value>` (adds to tagsAll, AND semantics)
- `imported:true` (same as Imported-only filter)

Rules:
- Operators can appear anywhere in the query.
- Operator tokens are removed from the free-text query before `$text` search.
- Quotes are supported for values with spaces: `subject:"Travel Planning"`, `topic:'New York'`.
