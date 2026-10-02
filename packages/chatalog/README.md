# Chatalog

Personal Knowledge System — Chatworthy → Chatalog pipeline.

Full user documentation: [`USER_MANUAL.md`](../../USER_MANUAL.md) at the repo root.

## Structure
- `frontend/` — React + TS bundled by Webpack into `backend/public/`
- `backend/` — Express + Mongo + APIs, serves static app from `backend/public/`
- `shared/` — types and search-spec helpers shared by frontend and backend

## Running
1. Create `backend/.env` from `backend/.env.example` (`MONGO_URI` required; `OPENAI_API_KEY` for semantic search; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for Google Doc import).
2. From the repo root: `npm run build:chatalog`
3. `cd backend && npm run dev`, then open `http://localhost:8008` (or `PORT`).

## Search Operators (Power-User)
Inline syntax supported in the search box:
- `"exact phrase"`, `-exclude`, `a OR b` (or `a | b`)
- `is:notes` / `is:recipes` / `is:all` — set scope
- `tag:<value>` or `tag:a,b` — require tags (AND semantics)
- `status:<value>` — filter by note status
- `after:YYYY-MM-DD` / `before:YYYY-MM-DD` — content-updated date range
- `subject:<name-or-slug>` — matches Subject name/slug
- `topic:<name-or-slug>` — matches Topic name/slug; scoped to Subject if present
- `imported:true` — same as the Imported-only filter

Rules:
- Operators can appear anywhere in the query and are removed from the free-text query.
- Quotes are supported for values with spaces: `subject:"Travel Planning"`, `topic:'New York'`.

See `docs/SEARCH.md` for search behavior guarantees.
