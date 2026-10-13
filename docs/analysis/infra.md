# Infrastructure analysis: running fotbal-fm-finances-planner on lily

> Scope: how this app (Next.js/React + Postgres + realtime + file attachments, see `prompt.md`) gets
> built by GitHub Actions and deployed to **lily** (`lily.srv.thedevs.cz`, Hetzner, IP `91.98.188.211`).
> Sources: the infra repo `TheDevs-cz/lily.srv` (local `~/www/lily.srv`: `CLAUDE.md`, `apps/README.md`,
> `apps/.template/`, `deploy/{README.md,add-app.sh,lib.sh,reconcile.manifest,RECONCILE.md}`,
> `docs/{secrets.md,decisions.md,journal.md,backlog.md}`, `infra/{traefik,webhook,backups,snippets}`),
> the shared CI repo `TheDevs-cz/ci` (local `~/www/thedevs-ci`), and sibling app repos
> (`~/www/mfkfm` = fotbal-fm.cz, `~/www/mfkfm-archiv`, `~/www/fotbal-fm-mobile-app`).
> Status as of 2026-10-13. **This file is in a public repo: it names secrets but holds no values.**

---

## 1. TL;DR

- **One slug everywhere:** `fotbal-fm-finances-planner` is the `apps/<slug>/` directory in lily.srv,
  `/srv/<slug>/` on the box, the compose project, the webhook hook id, and the Infisical project name.
- **Production compose + deploy script live in the infra repo** (`lily.srv/apps/<slug>/`), not in this
  repo. This repo ships only the **image** (`ghcr.io/janmikes/fotbal-fm-finances-planner`) and a local-dev
  `compose.yml`.
- **CI:** push to `main` calls the shared reusable workflow `TheDevs-cz/ci/.github/workflows/_ship.yml@v1`.
  It builds the image, pushes it to GHCR (`sha-<full sha>`, `main`, `latest`), then HMAC-POSTs
  `https://deploy.lily.srv.thedevs.cz/hooks/<slug>`. The **only** GitHub secret is `DEPLOY_WEBHOOK_SECRET`.
  CI has no SSH, no Watchtower, and no secrets beyond that one.
- **On the box:** the webhook receiver (non-root) writes a spool job. The root systemd executor runs
  `/srv/<slug>/deploy.sh <tag>`, which goes through Contract G: `dump_secrets` (Infisical → `.env`) →
  pull → migrate → zero-downtime blue-green `rollout`.
- **Secrets:** one Infisical project per app (`fotbal-fm-finances-planner`, env `prod`, path `/`). They
  are read at deploy time by the box machine identity `lily-deploy`. The webhook HMAC secret is
  **box-only** (`/srv/webhook/secrets.env`) and is mirrored into the GitHub secret.
- **DB:** a **per-app Postgres** container in the app's own stack (D13). There is no shared cluster.
  Backups are automatic via labels: `pg_dump` twice a day → Hetzner S3, 7-day retention, weekly restore
  test.
- **Uploads:** an **external named Docker volume**, backed up by the `backup.files.*` labels (Contract H
  / D41). No S3/MinIO is needed. Per-app MinIO exists elsewhere (wboost) but would be overkill here.
- **Realtime:** Traefik v3 passes **SSE and WebSockets without special config** (Mercure SSE runs in
  production on MSP and peon). Recommendation: SSE + Postgres `LISTEN/NOTIFY` fan-out, on a dedicated
  router **without** the retry middleware.
- **Edge:** Traefik with the `public-edge@file` chain (CrowdSec + security headers + rate limit
  100 r/s avg / 200 burst per IP). TLS uses `le` (HTTP-01) for `*.fotbal-fm.cz` (zone at **Webglobe**,
  manual DNS) or `le-dns` (DNS-01, Cloudflare) for `*.thedevs.cz`.

---

## 2. Conventions (what every lily app follows)

### 2.1 Repo split and deploy paths
| Change | Path | Who applies |
|---|---|---|
| App code (this repo) | push `main` → `_ship.yml@v1` → GHCR → HMAC webhook → executor runs `/srv/<slug>/deploy.sh <tag>` | fully automatic (D23) |
| Infra/app config (`lily.srv/apps/<slug>/**`) | push `main` of lily.srv → D36 pull reconciler rsyncs `apps/<slug>/` → `/srv/<slug>/` (needs a row in `deploy/reconcile.manifest`). **Class D = deliver only**: it never runs `deploy.sh` and never runs compose. Changes take effect on the app's **next** D23 deploy. Exception: `apps/<slug>/cron.d/<slug>` goes live on push. | automatic delivery; activation = next app deploy |
| Webhook hooks (`lily.srv/infra/webhook/deploy.sh` `APPS=()`) | class A: the reconciler runs `/srv/webhook/deploy.sh` on push. It **dies if any listed app has no secret** in `/srv/webhook/secrets.env`, so seed the secret first. | automatic, but ordering matters |

Note: `apps/README.md` still says "config path is operator-driven, no infra-repo CI". That is **stale**.
`CLAUDE.md` and `deploy/RECONCILE.md` (D36/D38) are current. `CLAUDE.md`'s onboarding table also says the
webhook secret goes into Infisical. The code (`add-app.sh`, `infra/webhook/deploy.sh`) and every
journal entry say **box-only `/srv/webhook/secrets.env`**. The code wins.

### 2.2 Compose hard rules (apps/.template, D2/D7/D8/D9/D13/D26/D58)
- **No `container_name`** (blue-green scales to 2N) and **no published `ports:`** (only Traefik is
  public; reach services over docker networks).
- **`mem_limit` + `mem_reservation` + `pids_limit` on every service.** The box has no swap, so an
  unbounded container can OOM the host.
- `security_opt: [no-new-privileges:true]`, `restart: always`, `stop_grace_period: 30s`.
- **A Docker `HEALTHCHECK` on every rolled service is mandatory.** `lib.sh` refuses to roll a service
  without one. Probe **`127.0.0.1`, never `localhost`**. `localhost` resolves to `::1`, a Next.js server
  bound to IPv4 never answers it, the container stays unhealthy, and Traefik silently drops it. This
  "D42 IPv6 trap" has bitten three times.
- Image line: `ghcr.io/<owner>/<app>:${IMAGE_TAG:-main}`. Owner and app are fixed and only the tag
  varies, so a leaked webhook secret can only roll *this* image.
- Networks: external `traefik` (routing), per-stack `internal` (db), external `monitoring` (exporters /
  metrics).
- **Stateful images are digest-pinned** (`postgres:18.4-alpine@sha256:…`). Never use a floating tag:
  in 2026-09 a re-pulled floating tag re-created four apps' databases.
- Persistent data uses **`external: true` named volumes** called `<slug>_<name>`, created idempotently
  in `deploy.sh` (`docker volume create`). That way `compose down -v` can never wipe them.
- Labels: `app=<name>` (Loki label), `blackbox.url=https://<domain>/<2xx path>` (D26, public
  reachability + TLS probe, **mandatory** for public apps), and `backup.*` (Contract H).
- One-off `compose run` containers must pass `--no-deps --label traefik.enable=false` (peon pattern).
  Otherwise Traefik adds the migration container to the load balancer, and `run` re-creates
  dependencies.

### 2.3 Registry and tags
- GHCR, image `ghcr.io/janmikes/fotbal-fm-finances-planner` (**must be lowercase**: the `_ship.yml`
  default `ghcr.io/${{ github.repository }}` keeps the `JanMikes` casing, so set `image:` explicitly).
- `_build.yml` pushes `sha-<full-git-sha>` (immutable), `main` (branch), and `latest` (default branch),
  plus a `:buildcache` registry cache. Platform is `linux/amd64` only.
- Deployed tag: `main` by default. `deploy_sha: true` deploys the immutable `sha-…` tag, which is what
  newer apps (boliga) use. `deploy.sh` takes `${1:-main}`.
- **The package must be public.** The sandboxed executor (`ProtectHome=true`) cannot read
  `/root/.docker`. A public repo's package is normally public; check this after the first push. If it is
  private, either flip it to public or use the D57 box pull credential
  (`DOCKER_CONFIG=/srv/deploy/docker pull_image web`).

### 2.4 Secrets (D9, `docs/secrets.md`)
- Infisical at `https://infisical.thedevs.cz`. The admin UI is WireGuard/VPN-gated.
- One project per app, **name == slug**, env **`prod`**, root path `/`. `dump_secrets <slug>` resolves
  the project by name, runs `infisical export --env=prod --format=dotenv` into `/srv/<slug>/.env`
  (0600), and de-templates any `*.template` files. You can pin the project with `INFISICAL_PROJECT_ID`.
- The machine identity **`lily-deploy`** (universal auth, creds in box-only
  `/srv/infisical/machine-identity.env`) must be a **member** of the project. House pattern: the project
  is created headlessly **by `lily-deploy` itself** (`POST /api/v2/workspace`), so the identity is
  project admin from birth. The most-missed step is forgetting the membership.
- Compose consumes values either via `env_file: .env` or via `${KEY:?msg}` interpolation per service
  (fotbal-fm style, least privilege). **A key must exist in Infisical before a compose line referencing
  it with `:?` is deployed**, or the whole deploy fails.
- No agent, no `infisical run`, no runtime SDK: secrets are rendered once per deploy. Adding or
  changing a secret takes effect on the next deploy.
- `infisical secrets set` (CLI 0.43.x) **echoes values**, so always redirect it to `/dev/null`.

### 2.5 Monitoring, logging, alerting (automatic, D26)
- Container health: the `lily-container-health` cron watches every healthchecked container and raises
  `ContainerUnhealthy`.
- Public probe: the `blackbox.url` label is autodiscovered by Alloy (reachability + TLS-cert, every
  30 s), so no central config is needed. **Point it at a path that returns 2xx without the secret
  token**, e.g. `/api/health`.
- Logs: container stdout/stderr → Alloy → Loki (30-day retention), labelled by `app`. Deploy logs go to
  `/var/log/lily/deploy.log` (Loki `app="deploy"`). Structured JSON to stdout is ideal.
- Metrics (optional, Contract F): labels `metrics.scrape=true`, `metrics.port`, `metrics.path`, plus the
  `monitoring` network. The `db-exporter` sidecar gives Postgres metrics and alerts (`pg_up`).
- Traces: Traefik roots a trace for every request (OTLP → Alloy → Tempo). An app can continue the trace
  via `traceparent`.
- Deploy result in CI (D27): with `await_deploy: true` the CI run goes red or green on the real deploy.
  That **requires** a per-app fine-grained PAT (only this repo, **Commit statuses: read & write**)
  seeded on the box in `/srv/deploy/checks.env`. Until then use `await_deploy: false`, otherwise the run
  times out red after 300 s.

### 2.6 Backups (Contract H, `infra/backups/README.md`)
- Postgres: the `backup.pg=true` labels on `db` are autodiscovered. `pg_dump -Fc --compress=zstd:long` +
  `pg_dumpall --globals-only` run at **06:30 and 18:30 UTC** → `s3:<bucket>/<app>/` (Hetzner object
  storage), 7-day retention. A sanity floor and a 50 % shrink guard apply. **A weekly restore test**
  runs (Sun 04:30 UTC). Failures send email and stop the dead-man ping.
- Files: `backup.files=true` + `backup.files.paths=<in-container paths>` on the container that mounts the
  data. It is streamed as `docker exec … tar` → `<app>-files-<ts>.tar.gz`. Use `backup.files.floor=0`
  while the uploads dir may be empty (D63).
- **Gotcha in `infra/snippets/postgres.yaml`:** it sets `backup.pg.superuser=postgres` while
  `POSTGRES_USER=<app>`. With that env the bootstrap role **is** the superuser and no `postgres` role
  exists. Every real app (sendvery, boliga-api, umami, tipovacka) sets `superuser=<app user>`; do the
  same.

### 2.7 Realtime through the proxy (WebSocket / SSE)
- Traefik v3.7 (`infra/traefik/traefik.yml`): **no `respondingTimeouts` override**, so the v3 defaults
  apply: `readTimeout` **60 s** (reading the *request incl. body*), `writeTimeout` 0, `idleTimeout`
  180 s. WebSocket upgrade and SSE streaming need **no labels or middleware**. There is no
  `compress`/`buffering` middleware in `public-edge`, so SSE frames are not buffered. Production proof:
  Mercure SSE hubs for `myspeedpuzzling` and `peon` (`apps/peon/compose.yaml`, router
  `peon-mercure` = `Host(...) && PathPrefix(/.well-known/mercure)`, `priority: 50`,
  `public-edge@file` only, **no retry middleware**).
- Consequences for this app:
  - **Uploads must finish within 60 s** of request read, or Traefik cuts them. Cap the attachment size
    (for example 20–25 MB) and keep the one-off `/api/import` payload reasonable.
  - **Blue-green overlap:** during every deploy, old and new `web` containers run side by side for
    roughly 10 s, and SSE clients may be connected to either. An in-process event bus would lose events
    across containers, so **fan out through Postgres `LISTEN/NOTIFY`**: every instance LISTENs, every
    write NOTIFYs. This also makes `REPLICAS>1` safe later.
  - The old container is stopped with `docker stop` (grace = `stop_grace_period`). The app should
    **close SSE streams on SIGTERM**, and the client (`EventSource`) must **refetch `/api/state` on
    reconnect**.
  - Send an SSE heartbeat comment every ~20–30 s. Set `Cache-Control: no-cache, no-transform`.
  - **CrowdSec:** many 4xx responses from one IP trip `http-probing`, which yields a `captcha` decision.
    For an `EventSource` client a captcha is effectively a hard 403 (D53). Do not let a client with a
    wrong or expired token reconnect in a tight 401 loop: back off, or stop reconnecting on 401/403.
  - A Traefik restart uses `up -d -t 2` because long SSE streams would otherwise stretch the stop. The
    operator handles this; it affects nothing in the app.

### 2.8 Domains, DNS, TLS
- Box IP `91.98.188.211`.
- **`fotbal-fm.cz` zone is at Webglobe** (`ns1/ns2.webglobe.cz`). The box's Cloudflare token cannot do
  DNS-01 there, so routers use **`le` (HTTP-01)** and the A/CNAME record **must point at the box before
  the first deploy**. Precedent: `treneri.fotbal-fm.cz`, `admin.fotbal-fm.cz`, `static.fotbal-fm.cz`.
- **`thedevs.cz` zone is on Cloudflare**, so routers use **`le-dns` (DNS-01)**. The cert issues
  regardless of where the A record points. Precedent: `api.fotbal-fm.thedevs.cz`,
  `db-admin.fotbal-fm.thedevs.cz`. The zone-wide wildcard `*.thedevs.cz` still points at **spare**
  (backlog item), and `*.fotbal-fm.thedevs.cz` would not even match it because
  `api.fotbal-fm.thedevs.cz` exists. So an **explicit** `CNAME → lily.srv.thedevs.cz` is needed.
- Pre-DNS validation ("staged-first", D29/D34): a box-only, gitignored `compose.override.yaml` adds a
  stage router on `<slug>-stg.lily.srv.thedevs.cz` (covered by the `le-dns` wildcard
  `*.lily.srv.thedevs.cz`). This lets the stack be validated before the real DNS exists.

| Option | Resolver | DNS action (human) | Notes |
|---|---|---|---|
| **`finance.fotbal-fm.cz`** (or `planovac.fotbal-fm.cz`) | `le` HTTP-01 | A `→ 91.98.188.211` (or CNAME `lily.srv.thedevs.cz`) at **Webglobe**, before first deploy | Club-branded, matches `treneri.fotbal-fm.cz`. **Recommended** if Webglobe access is available. |
| `finance.fotbal-fm.thedevs.cz` | `le-dns` DNS-01 | explicit CNAME `→ lily.srv.thedevs.cz` in **Cloudflare** | Cert independent of DNS timing; agency-branded. |

The final hostname is the owner's choice. Below, `<DOMAIN>` is used and the example assumes
`finance.fotbal-fm.cz`.

---

## 3. Recommended architecture for this app on lily

```
browser ──https──▶ Traefik (public-edge: CrowdSec → sec-headers → rate-limit)
                    ├─ router <slug>-web      Host(<DOMAIN>)                          + retry ─▶ web:3000
                    └─ router <slug>-realtime Host(<DOMAIN>) && PathPrefix(/api/realtime) (no retry) ─▶ web:3000
web  (Next.js standalone, node:24-alpine, blue-green, REPLICAS=1)
  ├─ Postgres  db:5432       (internal net; LISTEN/NOTIFY drives SSE fan-out)
  └─ /app/data/uploads       (external volume <slug>_uploads; streamed by /api/attachments/:id)
db-exporter ─▶ monitoring net (Prometheus)
```

- **Supabase is not used.** Its roles map onto plain Postgres (data), a volume (Storage), and SSE +
  `LISTEN/NOTIFY` (Realtime). A self-hosted Supabase would be ~10 containers to operate on a box that
  favours lean per-app stacks.
- **Access control** (per `prompt.md`): a secret-link token or a shared team password, checked
  server-side and exchanged for an HttpOnly cookie, plus an optional admin PIN. Serve attachments
  **through the app** (`/api/attachments/:id`, auth-checked), not from a static public URL.
- **Migrations:** run explicitly **before** `rollout` (§4.1 `deploy.sh`). They must be
  **backward-compatible across one deploy**, because old and new containers overlap. Next.js
  `output: 'standalone'` strips anything not traced, so ship the migration runner and its SQL files in
  the runtime image deliberately (for example a `scripts/migrate.mjs` using `pg`, copied into the
  runner stage).
- **Health endpoint:** `GET /api/health` returns 200, is cheap, needs no auth and never touches the DB.
  The Docker healthcheck, the Traefik LB check and the blackbox probe all use it. Optional (D75 style):
  make it a readiness latch that returns 503 until the DB has answered once after boot, then stays
  liveness-only.
- **Uploads dir ownership:** Next standalone runs as a non-root user (for example `nextjs`, uid 1001).
  Create `/app/data/uploads` **in the image**, owned by that user. Docker copies the image dir's
  ownership into an **empty** named volume on first mount; otherwise the volume is root-owned and
  writes fail.
- `HOSTNAME=0.0.0.0`, `PORT=3000` in the image (fotbal-fm web Dockerfile precedent).
- Only non-secret build args. `NEXT_PUBLIC_*` values are baked into the bundle.

---

## 4. Files to create in `lily.srv` (an agent can write these; pushing them is gated, see §6)

### 4.1 `apps/fotbal-fm-finances-planner/compose.yaml`
```yaml
# =============================================================================
# apps/fotbal-fm-finances-planner/compose.yaml — Fotbal FM marketing/finance planner
# =============================================================================
# Next.js (standalone) web + its own Postgres 18 (D13) + uploads volume.
# Repo: JanMikes/fotbal-fm-finances-planner (public) → ghcr.io/janmikes/fotbal-fm-finances-planner.
# Realtime = SSE on /api/realtime with Postgres LISTEN/NOTIFY fan-out (blue-green safe).
# HARD RULES (D2/D7/D8/D9/D13/D26/D58): no container_name, no ports, mem_limit everywhere,
# healthchecks on 127.0.0.1 (D42 IPv6 trap), digest-pinned stateful images, external volumes.
# Secrets: /srv/fotbal-fm-finances-planner/.env rendered by dump_secrets (D9); interpolated
# per service (${KEY:?}) — no env_file.
# TLS: <DOMAIN> on the Webglobe fotbal-fm.cz zone → `le` HTTP-01 (DNS must point here first).
# =============================================================================

services:
  web:
    image: ghcr.io/janmikes/fotbal-fm-finances-planner:${IMAGE_TAG:-main}
    restart: always
    environment:
      NODE_ENV: "production"
      APP_URL: "https://<DOMAIN>"
      DATABASE_URL: "postgresql://planner:${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}@db:5432/planner?sslmode=disable"
      UPLOADS_DIR: "/app/data/uploads"
      MAX_UPLOAD_BYTES: "26214400"            # 25 MB — Traefik readTimeout is 60 s (defaults)
      NODE_OPTIONS: "--max-old-space-size=384"
      ACCESS_TOKEN: "${ACCESS_TOKEN:?ACCESS_TOKEN must be set in .env}"        # secret-link token / team password
      SESSION_SECRET: "${SESSION_SECRET:?SESSION_SECRET must be set in .env}"  # signs the access cookie
      ADMIN_PIN: "${ADMIN_PIN:-}"                                             # optional (prompt.md §1)
    mem_limit: 512m
    mem_reservation: 128m
    pids_limit: 256
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 3
      start_period: 30s
      start_interval: 2s
    stop_grace_period: 30s
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - uploads:/app/data/uploads
    networks:
      - traefik
      - internal
    labels:
      traefik.enable: "true"
      # ---- main router -------------------------------------------------------
      traefik.http.routers.fotbal-fm-finances-planner-web.rule: "Host(`<DOMAIN>`)"
      traefik.http.routers.fotbal-fm-finances-planner-web.entrypoints: "websecure"
      traefik.http.routers.fotbal-fm-finances-planner-web.tls: "true"
      traefik.http.routers.fotbal-fm-finances-planner-web.tls.certresolver: "le"     # le-dns if *.thedevs.cz
      traefik.http.routers.fotbal-fm-finances-planner-web.middlewares: "public-edge@file,fotbal-fm-finances-planner-retry"
      traefik.http.routers.fotbal-fm-finances-planner-web.service: "fotbal-fm-finances-planner-web"
      # ---- realtime (SSE) router: same service, NO retry middleware (peon-mercure precedent)
      traefik.http.routers.fotbal-fm-finances-planner-rt.rule: "Host(`<DOMAIN>`) && PathPrefix(`/api/realtime`)"
      traefik.http.routers.fotbal-fm-finances-planner-rt.priority: "50"
      traefik.http.routers.fotbal-fm-finances-planner-rt.entrypoints: "websecure"
      traefik.http.routers.fotbal-fm-finances-planner-rt.tls: "true"
      traefik.http.routers.fotbal-fm-finances-planner-rt.tls.certresolver: "le"
      traefik.http.routers.fotbal-fm-finances-planner-rt.middlewares: "public-edge@file"
      traefik.http.routers.fotbal-fm-finances-planner-rt.service: "fotbal-fm-finances-planner-web"
      # ---- service / LB ------------------------------------------------------
      traefik.http.services.fotbal-fm-finances-planner-web.loadbalancer.server.port: "3000"
      # Second rollout gate (apps/README "HEALTHCHECK is mandatory"). /api/health must be cheap
      # (no DB). D75 alternative for a single replica: drop these three lines and rely on a
      # readiness-latch Docker healthcheck alone.
      traefik.http.services.fotbal-fm-finances-planner-web.loadbalancer.healthcheck.path: "/api/health"
      traefik.http.services.fotbal-fm-finances-planner-web.loadbalancer.healthcheck.interval: "10s"
      traefik.http.services.fotbal-fm-finances-planner-web.loadbalancer.healthcheck.timeout: "5s"
      traefik.http.middlewares.fotbal-fm-finances-planner-retry.retry.attempts: "3"
      traefik.http.middlewares.fotbal-fm-finances-planner-retry.retry.initialInterval: "2s"
      # ---- observability (D26) ----------------------------------------------
      app: "fotbal-fm-finances-planner"
      blackbox.url: "https://<DOMAIN>/api/health"
      # ---- Contract H: uploads tarball (D41/D63) ------------------------------
      backup.files: "true"
      backup.files.paths: "/app/data/uploads"
      backup.files.name: "fotbal-fm-finances-planner"
      backup.files.floor: "0"                 # empty volume is legitimate at first

  db:
    # D58 digest pin — the snippet's 18.4-alpine build already on the box (umami-db, boliga-api);
    # reusing it pulls nothing new. Re-check with `docker buildx imagetools inspect` before first use.
    image: postgres:18.4-alpine@sha256:1b1689b20d16a014a3d195653381cf2caa75a41a92d93b255a9d6ea29fd353aa
    restart: always
    environment:
      POSTGRES_USER: planner
      POSTGRES_DB: planner
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}
      POSTGRES_INITDB_ARGS: "--data-checksums"
    command: ["postgres", "-c", "shared_buffers=128MB", "-c", "effective_cache_size=384MB",
              "-c", "max_connections=100", "-c", "work_mem=8MB"]
    mem_limit: 512m
    mem_reservation: 128m
    pids_limit: 256
    security_opt:
      - no-new-privileges:true
    volumes:
      - pgdata:/var/lib/postgresql              # PG18: mount the parent dir, NOT .../data
    networks:
      - internal                                # NEVER traefik
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U planner -d planner"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 15s
    labels:
      traefik.enable: "false"
      backup.pg: "true"
      backup.pg.db: "planner"
      backup.pg.user: "planner"
      backup.pg.superuser: "planner"            # bootstrap role IS the superuser (no 'postgres' role)
      backup.pg.name: "fotbal-fm-finances-planner"
      app: "fotbal-fm-finances-planner-db"

  db-exporter:
    image: quay.io/prometheuscommunity/postgres-exporter:v0.18.1
    restart: always
    environment:
      DATA_SOURCE_NAME: "postgresql://planner:${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}@db:5432/planner?sslmode=disable"
    mem_limit: 64m
    mem_reservation: 16m
    pids_limit: 64
    security_opt:
      - no-new-privileges:true
    cap_drop: [ALL]
    read_only: true
    depends_on:
      db:
        condition: service_healthy
    networks:
      - internal
      - monitoring
    labels:
      traefik.enable: "false"
      metrics.scrape: "true"
      metrics.port: "9187"
      metrics.path: "/metrics"
      app: "fotbal-fm-finances-planner-db"

  # Optional: public Adminer like most apps (db-admin.<...>, adminer:5.4.1, ADMINER_DEFAULT_SERVER=db,
  # traefik+internal nets, mem_limit 128m, its own blackbox.url). Omitted by default — decide with owner.

networks:
  traefik:
    external: true
  monitoring:
    external: true
  internal:
    driver: bridge

volumes:
  pgdata:
    external: true
    name: fotbal-fm-finances-planner_pgdata
  uploads:
    external: true
    name: fotbal-fm-finances-planner_uploads
```
(Generate `POSTGRES_PASSWORD` as **hex** so it never needs URL-encoding inside `DATABASE_URL`.)

### 4.2 `apps/fotbal-fm-finances-planner/deploy.sh` (git mode **100755**)
```bash
#!/usr/bin/env bash
# apps/fotbal-fm-finances-planner/deploy.sh — per-app, NON-reusable deploy (D8).
# Run by the D23 executor from /srv/fotbal-fm-finances-planner/ as `./deploy.sh <tag>`.
set -euo pipefail

APP="fotbal-fm-finances-planner"
REPLICAS=1
IMAGE_TAG="${1:-main}"
export REPLICAS
export IMAGE_TAG

cd "$(dirname "$0")"
# shellcheck source=/dev/null
source /srv/deploy/lib.sh        # Contract G primitives

echo "== deploy ${APP}: tag=${IMAGE_TAG}, replicas=${REPLICAS}"

# 0. external data volumes (idempotent)
for v in pgdata uploads; do
  docker volume create "${APP}_${v}" >/dev/null
done

# 1. secrets from Infisical (D9) + fail fast on missing required keys (boliga pattern)
dump_secrets "$APP"
for key in POSTGRES_PASSWORD ACCESS_TOKEN SESSION_SECRET; do
  grep -qE "^${key}=" .env || { echo "deploy: FATAL: ${key} missing from Infisical '${APP}' prod" >&2; exit 1; }
done

# 2. pull the app image (public ghcr package; if private: DOCKER_CONFIG=/srv/deploy/docker pull_image web)
pull_image web

# 3. stateful / aux services — `up -d` is a no-op when unchanged
docker compose up -d db db-exporter

# 4. migrations BEFORE rollout (peon pattern: --no-deps per D58, no Traefik routing of the one-off)
docker compose run --rm --no-deps --label traefik.enable=false web node scripts/migrate.mjs

# 5. zero-downtime blue-green cutover
rollout web

# 6. versioned host cron (D30) — no-op unless cron.d/<APP> exists
install_cron "$APP"

echo "== deploy ${APP}: done"
```
(Replace `node scripts/migrate.mjs` with whatever migration entrypoint the app ships. It must exist in
the runtime image.)

### 4.3 `apps/fotbal-fm-finances-planner/.gitignore`
```
# Box-only, never committed (D9 / D23)
.env
*.local.env
deploy-webhook.local.env
compose.override.yaml
compose.validate.yaml
```

### 4.4 `deploy/reconcile.manifest`: add a class-D row (alongside the other app rows)
```
fotbal-fm-finances-planner | D | apps/fotbal-fm-finances-planner | /srv/fotbal-fm-finances-planner | app-config | compose.yaml
```
(Add a `fotbal-fm-finances-planner-cron | C | apps/.../cron.d/fotbal-fm-finances-planner | /etc/cron.d/fotbal-fm-finances-planner | none | fotbal-fm-finances-planner`
row only if the app ever gets host cron.)

### 4.5 `infra/webhook/deploy.sh`: append to `APPS=( … )`
```bash
  # fotbal-fm-finances-planner: <DOMAIN> (JanMikes/fotbal-fm-finances-planner) — Next.js +
  # PG18 + uploads volume, one image, one hook. Onboarded <date> (journal).
  fotbal-fm-finances-planner
```
Box key derived by the script: **`FOTBAL_FM_FINANCES_PLANNER_DEPLOY_WEBHOOK_SECRET`**.

### 4.6 Docs in lily.srv (required by `CLAUDE.md` working conventions)
- `docs/journal.md`: a newest-first entry (what / where / why, the ordered box steps, verification).
  Model it on "2026-09-12 — Boliga onboarded as two app stacks".
- `docs/software.md` / `docs/backlog.md` as relevant (for example the checks-token follow-up and the
  Adminer decision). No new `Dxx` is needed unless a genuinely new choice is made. SSE +
  `LISTEN/NOTIFY` may merit a short `Dxx` if the operator wants it recorded.

`deploy/add-app.sh --app fotbal-fm-finances-planner --repo JanMikes/fotbal-fm-finances-planner --domain <DOMAIN> --port 3000 --health /api/health`
can scaffold 4.1–4.3 (dry-run by default, local only) and stage the HMAC secret in a gitignored
`apps/<slug>/deploy-webhook.local.env`. Its generated compose is the bare template, so replace it with
4.1. Its generated `release.yml` uses `await_deploy: true` + `deploy_sha: true`; adjust per §5.

---

## 5. Files in this repo (app side)

### 5.1 `.github/workflows/release.yml` (shape copied from `~/www/mfkfm/.github/workflows/web.yml` + `mfkfm-archiv/release.yml`)
```yaml
# CI + Release: lint/test on PRs and pushes; on push to main build+push the image to GHCR and
# trigger the lily deploy via the shared TheDevs-cz/ci ship workflow (D23 HMAC webhook).
# The box PULLS the image; this repo holds NO SSH key, only DEPLOY_WEBHOOK_SECRET.
# Prod compose + deploy.sh live in TheDevs-cz/lily.srv (apps/fotbal-fm-finances-planner).
name: Release

on:
    push:
        branches: [main]
    pull_request:            # public repo: never pull_request_target

permissions:
    contents: read
    packages: write
    statuses: read           # needed only when await_deploy: true

concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
    test:
        runs-on: ubuntu-latest
        steps:
            -   uses: actions/checkout@v6
            -   uses: actions/setup-node@v6
                with:
                    node-version: '24'
                    cache: 'npm'
            -   run: npm ci
            -   run: npm run lint
            -   run: npm test

    ship:
        needs: [test]
        if: github.event_name == 'push'
        uses: TheDevs-cz/ci/.github/workflows/_ship.yml@v1
        secrets:
            # Passed EXPLICITLY — `secrets: inherit` does not cross owners (TheDevs-cz ≠ JanMikes).
            DEPLOY_WEBHOOK_SECRET: ${{ secrets.DEPLOY_WEBHOOK_SECRET }}
        with:
            app: fotbal-fm-finances-planner                       # hook id == /srv/<app> == compose project
            image: ghcr.io/janmikes/fotbal-fm-finances-planner    # lowercase, explicit
            context: .
            dockerfile: Dockerfile
            deploy_host: lily.srv.thedevs.cz
            deploy_sha: true          # deploy the immutable sha-<git sha> just built
            await_deploy: false       # flip to true once the box checks token (D27) is seeded
```
Other `_ship.yml@v1` inputs: `build_args` (newline `KEY=VALUE`, non-secret), `target`, `platforms`
(default `linux/amd64`), `cache`, `provenance`, `deploy_tag`, `await_timeout_seconds` (default 300).
Secret `BUILD_SECRETS` is optional, for BuildKit `--mount=type=secret` (for example a Sentry auth
token).

### 5.2 GitHub repo secrets / variables
| Name | Kind | Value source | Required |
|---|---|---|---|
| `DEPLOY_WEBHOOK_SECRET` | Actions secret | same hex as box `FOTBAL_FM_FINANCES_PLANNER_DEPLOY_WEBHOOK_SECRET`; set via `printf '%s' "$secret" \| gh secret set DEPLOY_WEBHOOK_SECRET --repo JanMikes/fotbal-fm-finances-planner` (**stdin, not `--body -`**) | yes |
| `BUILD_SECRETS` | Actions secret | BuildKit secrets, only if the build needs any | no |
| `GITHUB_TOKEN` | automatic | GHCR push (`packages: write`) | auto |
No Actions *variables* are needed. Runtime secrets never go to GitHub (D9).

### 5.3 `Dockerfile` essentials (fotbal-fm `web/Dockerfile` precedent)
- Multi-stage `node:24-alpine` (deps → `next build` with `output: 'standalone'` → runner). In the
  runner: `ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000`, copy `.next/standalone`,
  `.next/static`, `public`, plus the migration runner and SQL files.
- `RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data` before `USER nextjs` (volume
  ownership, §3).
- busybox `wget` is present in alpine, which the healthcheck uses. No secrets in the image.

### 5.4 `compose.yml` (local dev only; dev credentials as defaults)
- `postgres:18-alpine` (dev may float) with `POSTGRES_USER/DB=planner`,
  `POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-planner}`, port `5432` published locally, and a named volume.
- `web`: either `node:24` with a bind mount and `npm run dev`, or a build of the Dockerfile.
  `DATABASE_URL=postgresql://planner:planner@postgres:5432/planner`, `ACCESS_TOKEN=${ACCESS_TOKEN:-dev}`,
  `SESSION_SECRET=${SESSION_SECRET:-dev-only-not-secret}`, and `./var/uploads:/app/data/uploads`.
- Personal overrides go in a **gitignored `compose.override.yaml`** (mfkfm pattern). Never put
  production values in either file.
- This file is never used on lily. Production compose is §4.1 in lily.srv.

---

## 6. Onboarding runbook (order matters; from the boliga onboarding, journal 2026-09-12)

Legend: **[AGENT]** = file edits an agent can do without box access. **[BOX]** = state change on lily
(SSH root key; Claude may do it only after explicit user "yes" per lily.srv `CLAUDE.md`). **[HUMAN]** =
needs a person, UI access or an account decision.

1. **[HUMAN] Decide** the domain (§2.8), the slug (`fotbal-fm-finances-planner` proposed), whether to
   add an Adminer, and the access model (token vs password, admin PIN).
2. **[AGENT] App repo:** Dockerfile, `/api/health`, migration runner, `compose.yml`, `release.yml`
   (§5). Do not push to `main` yet, or the first ship will fail because the webhook is unknown.
3. **[AGENT] lily.srv working tree:** §4.1–4.5 (optionally via `deploy/add-app.sh` dry-run, which also
   generates the HMAC secret into gitignored `apps/<slug>/deploy-webhook.local.env`). Validate with
   `docker compose config -q` (with a throwaway `.env`), `bash -n` + `shellcheck deploy.sh`, and
   `git check-ignore apps/<slug>/deploy-webhook.local.env`. **Do not push yet.**
4. **[BOX] Webhook secret first:** append `FOTBAL_FM_FINANCES_PLANNER_DEPLOY_WEBHOOK_SECRET=<hex>` to
   `/srv/webhook/secrets.env` (0600 root, back it up first, pipe the value over ssh stdin). This must
   happen **before** the infra push, because `infra/webhook/deploy.sh` dies on a missing secret and
   fails the whole reconcile.
5. **[BOX]/[HUMAN] Infisical project** `fotbal-fm-finances-planner`, env `prod`. House pattern: created
   headlessly by the `lily-deploy` identity (`POST /api/v2/workspace`) so it is admin from birth. The
   alternative is the UI over VPN: create the project, then add `lily-deploy` as viewer under Access
   Control. Set the secrets (§7) with `infisical secrets set --file <0600 tmpfs file> … >/dev/null`.
   Verify that `dump_secrets fotbal-fm-finances-planner` reports N keys (a count, never values).
6. **[HUMAN] GitHub secret** `DEPLOY_WEBHOOK_SECRET` on `JanMikes/fotbal-fm-finances-planner` (the same
   value as step 4). An agent with `gh` auth can run the stdin command after explicit approval.
7. **[HUMAN] DNS:** create the record for `<DOMAIN>` → `91.98.188.211` / `lily.srv.thedevs.cz` (Webglobe
   for `fotbal-fm.cz`, Cloudflare for `thedevs.cz`) **before the first deploy** when using `le`. TTL 60.
8. **[HUMAN approves] Push lily.srv `main`.** A push to lily.srv main is applied to production by the D36
   reconciler. Expected result: the `webhook` row re-renders `hooks.yaml` with the new hook and recreates
   the receiver (~1 s blip), and `apps/<slug>/` is delivered to `/srv/<slug>/`, reported
   **NEEDS-WINDOW** (class D, deliver only; this is expected).
9. **[HUMAN approves] Push the app repo `main`.** `test` → `_ship.yml` builds, pushes GHCR, and POSTs the
   hook. The executor runs `deploy.sh sha-<sha>`, which creates the volumes, renders `.env`, pulls,
   starts db, migrates and rolls out. Watch it in Grafana Loki `{app="deploy"}` or
   `/var/log/lily/deploy.log` on the box.
10. **[HUMAN] Check the GHCR package visibility** (`ghcr.io/janmikes/fotbal-fm-finances-planner`). If
    the executor reports a 401 on pull, make the package public (or use the D57 credential in
    `deploy.sh`).
11. **[BOX] Verify:** `https://<DOMAIN>/api/health` returns 200 with a valid LE cert; containers are
    healthy; `probe_success{instance="https://<DOMAIN>/api/health"} == 1`; `pg_up` for the db exporter;
    SSE stays open across a deploy (the client reconnects and refetches). Optionally run
    `lily-backup.sh` for a one-off backup check.
12. **[HUMAN]+[BOX] Optional D27:** create a fine-grained PAT (owner JanMikes, only this repo,
    *Commit statuses: read & write*) and append `FOTBAL_FM_FINANCES_PLANNER_GH_REPO=JanMikes/fotbal-fm-finances-planner`
    and `FOTBAL_FM_FINANCES_PLANNER_GH_CHECKS_TOKEN=<pat>` to `/srv/deploy/checks.env` (0600). Then set
    `await_deploy: true` in `release.yml`.
13. **[AGENT] Journal** the box actions in `lily.srv/docs/journal.md` (+ software/backlog) and commit.

Pre-DNS alternative (staged-first): skip step 7 initially. Put a box-only
`/srv/<slug>/compose.override.yaml` with a stage router `fotbal-fm-finances-planner-stg.lily.srv.thedevs.cz`
(`le-dns`) in place, deploy and validate, then delete the override, flip DNS and redeploy.

---

## 7. Secret inventory (names only)

**Infisical project `fotbal-fm-finances-planner`, env `prod`, path `/`** (rendered to
`/srv/fotbal-fm-finances-planner/.env`):
| Key | Used by | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | db, web (`DATABASE_URL`), db-exporter | hex, ≥32 chars |
| `ACCESS_TOKEN` | web | secret-link token or shared team password (prompt.md §1) |
| `SESSION_SECRET` | web | signs the access cookie |
| `ADMIN_PIN` | web | optional |
| `SENTRY_DSN` | web | optional, only if Sentry is added |

**Box-only (not Infisical, never in any repo):**
- `/srv/webhook/secrets.env`: `FOTBAL_FM_FINANCES_PLANNER_DEPLOY_WEBHOOK_SECRET`
- `/srv/deploy/checks.env` (optional, D27): `FOTBAL_FM_FINANCES_PLANNER_GH_REPO`,
  `FOTBAL_FM_FINANCES_PLANNER_GH_CHECKS_TOKEN` (`…_PUBLIC_LOGS` optional, default off)

**GitHub (`JanMikes/fotbal-fm-finances-planner`):** `DEPLOY_WEBHOOK_SECRET` (mirror of the box value).

Non-secret config (`APP_URL`, `UPLOADS_DIR`, limits) goes **in compose `environment:`**, not Infisical.
That is the boliga-api lesson: keep Infisical for secrets only.

---

## 8. Manual vs agent summary

| Task | Who |
|---|---|
| App code, Dockerfile, dev `compose.yml`, `release.yml` | AGENT |
| `lily.srv/apps/<slug>/{compose.yaml,deploy.sh,.gitignore}`, manifest row, webhook `APPS` entry, journal/docs | AGENT (edits only) |
| Generate the HMAC secret | AGENT (`add-app.sh`, local, gitignored) |
| Append the webhook secret to `/srv/webhook/secrets.env` | BOX (explicit user approval) |
| Create the Infisical project, grant `lily-deploy`, set secret values | BOX or HUMAN (UI over VPN) |
| `gh secret set DEPLOY_WEBHOOK_SECRET` | HUMAN, or AGENT with approval |
| DNS record (Webglobe / Cloudflare) | HUMAN |
| Push lily.srv `main` (auto-applies to prod) and the first app push | HUMAN approval |
| GHCR package visibility check | HUMAN |
| Fine-grained PAT for D27 + seeding `checks.env` | HUMAN + BOX |
| Choice of domain, Adminer yes/no, access model | HUMAN |

---

## 9. Open questions / risks
1. Final hostname, and who has Webglobe DNS access for `fotbal-fm.cz`.
2. Public Adminer (house default) or none. A public one adds a login surface; the alternative is
   VPN-only per `docs/admin-services.md`.
3. Attachment size cap (Traefik's 60 s request-read timeout) and an expected total volume. Rough
   numbers help size the backup floor and shrink guard.
4. Migration tool choice, and making sure it runs from the standalone runtime image.
5. Whether to record SSE + `LISTEN/NOTIFY` as a lily `Dxx`. It is the first Node realtime app; the
   Mercure ones are PHP.
6. Stale docs in lily.srv to be aware of: `apps/README.md` (config path "operator-driven"), the
   `CLAUDE.md` onboarding table (webhook secret "in Infisical"), and `infra/snippets/postgres.yaml`
   (`backup.pg.superuser=postgres`).
