# Deployment

How `fotbal-fm-finances-planner` gets from a push to production on **lily**
(`lily.srv.thedevs.cz`, the TheDevs Hetzner box), how to onboard it the first time, and how to rotate
its secrets.

> This repository is **public**. This file names secrets but never holds a value. Never commit a
> real password, token, or webhook secret, in this file or anywhere else.

| | |
|---|---|
| Production URL | `https://marketing.fotbal-fm.cz` |
| Slug (everywhere) | `fotbal-fm-finances-planner`: lily `apps/<slug>/`, `/srv/<slug>/` on the box, compose project, webhook hook id, Infisical project |
| Image | `ghcr.io/janmikes/fotbal-fm-finances-planner` (tags `sha-<full git sha>`, `main`, `latest`) |
| Production compose + deploy script | `TheDevs-cz/lily.srv` → `apps/fotbal-fm-finances-planner/{compose.yaml,deploy.sh}` (private infra repo, **not** this repo) |
| Local dev compose | `compose.yml` in this repo (dev defaults only, never used on lily) |

---

## 1. How CI/CD works

```
PR / push ──▶ .github/workflows/ci.yml
               ├─ checks       npm ci · lint · typecheck · unit tests
               ├─ integration  npm run test:integration against a postgres:18 service container
               └─ e2e          docker build (production image) → Postgres 18 → `node migrate.mjs` (twice)
                               → app on an empty named volume → contract asserts → Playwright
push to main, all three green ──▶ ship = TheDevs-cz/ci/.github/workflows/_ship.yml@v1
               ├─ build    buildx → push ghcr.io/janmikes/fotbal-fm-finances-planner:{sha-<sha>,main,latest}
               └─ deploy   HMAC-SHA256-signed POST https://deploy.lily.srv.thedevs.cz/hooks/fotbal-fm-finances-planner
                           body {"app":"fotbal-fm-finances-planner","tag":"sha-<sha>"}
lily: webhook receiver (non-root) verifies the HMAC and spools the job → root executor runs
      /srv/fotbal-fm-finances-planner/deploy.sh sha-<sha>
        0. docker volume create …_pgdata, …_uploads           (external volumes, idempotent)
        1. dump_secrets  Infisical → /srv/<slug>/.env (0600), then fail fast unless all 4 keys are present
        2. pull_image web
        3. docker compose up -d db db-exporter                (no-op when unchanged; waits for a healthy db)
        4. docker compose run --rm --no-deps --label traefik.enable=false web node migrate.mjs
        5. rollout web       zero-downtime blue-green: start the new container, wait for its healthcheck, stop the old one
```

- **The box pulls, CI never pushes to the box.** CI holds no SSH key and no runtime secret. The only
  GitHub secret is `DEPLOY_WEBHOOK_SECRET` (the per-app HMAC key). `GITHUB_TOKEN` pushes to GHCR.
  A leaked webhook secret can only re-deploy *this* image (owner and name are fixed in the lily
  compose file).
- **Fork PRs** run with `pull_request` (read-only token, no secrets). `ship` runs only for a push to `main`.
- **Concurrency:** one run per ref. A newer push cancels a running PR run. Runs on `main` are never
  cancelled mid-flight.
- **`await_deploy: false`:** the CI run turns green once the deploy is *queued*, not when it
  *succeeds*. Check the real result in Grafana / Loki (`{app="deploy"}`) or in
  `/var/log/lily/deploy.log` on the box. To make CI wait for the real result, see step 10 below.
- **Migrations** run once per deploy, **before** the new container starts. If a migration fails, the
  deploy aborts and the old version keeps serving. For roughly 10 s during every rollout the old and
  new containers run side by side, so every migration must be **backward-compatible with the
  previous release**: add columns or tables first, and remove them in a later release.
- **Realtime (SSE)** has its own Traefik router (`PathPrefix(/api/realtime)`) without the retry
  middleware. Events fan out through Postgres `LISTEN/NOTIFY`, so clients connected to the old or
  the new container both receive them during a rollout.
- **Health:** `GET /api/health` (no auth) is the Docker healthcheck. It is also the only routing
  gate: there is deliberately no Traefik load-balancer check on a single replica. The blackbox
  monitor probes it too. lily alerts automatically on an unhealthy container, a failed probe, or an
  expiring certificate.
- **TLS:** Traefik `le` resolver (ACME HTTP-01) for `marketing.fotbal-fm.cz` (Webglobe DNS), so the
  DNS record must point at lily before the certificate can issue. The original host
  `marketing.fotbal-fm.thedevs.cz` (Cloudflare, `le-dns`) was deprovisioned on 2026-10-13: router,
  DNS record and certificate removed.

### What lily expects from the image (checked by the `e2e` job)
- Listens on `0.0.0.0:3000` and starts with `node server.js` (Next.js standalone). Runs as uid **1001**,
  `WORKDIR /app`.
- `node migrate.mjs` exists in `/app`, reads `DATABASE_URL`, is idempotent, and exits non-zero on failure.
- `/api/health` answers **without auth**: 200 when the DB answers, 503 otherwise — and also 503 when the
  instance's realtime `LISTEN` connection has been down for more than 30 s (body field `realtime`).
- **busybox `wget`** is in the image (the compose healthcheck uses
  `wget --spider http://127.0.0.1:3000/api/health`; use `127.0.0.1`, not `localhost`, because
  `localhost` resolves to IPv6 `::1`).
- `/data/uploads` exists in the image and is **owned by uid 1001**. An empty named volume inherits
  that ownership on first mount; without it, uploads fail with `EACCES`. `tar` must be in the image
  too (the uploads backup runs `docker exec … tar`).
- On SIGTERM the server closes open SSE streams, so a rollout does not wait out the full 30 s grace
  period.
- Production env: `NODE_ENV=production`, `DATABASE_URL`, `UPLOAD_DIR=/data/uploads`, `APP_PASSWORD`,
  `APP_ACCESS_TOKEN`, `SESSION_SECRET`, `TZ=Europe/Prague` (set in the lily `compose.yaml`; the image defaults `TZ` too).
- **The server refuses to start** (exit 1, `[startup] FATAL: invalid production environment: …`, names only) when
  `APP_PASSWORD` is shorter than 8 chars, `APP_ACCESS_TOKEN` or `SESSION_SECRET` shorter than 32 chars, or any of
  them equals a public dev default (`dev-password`, `dev-token`, `dev-session-secret-…`, `ci-session-secret-…`).
  The repo's local `compose.yml` sets `ALLOW_DEV_SECRETS=1` so `docker compose up` works with the dev defaults —
  **never set it on lily**. CI's e2e job generates throwaway random secrets instead.
- Runs fine with `cap_drop: [ALL]` + `no-new-privileges` (lily web service and the CI e2e container use both).
- **Uploads (25 MB/file)** are streamed to disk: `POST /api/attachments` is excluded from the Next proxy matcher (the
  proxy would buffer every request body in memory), and the route enforces the size cap while streaming. Memory use
  stays flat with concurrent uploads (verified: 6 × 24 MB in parallel ≈ +30 MiB), so `mem_limit: 512m` is enough.
  Every other (JSON) body is capped at 1 MB by `proxyClientMaxBodySize` and 256 KB by the API.
- **Client IP / rate limiting:** the login + magic-link limiter (10 attempts / 15 min / IP, in-memory per process)
  takes the **right-most** `X-Forwarded-For` entry. This assumes exactly **one** trusted proxy hop (Traefik, which does
  not trust client-sent forwarded headers and appends the real peer address). If another proxy/CDN is ever put in
  front (e.g. Cloudflare orange cloud), this must be revisited. Without any proxy (local) the header is client-controlled.

### Running the CI steps locally
```bash
npm ci && npm run lint && npm run typecheck && npm test
# start an EMPTY Postgres 18 (e.g. the one in compose.yml), then:
DATABASE_URL=postgresql://… npm run test:integration
docker build -t fotbal-fm-finances-planner:local .
BASE_URL=http://127.0.0.1:3000 npm run test:e2e   # against a running instance
```

---

## 2. First-time onboarding runbook (in this order)

Legend:
- **[HUMAN]** needs a person: a UI, an account, or a decision.
- **[BOX]** a state change on lily as root. Claude may do it only after an explicit "yes" (lily.srv `CLAUDE.md`).
- **[AGENT]** a repo edit (already done unless marked otherwise).

The order matters. If the infra push (step 6) lands before the webhook secret exists on the box
(step 1), the webhook re-render dies and fails the **whole** reconcile. If the app push (step 7)
lands before steps 1–6, the deploy fails.

0. **[AGENT] (done)** This repo: `.github/workflows/ci.yml` and this file. In `lily.srv` (uncommitted
   until reviewed): `apps/fotbal-fm-finances-planner/{compose.yaml,deploy.sh,.gitignore}`, a class-D
   row in `deploy/reconcile.manifest`, `fotbal-fm-finances-planner` in the `APPS=( … )` list of
   `infra/webhook/deploy.sh`, and the `docs/journal.md` / `software.md` / `backlog.md` entries.

1. **[BOX] Webhook secret on the box first.** Generate it on the box so the value never passes
   through a laptop or a log. Back up the file, then append one line:
   ```bash
   ssh root@lily.srv.thedevs.cz 'set -e; f=/srv/webhook/secrets.env;
     cp -a "$f" "$f.bak-$(date +%Y%m%d%H%M%S)";
     grep -q "^FOTBAL_FM_FINANCES_PLANNER_DEPLOY_WEBHOOK_SECRET=" "$f" ||
       printf "FOTBAL_FM_FINANCES_PLANNER_DEPLOY_WEBHOOK_SECRET=%s\n" "$(openssl rand -hex 32)" >> "$f";
     chmod 600 "$f"'
   ```
   The key name is derived from the slug: uppercase, `-` → `_`, plus the suffix `_DEPLOY_WEBHOOK_SECRET`.

2. **[HUMAN] GitHub secret `DEPLOY_WEBHOOK_SECRET`** on `JanMikes/fotbal-fm-finances-planner`, with
   the same value as step 1. Pipe it from the box straight into `gh` (stdin, never `--body` and
   never echoed):
   ```bash
   ssh root@lily.srv.thedevs.cz \
     'grep "^FOTBAL_FM_FINANCES_PLANNER_DEPLOY_WEBHOOK_SECRET=" /srv/webhook/secrets.env | cut -d= -f2- | tr -d "\n"' \
     | gh secret set DEPLOY_WEBHOOK_SECRET --repo JanMikes/fotbal-fm-finances-planner
   ```
   No other GitHub secrets or variables are needed.

3. **[BOX]/[HUMAN] Infisical project** at `https://infisical.thedevs.cz` (VPN-gated UI):
   - Project name **`fotbal-fm-finances-planner`** (must equal the slug), environment **`prod`**,
     path **`/`**.
   - The box machine identity **`lily-deploy`** must be a member of the project (forgetting this is
     the most common miss). House pattern: create the project headlessly *as* `lily-deploy`
     (`POST /api/v2/workspace`), which makes it admin from the start. Alternative: create the project
     in the UI, then add `lily-deploy` under Access Control.
   - Secrets (names exactly as below). Generate each value, then write it via a 0600 temp file
     (`infisical secrets set --file … >/dev/null`; the CLI **echoes values**, so redirect its
     output), then shred the file:

     | Key | Generate with | Notes |
     |---|---|---|
     | `POSTGRES_PASSWORD` | `openssl rand -hex 32` | **Hex only**: it goes into `DATABASE_URL` unescaped. The DB is initialised with it on the first deploy. |
     | `APP_PASSWORD` | chosen by the owner (**min 8 chars**), or `openssl rand -base64 18` | The shared team password for `/login`. |
     | `APP_ACCESS_TOKEN` | `openssl rand -hex 24` (**min 32 chars**) | The magic link is `https://marketing.fotbal-fm.cz/k/<APP_ACCESS_TOKEN>`. Keep it URL-safe (hex). |
     | `SESSION_SECRET` | `openssl rand -hex 32` (**min 32 chars**) | Part of the HMAC key for the 1-year access cookie. |

     `DATABASE_URL` is **not** an Infisical key: the lily `compose.yaml` builds it from
     `POSTGRES_PASSWORD`. All four keys must exist **before** the first deploy, because compose
     refuses to start with a missing `${KEY:?}` and `deploy.sh` fails fast on a missing key.
   - Verify on the box: `source /srv/deploy/lib.sh && dump_secrets fotbal-fm-finances-planner`
     must report **4 key(s)**. It prints a count, never values.

4. **[HUMAN] DNS.** Webglobe zone `fotbal-fm.cz`: `marketing.fotbal-fm.cz. 60 CNAME fotbal-fm.cz.`
   (→ lily, 91.98.188.211). It must resolve to lily before the first deploy, because the
   certificate uses HTTP-01. Do not put a proxy/CDN in front: Traefik terminates TLS, CrowdSec
   needs real client IPs and a proxy can buffer SSE.

5. **[AGENT → HUMAN reviews] Commit** the lily.srv changes (step 0) and this repo's changes.

6. **[HUMAN approves] Push `lily.srv` `main`.** The push is applied to production by the D36
   reconciler. Expected result in the "Reconcile infra" run:
   - the `webhook` row re-renders `hooks.yaml` with the new hook and recreates the receiver (about a 1 s blip);
   - `apps/fotbal-fm-finances-planner/` is delivered to `/srv/fotbal-fm-finances-planner/` and
     reported **NEEDS-WINDOW**. That is expected: app config is delivery-only and takes effect on
     the app's next deploy.

7. **[HUMAN approves] Push this repo's `main`.** CI runs checks → integration → e2e → ship. The box
   then runs `deploy.sh sha-<sha>`, which creates the volumes, renders `.env`, pulls the image,
   starts Postgres, migrates and rolls out. Watch it in Grafana Loki (`{app="deploy"}`) or with
   `tail -f /var/log/lily/deploy.log` on the box.

8. **[CHECK] GHCR package must be public.** For this repo (public) the package came out public
   automatically on the first build (2026-10-13). Verify with an anonymous pull; if it is ever private,
   GitHub → Packages → `fotbal-fm-finances-planner` → Package settings → Change visibility → **Public**
   (the sandboxed deploy executor cannot use root's docker login), then re-run the `Ship to lily` job
   or on the box run `cd /srv/fotbal-fm-finances-planner && ./deploy.sh sha-<full sha>`.

9. **[HUMAN]/[BOX] Verify.**
   - `curl -fsS https://marketing.fotbal-fm.cz/api/health` returns 200 with a valid Let's Encrypt cert.
   - `/login` with `APP_PASSWORD` works, and `/k/<APP_ACCESS_TOKEN>` lands on `/` with the token gone from the URL.
   - Two browsers see each other's changes live (SSE), and still do after a redeploy.
   - Uploading an attachment works (volume ownership).
   - On the box: `docker compose ps` in `/srv/fotbal-fm-finances-planner` shows every service
     healthy; in Grafana, `probe_success` for the `/api/health` URL is 1 and `pg_up` is 1.
   - Optional: `lily-backup.sh` once, to see both backup jobs (`pg` + `files`) succeed.

10. **[HUMAN]+[BOX] Optional: make CI wait for the real deploy result.** Create a fine-grained PAT
    (owner JanMikes, **only** this repo, permission *Commit statuses: read & write*). Append
    `FOTBAL_FM_FINANCES_PLANNER_GH_REPO=JanMikes/fotbal-fm-finances-planner` and
    `FOTBAL_FM_FINANCES_PLANNER_GH_CHECKS_TOKEN=<pat>` to `/srv/deploy/checks.env` (0600) on the box.
    Then set `await_deploy: true` in `ci.yml` and add `statuses: read` to the `ship` job's permissions.

11. **[AGENT] Journal** every box action from steps 1, 3, 6–9 in `lily.srv/docs/journal.md`, and flip
    the app's `docs/software.md` row to **Active**.

---

## 3. Rotating secrets

Secrets are rendered into `.env` **once per deploy** (there is no runtime agent). A change in
Infisical takes effect on the **next deploy**. To redeploy the running version without a code
change, do one of the following:

- GitHub → Actions → the latest green `CI` run on `main` → **Re-run all jobs**. This rebuilds the
  same sha and deploys it.
- **[BOX]** `cd /srv/fotbal-fm-finances-planner && ./deploy.sh sha-<running sha>`. To find the running tag:
  `docker inspect -f '{{.Config.Image}}' $(docker compose ps -q web)`.

The cookie signing key is derived from **all three** auth secrets:
`HMAC key = SESSION_SECRET + "." + base64url(SHA-256(APP_PASSWORD + "\n" + APP_ACCESS_TOKEN))`
(`sessionSigningKey()` in `src/server/auth/session.ts`). Rotating any one of them therefore **logs everyone out** —
which is exactly what you want after a leak, a lost laptop, or someone leaving the team. Plan rotations so the team
has the new password or link at hand. All values must still pass the startup check (lengths above, no dev defaults),
otherwise the new container never becomes healthy and the rollout keeps the old one.

| Secret | Steps | Effect on users |
|---|---|---|
| `APP_PASSWORD` (team password) | Set the new value (min 8 chars) in Infisical (`prod`) → redeploy → tell the team. | **Logs everyone out**; sign in again with the new password or the (unchanged) magic link. |
| `APP_ACCESS_TOKEN` (magic link) | `openssl rand -hex 24` → Infisical → redeploy → share the new `https://marketing.fotbal-fm.cz/k/<token>`. | Old links stop working and **everyone is logged out**; sign in with the new link or the password. |
| `SESSION_SECRET` | `openssl rand -hex 32` → Infisical → redeploy. | **Logs everyone out.** Use it to revoke all sessions without changing the password or the link. |
| `POSTGRES_PASSWORD` | **[BOX]** Changing the env var alone does nothing, because the role password is set only when the DB is first initialised. Order: (1) `openssl rand -hex 32`; (2) `docker compose exec db psql -U planner -d planner -c "ALTER ROLE planner PASSWORD '<new>'"`, typed so it does not land in shell history; (3) update Infisical; (4) redeploy. The `db` container is re-created once (a 1–2 s blip) because its env changed. | None beyond the blip. |
| `DEPLOY_WEBHOOK_SECRET` | **[BOX]** Replace the `FOTBAL_FM_FINANCES_PLANNER_DEPLOY_WEBHOOK_SECRET` line in `/srv/webhook/secrets.env` (back up first) → run `/srv/webhook/deploy.sh` (re-renders `hooks.yaml`; the receiver hot-reloads) → pipe the new value into `gh secret set DEPLOY_WEBHOOK_SECRET` exactly as in onboarding step 2. | Deploys fail until both sides match. |

---

## 4. Backups and restore

Backups are automatic: lily's Contract H discovers containers by their labels, so nothing needs
configuring per app.

- **Postgres** (`backup.pg=*` labels on `db`): `pg_dump -Fc` + `pg_dumpall --globals-only` at
  **06:30 and 18:30 UTC** → Hetzner object storage `s3:<bucket>/fotbal-fm-finances-planner/`, kept
  for 7 days. A sanity floor and a 50 % shrink guard apply, a **restore test** runs every week, and
  failures send an email alert.
- **Uploads** (`backup.files=*` labels on `web`): `docker exec <web> tar -cf - /data/uploads` →
  `fotbal-fm-finances-planner-files-<ts>.tar.gz` on the same schedule. `backup.files.floor=0`
  because production starts empty.
- **Restore:** follow `TheDevs-cz/lily.srv` → `infra/backups/RESTORE.md`, which covers fetching a
  dump with `rclone`, restoring globals, and `pg_restore --clean --if-exists --no-owner --no-acl`
  into the existing DB or a throwaway instance. Background is in `infra/backups/README.md`. For the
  DB, the restore target is `docker compose exec -T db pg_restore … -U planner -d planner`.
  For uploads, extract the tarball back into the volume. The archive stores paths as
  `data/uploads/…`, so extract at `/`, as uid 1001:
  `docker run --rm -u 1001:1001 -v fotbal-fm-finances-planner_uploads:/data/uploads -v "$PWD":/backup alpine tar -xzf /backup/<file>.tar.gz -C /`.
- RAID1 on the box is redundancy, **not** a backup.

---

## 5. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| CI `ship` → deploy step: "receiver did not return QUEUED" | The hook is not rendered on the box (step 1 or step 6 missing), or the GitHub secret differs from the box value (step 2). |
| Deploy log: `dump_secrets: no Infisical project named …` | Step 3: the project is missing, misnamed, or `lily-deploy` is not a member. |
| Deploy log: `FATAL: <KEY> missing from the rendered .env` | Add the key in Infisical `prod`, then redeploy. |
| Deploy log: pull `401` / `denied` | The GHCR package is private (step 8). |
| Deploy log: migration failed | The old version is still serving. Fix the migration and push again. |
| Rollout reverted / container `unhealthy` | `/api/health` not answering on `127.0.0.1:3000` (check `HOSTNAME=0.0.0.0`, DB reachability, `wget` in the image). Logs: Loki `{app="fotbal-fm-finances-planner"}`. |
| The browser reaches an old/unknown server, or gets a cert error | The DNS record is missing or proxied (step 4). Check with `dig +short marketing.fotbal-fm.cz`; it should resolve (via `fotbal-fm.cz`) to `91.98.188.211`. |
| Uploads fail with `EACCES` | `/data/uploads` in the image is not owned by uid 1001, so the volume was initialised root-owned. Fix the Dockerfile; for an existing volume, run `chown -R 1001:1001` on it once from a throwaway container. |
| Many 403s / captcha for one client | CrowdSec `http-probing`. A client stuck in a tight 401 reconnect loop (SSE) can trip it, so the client must back off on 401/403. |
