# Chatalog

Personal Knowledge System — Chatworthy → Chatalog pipeline.

## Structure
- `frontend/` — React + TS bundled by Webpack into `backend/public/`
- `backend/` — Express + Mongo + APIs, serves static app from `backend/public/`

This repo is being built incrementally in small steps.

## Heroku deployment (single dyno)
Build and serve everything from the Express backend.

Required config:
- `MONGO_URI` (Mongo connection string)
- `CHATALOG_ADMIN_TOKEN` (if required by your auth layer)
- `NODE_ENV=production`

Commands:
```bash
heroku create
heroku config:set MONGO_URI=... CHATALOG_ADMIN_TOKEN=... NODE_ENV=production
git push heroku main
heroku logs --tail
```

Notes:
- Frontend build outputs to `backend/public/` via Webpack and is served by Express.
- API routes live under `/api/v1/*`.

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
