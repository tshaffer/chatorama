
# Chatworthy (Dev) — Floating UI, No Popup

Exports the current ChatGPT conversation to Markdown or JSON using a compact floating UI (format dropdown + Export button).

## Install
1. `npm i`
2. `npm run build` (or `npm run watch`)
3. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

## Use
- Open a chat at `https://chatgpt.com/` or `https://chat.openai.com/`.
- Bottom-right: choose **Markdown** or **JSON** from the dropdown → click **Export**.
- Keyboard shortcut **Ctrl/Cmd+Shift+E** exports Markdown directly.

## Notes
- The dropdown remembers your last format using `localStorage`.
- All export work happens locally; files are downloaded via the browser.
- DOM selectors may need tweaks if the ChatGPT UI changes.

## NYT Recipe Box bulk import (dev command)
Prerequisites:
- You are logged into NYT Cooking in the current browser profile.
- Chatalog backend running at `http://localhost:8080`.
- Chatworthy extension loaded from `dist/`.

How to run:
1. Open the NYT Recipe Box page in the same profile.
2. Open the DevTools console.
3. Run:
   `window.__chatworthyBulkImportRecipes({ dryRun: true })`
4. To import:
   `window.__chatworthyBulkImportRecipes({ concurrency: 2 })`

Results + resume:
- Progress stored in extension storage under key `chatworthy:nytRecipeBoxImport`.
- Downloads: `nyt-recipe-urls.json` (dry run) and `nyt-import-results.json` (after import).
- To retry failed only:
  `window.__chatworthyBulkImportRecipes({ retryFailed: true })`
