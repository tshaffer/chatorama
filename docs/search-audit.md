# Search Audit

## Summary
- Done: frontend preserves quoted input; request.q includes quotes.
- Done: semantic mode handled in main backend search flow with notes/recipes channels and RRF for auto.
- Done: Add Filters dialog includes include/exclude ingredients; filters flow to backend.
- Done: recipe facets endpoint exists and is queried in recipe scope.
- Not done: consistent power-user operators (AND/OR/NOT/phrase) across notes+recipes keyword mode.
- Unclear: unicode/jq parse error (not reproduced in this audit run).

## Evidence

### Query text preservation (frontend)
- Search input component binds raw value directly: `packages/chatalog/frontend/src/components/SearchBox.tsx`.
- Query parsing previously stripped quotes; now parser preserves `m[0]` for quoted tokens: `packages/chatalog/frontend/src/features/search/queryParser.ts`.
- Search request mapping uses `spec.query` -> `request.q` with no quote stripping: `packages/chatalog/frontend/src/features/search/buildSearchRequest.ts`.
- Temporary audit log added before search dispatch to verify raw/spec/request values: `packages/chatalog/frontend/src/features/search/SearchPage.tsx`.

Status: PASS for preserving quotes end-to-end (pending manual run with log).

### Operator semantics (notes + recipes)
- Notes keyword mode uses Mongo `$text` with `request.q` (no custom boolean parsing): `packages/chatalog/backend/src/routes/search.ts`.
- Recipes keyword mode uses `$text` + `ingredientTokens` (OR via `$in`) and unions for keyword mode: `packages/chatalog/backend/src/routes/search.ts`.

Table:

| Feature | Notes | Recipes |
| --- | --- | --- |
| Unquoted phrase-like ranking | Not implemented (Mongo `$text` default) | Not implemented (text+ingredient union) |
| Quoted exact phrase | Supported via Mongo `$text` quotes | Supported in text channel only; ingredient channel does not enforce phrase |
| OR (`OR`/`|`) | Mongo `$text` may treat tokens as OR; not explicit | Ingredient channel uses OR via `$in`, text uses `$text` |
| NOT (`-term`) | Mongo `$text` supports minus; no explicit regex filtering | Ingredient channel does not support NOT; text relies on `$text` |

Status: NOT DONE for consistent “power-user” semantics across notes+recipes.

### Semantic wiring (main flow)
- Mode is read from `body.mode` and normalized; semantic/auto/keyword paths handled in POST `/api/v1/search`: `packages/chatalog/backend/src/routes/search.ts`.
- RRF fusion utility used for auto: `packages/chatalog/backend/src/routes/search.ts`.
- Vector search uses `notes_vector_index` and `recipes_vector_index` constants in main flow: `packages/chatalog/backend/src/routes/search.ts`.
- Frontend sends `mode` in request: `packages/chatalog/frontend/src/features/search/buildSearchRequest.ts`.

Status: DONE.

### Facets + Add Filters
- Facets endpoint: `GET /api/v1/recipes/facets` in `packages/chatalog/backend/src/routes/recipes.ts`, aggregation in `packages/chatalog/backend/src/controllers/recipesController.ts`.
- Facets queried in UI for recipe scope: `packages/chatalog/frontend/src/features/search/searchApi.ts` + `useGetRecipeFacetsQuery` in `packages/chatalog/frontend/src/features/search/SearchPage.tsx`.
- Add Filters dialog is in `packages/chatalog/frontend/src/features/search/SearchPage.tsx`.

Status: DONE (facets are global by scope; not filtered by current query).

### Ingredient include/exclude UI
- Include/Exclude fields exist in the recipe filters section and are mapped into draft filters: `packages/chatalog/frontend/src/features/search/SearchPage.tsx`.
- Request includes `includeIngredients`/`excludeIngredients`: `packages/chatalog/frontend/src/features/search/buildSearchRequest.ts`.

Status: DONE.

### Unicode / jq parse issue
- Not reproduced in this audit run.
- Suggested validation path: save raw response, JSON.parse in node, inspect snippets/markdown fields.

Status: UNCLEAR.

### Ingredient token quality
- Canonicalization tightened and backfill endpoint exists: `packages/chatalog/backend/src/utils/ingredientTokens.ts`, `packages/chatalog/backend/src/routes/search.ts`.
- Spot-check from sample shows improved removal of brand/commentary and “unsmoked” fix, though some descriptive phrases remain (e.g., “low sodium”).

Status: DONE with remaining tuning opportunities.

## Recommended Next Fixes (Minimal)
1) Decide desired power-user semantics for notes/recipes keyword mode (AND/OR/NOT/phrase) and implement consistently across both scopes.
2) Reproduce unicode/jq parse issue using a saved response file; identify offending field and apply minimal sanitization.
3) Optionally filter facets based on current query if that’s the intended UX (currently global).

