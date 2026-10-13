# Fotbal FM — Marketingový plán úkolů

Internal planning tool for the Fotbal FM marketing team: a task kanban („Úkoly"), a print-materials board with
costs and a yearly report („Tiskoviny"), and the team structure with budgets („Struktura týmu").
Changes sync live to everyone who has the page open.

- Spec (Czech): [`prompt.md`](prompt.md) · binding decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Prototype analysis (UI source of truth): [`docs/analysis/prototype.md`](docs/analysis/prototype.md)
- API: [`docs/API.md`](docs/API.md) · frontend conventions: [`docs/FRONTEND-FOUNDATION.md`](docs/FRONTEND-FOUNDATION.md)
- Deployment (lily): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

## Run locally (Docker, zero config)

```bash
docker compose up --build          # postgres → migrate (one-off) → app
open http://localhost:3000         # password: dev-password   or   http://localhost:3000/k/dev-token
```

Host ports can be changed with `APP_PORT` (default 3000) and `POSTGRES_PORT` (default 54329).
Other profiles:

```bash
docker compose --profile dev up dev          # next dev with hot reload on :3001 (bind mount)
docker compose --profile test run --rm test  # unit + integration tests against the compose Postgres
```

Without Docker for the app (Postgres still from compose):

```bash
docker compose up -d postgres
npm ci
npm run db:migrate                 # uses DATABASE_URL or the dev default (localhost:54329)
npm run seed:demo                  # optional prototype demo data — local only, never in production
npm run dev
```

## npm scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js dev server / production build (`output: 'standalone'`) / start |
| `lint` | ESLint |
| `typecheck` | `tsc --noEmit` |
| `test` | Vitest unit tests (pure logic, no DB) |
| `test:integration` | Route handlers against a real Postgres. Needs `DATABASE_URL` to a database whose name contains `test` (it is reset and migrated) |
| `test:e2e` | Playwright (Chromium). Uses `BASE_URL` if set, otherwise starts `next dev` on :3100 |
| `db:generate` | `drizzle-kit generate` — new SQL migration from `src/server/db/schema.ts` into `drizzle/` |
| `db:migrate` | Apply migrations (`node scripts/migrate.mjs`) |
| `build:migrate` | Bundle the migration runner (esbuild) into `dist/migrate.mjs` (used by the Dockerfile) |
| `seed:demo` | Load the prototype demo data (local dev only) |

## Environment variables (names only)

| Name | Notes |
|---|---|
| `DATABASE_URL` | Postgres 18 connection string |
| `APP_PASSWORD` | Shared team password for `/login` |
| `APP_ACCESS_TOKEN` | Magic-link token: `/k/<token>` |
| `SESSION_SECRET` | HMAC key for the session cookie (≥ 16 chars; rotating it logs everyone out) |
| `UPLOAD_DIR` | Attachment storage directory (default `/data/uploads`) |

In production the app refuses to start when `DATABASE_URL`, `APP_PASSWORD`, `APP_ACCESS_TOKEN` or `SESSION_SECRET`
is missing. Outside production dev defaults are used. See `.env.example`. Never commit real values.

## Architecture

- **Next.js 16 (App Router, TypeScript strict)**, one client-rendered SPA page (`/`) + REST route handlers under
  `/api/*`. Styling = the prototype CSS verbatim (`src/styles/`), Montserrat from `public/fonts`.
- **Auth:** `src/proxy.ts` guards everything except `/login`, `/k/<token>`, `/api/health`, `/api/auth/login` and
  static assets. Both the magic link and the password set a 1-year signed httpOnly cookie (`fmp_session`).
- **DB:** PostgreSQL 18 via Drizzle ORM. Schema `src/server/db/schema.ts` (single `org_nodes` tree table),
  SQL migrations in `drizzle/` (the structural defaults are seeded by migration `0001`). Business rules live in
  `src/server/services/*` and run in transactions.
- **Realtime:** every mutation does `pg_notify('app_changes', …)` in its transaction; each app instance keeps one
  `LISTEN` connection and fans events out to SSE clients on `GET /api/realtime`. Clients refetch `/api/state`.
- **Attachments:** files on the `UPLOAD_DIR` volume (random names), served via an authenticated route.
- **Docker:** multi-stage `Dockerfile` (node 24 alpine) → `node server.js` on port 3000 as uid 1001;
  `node migrate.mjs` (bundled runner + `drizzle/`) runs migrations as a one-off. Health: `GET /api/health`.

```
src/
  app/            pages (/, /login), magic link /k/[token], API route handlers
  components/     UI (Phase 1: app-shell placeholder)
  lib/            shared domain code: types, constants, formatting, filters, tree, budget, report, sort order,
                  API client, client store (lib/store)
  server/         db (schema, client), auth, services (business rules), realtime bus, http helpers
  styles/         prototype CSS + design tokens
drizzle/          SQL migrations (committed)
scripts/          migrate.mjs, seed-demo.ts
tests/            unit/, integration/, e2e/
```
