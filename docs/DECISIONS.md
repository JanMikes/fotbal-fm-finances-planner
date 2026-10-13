# Architecture decisions (orchestrator, 2026-10-13)

Single source of truth for all implementation agents. Inputs: `prompt.md` (spec, Czech),
`docs/analysis/prototype.md` (prototype = UI source of truth), `docs/analysis/video.md`,
`docs/analysis/infra.md` (lily hosting conventions).

## Product decisions (from the owner)
- **Domain:** `marketing.fotbal-fm.thedevs.cz` (Cloudflare zone `thedevs.cz`; owner adds the CNAME).
- **Access:** no user accounts. Two ways in, both set the same long-lived (1 year) signed httpOnly cookie:
  1. **Magic link** `https://<domain>/k/<APP_ACCESS_TOKEN>` → sets cookie, redirects to `/` (token stripped from URL).
  2. **Password page** `/login` with one shared team password `APP_PASSWORD`.
  Cookie signed with a key derived from `SESSION_SECRET` + hash(`APP_PASSWORD` + `APP_ACCESS_TOKEN`) (HMAC),
  so rotating any of the three logs everyone out.
  All values come from env (Infisical on lily). **The real password/token must never appear in the repo** —
  `compose.yml` uses dev defaults (`dev-password`, `dev-token`, `dev-session-secret-…`).
  "Přihlášen: [jméno]" remains an identity choice stored in localStorage (not auth).
- **No admin PIN** in v1 — anyone with access edits everything.
- **Production starts empty.** No import tool, no demo data. Only structural defaults are seeded by migration:
  boards `tasks` + `print`, task columns (Nápady, K řešení, Probíhá, Ke kontrole, Hotovo),
  print columns (Poptávka, Ve výrobě, Hotovo), the 7 default print types (Letáky, Vizitky, Plakáty,
  Bannery, Roll-upy, Samolepky, Brožury), and the budget singleton row (0/0/7500).
  Local dev MAY have an optional `npm run seed:demo` with the prototype demo data (never run in prod).

## Resolved ambiguities (prototype vs spec)
UI wording/look/behaviour = prototype (`prototype.md`) unless listed here.
1. Tiskoviny columns are fixed: no rename, delete or add (spec).
2. Splátka: `installment_from` auto-set to the current month when a non-zero installment is first saved (prototype),
   PLUS a small "od [měsíc]" month input next to Splátka so it can be corrected.
3. Category card counts follow the spec: number of **people** in the subtree; task count only when the
   category name matches a task category/group.
4. "Odebrat" hidden for the current identity — keep prototype.
5. Duplicate — keep prototype (duplicates the saved version, opens the copy).
6. Items created with a realization date in an already-closed year: keep prototype (not auto-archived).
7. Month abbreviations in the report chart: unique (`Čvn` / `Čvc`).
8. Mobile tree tooltip uses "Před X" / "Za X" for top/bottom-third drops.
9. Fix prototype bugs listed in `prototype.md` (category to top level crash, archived items in print filter counts/month sums, whitespace-only column names).
10. Legacy/dead prototype CSS & features (prototype.md §18) are NOT rebuilt.
11. Multiple top-level roots supported (video).

## UX round (2026-10-13)
12. `src/styles/fm/prototype-app.css` stays **frozen** (verbatim prototype). Changes go into override layers loaded
    after it: `src/styles/app-ux.css` (UX tokens `--c-*`, `--control-*`, `--z-*` + global overrides: focus ring,
    field states, legibility, modal layout, touch minimums, reduced motion; imported last in `globals.css`) and
    `src/components/ui/ui.css` (primitives; imported in `layout.tsx` after `components.css`). Feature CSS overrides
    with ≥ the prototype selector's specificity plus a scope class.
13. Native `<select>`, `type=date` and `type=month` are replaced by the accessible primitives in `src/components/ui`
    (WAI-ARIA APG select-only combobox, date picker dialog; bottom sheets on coarse pointers). No UI library.
14. Native `confirm` / `alert` / `prompt` are **kept** for destructive actions and the new column name (texts are
    correct; e2e flows depend on `dialog` events). Revisit together with an undo toast.
15. Brand trade-off: white text on `--fm-blue` (3.25:1) on `.btn.primary` and `.price` is accepted (avatars no
    longer: their initials come from `inkOn` — white or navy, whichever reaches 4.5:1, so brand-blue avatars have
    navy initials; checked `.chkgrid` chips are navy); it is the only allowlisted axe finding (`expectNoA11yViolations` in `tests/e2e/ui-helpers.ts`).
    Selected calendar days use `--fm-steel` instead (7.3:1). The trade-off covers the resting brand blue only: the
    primary hover (`--c-blue-strong` #0079ab) and the AVC fallback blue pass 4.5:1.
16. Dates are formatted by `src/lib/dates.ts` without `Intl` (identical output in an English browser); absolute dates
    are NBSP-joined (`13. 10. 2026`).

## Technical stack
- **Next.js (latest stable, App Router, TypeScript strict, `output: 'standalone'`)**, React. The app is one
  client-rendered SPA page (`/`) driven by a client store; server = Route Handlers under `/api/*`.
  Use Context7 for current Next.js docs.
- **Styling:** reuse the prototype CSS verbatim (`docs/analysis/prototype-assets/prototype-app.css`, `styles.css`,
  `tokens/*.css` minus `backgrounds.css`), Montserrat from local font files. No Tailwind/UI libs.
- **DB:** PostgreSQL 18 (lily convention). **Drizzle ORM** + drizzle-kit generated SQL migrations committed in
  `drizzle/`. A small standalone `migrate` entry (node script using drizzle-orm migrator) shipped in the image;
  lily runs it as a one-off before rollout (see infra.md §4.2).
  Schema per spec §2 but with **one `org_nodes` table** (`kind 'person'|'unit'`) as the spec recommends.
  Ordering via `sort_order` numeric (midpoint insert; renumber when gaps get too small).
  Integrity rules (spec §6.4) implemented server-side in transactions.
- **Realtime:** SSE endpoint `GET /api/realtime` + Postgres `LISTEN/NOTIFY` (one `NOTIFY app_changes` per
  committed mutation with `{entity, op, id, clientId}`), blue-green safe. Clients patch/refetch state;
  a client ignores events carrying its own `clientId`. Heartbeat every 25 s; auto-reconnect + full refetch on reconnect.
- **API:** REST per spec §7 (minus `/api/import`), JSON, zod validation, all behind the auth cookie (middleware/proxy).
- **Attachments:** stored on a volume at `UPLOAD_DIR` (default `/data/uploads`), served through an authenticated
  route with `Content-Disposition`. Max 25 MB per file (keep under Traefik 60 s read timeout). Links stored as rows.
- **Health:** `GET /api/health` (no auth) → 200 when DB reachable.
- **Testing:** Vitest for pure logic (formatting, budget calc, month lists, sort order, tree ops, report aggregation)
  and API integration tests against a real Postgres (docker compose). Playwright e2e smoke tests (login via
  password + magic link, create/move task, print item, add member). Everything runnable in Docker.
- **Docker:** multi-stage Dockerfile (node LTS alpine), standalone output, non-root, `HEALTHCHECK`-friendly.
  `compose.yml` for local dev: `app` + `postgres` (+ optional `test` profile). `docker compose up` must work
  with zero configuration.
- **CI:** GitHub Actions — lint + typecheck + unit + integration tests on PRs/pushes; on push to `main` build & push
  `ghcr.io/janmikes/fotbal-fm-finances-planner` and trigger the lily deploy via the shared
  `TheDevs-cz/ci` `_ship.yml` workflow (infra.md §5.1). Only GitHub secret: `DEPLOY_WEBHOOK_SECRET`.
- **Slug:** `fotbal-fm-finances-planner` everywhere (lily folder, Infisical project, webhook id, compose project).

## Secrets (names only) — Infisical project `fotbal-fm-finances-planner`, env `prod`, path `/`
`POSTGRES_PASSWORD`, `DATABASE_URL` (if not composed in compose.yaml), `APP_PASSWORD`, `APP_ACCESS_TOKEN`,
`SESSION_SECRET`. (Final list: see infra.md §7 as amended by the infra agent.)
