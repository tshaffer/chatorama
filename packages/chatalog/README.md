# Chatalog

Personal Knowledge System — Chatworthy → Chatalog pipeline.

## Structure
- `frontend/` — React + TS bundled by Webpack into `backend/public/`
- `backend/` — Express + Mongo + APIs, serves static app from `backend/public/`

This repo is being built incrementally in small steps.

## Search Operators (Power-User)
Inline filters are supported in the search query string:
- `subject:<name-or-slug>` (matches Subject name/slug)
- `topic:<name-or-slug>` (matches Topic name/slug; scoped to Subject if present)
- `tag:<value>` (adds to tagsAll, AND semantics)
- `imported:true` (same as Imported-only filter)

Rules:
- Operators can appear anywhere in the query.
- Operator tokens are removed from the free-text query before `$text` search.
- Quotes are supported for values with spaces: `subject:"Travel Planning"`, `topic:'New York'`.
