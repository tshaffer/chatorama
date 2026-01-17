# Search Audit

## Summary
- Done: frontend preserves quoted input; request.q includes quotes.
- Done: semantic mode handled in main backend search flow with notes/recipes channels and RRF for auto.
- Done: Add Filters dialog includes include/exclude ingredients; filters flow to backend.
- Done: recipe facets endpoint exists and is queried in recipe scope.
- Done: consistent power-user operators (AND/OR/NOT/phrase) across notes+recipes keyword mode.
- Unclear: unicode/jq parse error (not reproduced in this audit run).

## Evidence

### Query text preservation (frontend)
- Search input component binds raw value directly: `packages/chatalog/frontend/src/components/SearchBox.tsx`.
- Query parsing previously stripped quotes; now parser preserves `m[0]` for quoted tokens: `packages/chatalog/frontend/src/features/search/queryParser.ts`.
- Search request mapping uses `spec.query` -> `request.q` with no quote stripping: `packages/chatalog/frontend/src/features/search/buildSearchRequest.ts`.
- Temporary audit log removed after confirmation (no runtime logging left in `packages/chatalog/frontend/src/features/search/SearchPage.tsx`).

Status: PASS for preserving quotes end-to-end.

### Operator semantics (notes + recipes)
- Shared power-user parser added: `packages/chatalog/backend/src/utils/search/powerQueryParser.ts`.
- Notes keyword mode uses phrase-preferred `$text` union with NOT support (via `-term` in `$search`): `packages/chatalog/backend/src/routes/search.ts`.
- Recipes keyword mode uses phrase-preferred `$text` union + ingredientTokens with AND/OR/NOT semantics: `packages/chatalog/backend/src/routes/search.ts`.

Table:

| Feature | Notes | Recipes |
| --- | --- | --- |
| Unquoted phrase-like ranking | Implemented (phrase channel first, then broad) | Implemented (phrase-first text union + ingredient channel) |
| Quoted exact phrase | Implemented (phrase-only text channel) | Implemented (phrase-only text channel + ingredient phrase tokens) |
| OR (`OR`/`|`) | Implemented (parsed into OR terms) | Implemented (OR terms + ingredient OR filter) |
| NOT (`-term`) | Implemented (negation appended to `$text` search) | Implemented (ingredient `$nor` + text negation) |

Status: DONE for consistent “power-user” semantics across notes+recipes.

Manual tests to run (keyword mode):
1) Notes: `high protein` -> phrase hits first, other matches later.
2) Notes: `"high protein"` -> only exact phrase matches.
3) Notes: `high OR protein` -> broader results.
4) Notes: `protein -high` -> excludes notes containing “high”.
5) Recipes: same 4 tests; verify no “red pepper” for `"black pepper"`.

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
1) Reproduce unicode/jq parse issue using a saved response file; identify offending field and apply minimal sanitization.
2) Optionally filter facets based on current query if that’s the intended UX (currently global).
