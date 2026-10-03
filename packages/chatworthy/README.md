# Chatworthy (Dev) — Floating Prompt List

Chrome extension that exports selected turns of an AI chat to Markdown (with YAML front matter) for import into Chatalog, and captures recipes from recipe sites.

Supported chat sites: ChatGPT (`chatgpt.com`, `chat.openai.com`), Gemini (`gemini.google.com`), Claude (`claude.ai`).
Recipe capture: NYT Cooking, Bon Appétit.

Full user documentation: see the **Chatworthy** section of [`USER_MANUAL.md`](../../USER_MANUAL.md).

## Install
1. `npm i`
2. `npm run build` (or `npm run watch`)
3. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

## Use
- Open a chat on a supported site. A draggable **Chatworthy** panel lists every prompt; position and collapsed state are remembered.
- Click a list item to scroll to that prompt. Check prompts (or use **All** / **None**), then click **Export** to download `<chat-title>-<YYYYMMDDHHmm>.md`.
- On ChatGPT, the page keeps only a few exchanges loaded at a time; Chatworthy remembers every prompt it has seen. If the panel says **⚠ Scroll through the chat to load all prompts**, scroll up to the very top until it reports all prompts loaded. A `··· not loaded yet ···` line marks a skipped section. Clicking a prompt the page has dropped scrolls back to it.
- **Show Status** / **Mark Reviewed** use the Chatalog backend (`http://localhost:8008`) to show and set the chat's review status.
- Kill switch: `localStorage['chatworthy:disable'] = '1'` or `?chatworthy-disable` in the URL.

## Notes
- All export work happens locally; files are downloaded via the browser.
- DOM selectors may need tweaks if a chat site's UI changes.

## Recipe capture
On an NYT Cooking (`/recipes/…`) or Bon Appétit (`/recipe/…`) page, click **Capture Recipe** (top-right) to send the recipe to Chatalog. Captured recipes land in **Recipes / Uncategorized**.

## NYT Recipe Box bulk import (dev command)
Prerequisites:
- You are logged into NYT Cooking in the current browser profile.
- Chatalog backend running at `http://localhost:8008`.
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
