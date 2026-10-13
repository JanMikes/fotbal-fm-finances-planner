# API

REST + JSON under `/api/*`. Implementation: `src/app/api/**/route.ts` (thin) → `src/server/services/*` (rules,
transactions). Shapes are the TypeScript types in `src/lib/types.ts`; the typed browser client is `src/lib/api.ts`.

## Conventions

- **Auth:** every endpoint except `GET /api/health` and `POST /api/auth/login` requires the `fmp_session` cookie.
  Without it the API answers `401 {"error":"unauthorized","message":"Přihlaste se."}` (pages redirect to `/login`).
- **Keys are camelCase.** Request bodies may also use snake_case top-level keys (`parent_id`, `before_id`, …) —
  they are converted.
- **IDs** are UUIDs. Create endpoints accept an optional client-generated `id` (uuid v4) so optimistic entities
  keep their final id.
- **`X-Client-Id`** header (any string ≤ 100 chars, one per browser tab) should be sent on mutations; it is echoed in
  realtime events so the originating tab can ignore its own changes.
- **Money / quantities** are integers (Kč, ks). Inputs accept numbers or free text — every non-digit is stripped
  (`"4 500 Kč"` → 4500, `""` → `null`), exactly like the prototype.
- **Dates:** `"YYYY-MM-DD"`. Timestamps: ISO 8601 strings.
- **Text** is trimmed; required text must be non-empty after trimming.
- **Errors:** `{ "error": code, "message": "Czech text", "details"?: … }`

| Status | `error` | When |
|---|---|---|
| 400 | `validation` | zod validation failed (`details` = zod issues) |
| 400 | `bad_request` | integrity rule violated (message is user-facing Czech, e.g. „Musí zůstat alespoň jeden sloupec.") |
| 400 | `bad_reference` | referenced row does not exist |
| 401 | `unauthorized` | no / invalid session |
| 404 | `not_found` | unknown id (also for malformed ids in the path) |
| 409 | `conflict` | unique violation (duplicate print-type name, duplicate client id) |
| 413 | `too_large` | attachment > 25 MB |
| 429 | `rate_limited` | too many login attempts |
| 500 | `internal` | unexpected |

- **Ordering:** `sortOrder` (number). Moves insert at the midpoint between neighbours; when the gap gets below
  `1e-6` the whole sibling group is renumbered `1..n` (same algorithm client-side: `src/lib/sortOrder.ts`).
  Lists are always displayed sorted by `sortOrder`.

## Auth & health

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/health` | – | `200 {"ok":true}` when `select 1` succeeds within 3 s, else `503 {"ok":false,…}`. No auth. |
| GET | `/k/:token` | – | Valid `APP_ACCESS_TOKEN` → sets cookie, `303 Location: /`. Invalid → `303 Location: /login`. |
| POST | `/api/auth/login` | form `password=…` **or** JSON `{password}` | Form: `303` to `/` (cookie set) / `/login?error=1` / `/login?error=rate`. JSON: `200 {ok:true}` / `401` / `429`. 10 attempts per 15 min per IP. |
| POST | `/api/auth/logout` | – | Clears cookie, `303 Location: /login` |

Cookie: `fmp_session=v1.<issuedAtMs>.<HMAC-SHA256>`; `HttpOnly; SameSite=Lax; Max-Age=31536000; Path=/`,
`Secure` only when the request is HTTPS (directly or `X-Forwarded-Proto: https`).

## State

`GET /api/state` → `AppState` (one consistent snapshot):

```jsonc
{
  "nodes":       OrgNode[],        // whole org tree (persons + units)
  "columns":     BoardColumn[],    // both boards; filter by boardId "tasks" | "print"
  "tasks":       Task[],
  "printTypes":  PrintType[],
  "printItems":  PrintItem[],      // ALL items incl. archived (archived: true) — the board hides archived ones
  "closures":    PrintYearClosure[],
  "attachments": Attachment[],     // metadata for tasks + print items; file url = /api/attachments/:id/file
  "budget":      Budget
}
```

## Org tree (`/api/org-nodes`, `/api/org/move`)

One table for both node kinds (`kind: "person" | "unit"`). Person fields: `name, role, info, budget,
budgetColor ("blue"|"green"|"red"), avatarColor (#rrggbb), areas[]`. Unit fields: `name, color (#rrggbb)`.
Common: `parentId` (null = top level), `sortOrder`. Fields of the other kind are ignored.

| Method | Path | Body | Response / rules |
|---|---|---|---|
| GET | `/api/org-nodes` | – | `OrgNode[]` |
| POST | `/api/org-nodes` | `{id?, kind, name, …fields, parentId?, beforeId?, afterId?}` | `201 OrgNode`. Appended as the last child of `parentId` unless `beforeId`/`afterId` is given. Parent must exist. |
| PATCH | `/api/org-nodes/:id` | any subset of the fields incl. `parentId` | `OrgNode`. Changing `parentId` appends at the end of the new sibling group; cycles (self/descendant) → 400. Empty `role`/`info` → `null`. |
| DELETE | `/api/org-nodes/:id` | – | `{ok:true}`. Children move to the deleted node's parent **taking its place** in the sibling order. Person: tasks' `leadId`/`ownerId`/`createdBy` and print items' `createdBy` become `null`. |
| POST | `/api/org-nodes/:id/duplicate` | `{id?}` | `201 {nodes: OrgNode[]}` (top copy first). Person: copy „… (kopie)" right after the original (optional client `id`). Unit: recursive copy of the unit and all sub-**units** (no persons); top copy „… (kopie)" right after the original. |
| PATCH | `/api/org/move` | `{id, parentId, beforeId?, afterId?, adoptChildren?}` | `OrgNode`. Moves the node with its subtree. `parentId: null` = top level / root zone. `beforeId`/`afterId` must be a sibling in the target group (else 400). Neither = append as last child. Cycle → 400. `adoptChildren: true` (unit only, non-null parent) = "insert the category between": the target's **person** children (not sub-units) are re-parented under the moved unit. |

Drag & drop mapping (prototype §10.8): drop on card centre → `{parentId: target.id}`; left/top third →
`{parentId: target.parentId, beforeId: target.id}`; right/bottom third → `{…, afterId: target.id}`; root zone →
`{parentId: null}`; category on a node with person children + user confirms → add `adoptChildren: true`.

## Columns (`/api/columns`)

Only the **tasks** board has editable columns. Print columns (Poptávka, Ve výrobě, Hotovo) are fixed: create / rename
/ delete on them → `400`.

| Method | Path | Body | Response / rules |
|---|---|---|---|
| GET | `/api/columns?board=tasks\|print` | – | `BoardColumn[]` |
| POST | `/api/columns` | `{id?, boardId: "tasks", title}` | `201 BoardColumn`, appended at the end. Blank title → 400. |
| PATCH | `/api/columns/:id` | `{title}` | `BoardColumn` |
| DELETE | `/api/columns/:id` | – | `{ok, movedTo, movedCount}`. At least one column must remain (400 „Musí zůstat alespoň jeden sloupec."). Its tasks move to the **end of the first remaining column** (keeping their order). |

## Tasks (`/api/tasks`)

`Task = {id, columnId, category, title, description, leadId, ownerId, dueDate, sortOrder, createdBy, createdAt}`.
`leadId` / `ownerId` / `createdBy` must be **person** nodes (or null).

| Method | Path | Body | Response / rules |
|---|---|---|---|
| POST | `/api/tasks` | `{id?, columnId, category, title, description?, leadId?, ownerId?, dueDate?, createdBy?}` | `201 Task`, appended to the end of the column. Column must belong to the tasks board. |
| PATCH | `/api/tasks/:id` | subset of `{columnId, category, title, description, leadId, ownerId, dueDate}` | `Task`. A changed `columnId` appends to the end of the new column (form "Stav" change). Unknown keys → 400. |
| PATCH | `/api/tasks/:id/move` | `{columnId, beforeId?}` | `Task`. Inserted before `beforeId` (must be in the target column) or appended when null/absent. Use the next **visible** card as `beforeId` (prototype §7.7). |
| POST | `/api/tasks/:id/duplicate` | `{id?, createdBy?}` | `201 {task, attachments}`. Copy „… (kopie)" placed right after the original; attachments (files duplicated on disk, links) copied. |
| DELETE | `/api/tasks/:id` | – | `{ok:true}`; its attachments (rows + files) are deleted too. |

## Print (`/api/print-types`, `/api/print-items`, `/api/print/years`)

`PrintItem = {id, columnId, typeId, title, description, quantity, price, paidByClub, realizationDate, archived,
sortOrder, createdBy, createdAt}`. `price: null` = „Bez ceny"; `paidByClub` = „Zaplaceno FK FM".

| Method | Path | Body | Response / rules |
|---|---|---|---|
| GET | `/api/print-types` | – | `PrintType[]` |
| POST | `/api/print-types` | `{id?, name}` | `201 PrintType` (appended). Duplicate name → 409. |
| PATCH | `/api/print-types/:id` | `{name}` | `PrintType`. Items reference types by id, so a rename propagates automatically. Duplicate → 409. |
| DELETE | `/api/print-types/:id` | – | `{ok, movedTo, movedCount}`. Min. 1 type (400 „Musí zůstat alespoň jeden typ."). Items move to the **first remaining** type. |
| POST | `/api/print-items` | `{id?, columnId, typeId, title, description?, quantity?, price?, paidByClub?, realizationDate?, createdBy?}` | `201 PrintItem` (appended; column must be a print column). |
| PATCH | `/api/print-items/:id` | subset of the fields above (no id/createdBy) | `PrintItem` (changed `columnId` appends). |
| PATCH | `/api/print-items/:id/move` | `{columnId, beforeId?}` | `PrintItem` |
| POST | `/api/print-items/:id/duplicate` | `{id?, createdBy?}` | `201 {printItem, attachments}` |
| DELETE | `/api/print-items/:id` | – | `{ok:true}` (+ attachments) |
| POST | `/api/print/years/:year/close` | – | `{closure: {year, closedAt}, archivedCount}`. Sets `archived = true` on every item whose `realizationDate` is in `year` and upserts the closure row. |
| DELETE | `/api/print/years/:year/close` | – | `{unarchivedCount}`. Un-archives that year's items and removes the closure. |
| GET | `/api/print/years/:year/report` | – | `YearReport` (see below). |

Items created later with a date in a closed year are **not** auto-archived (DECISIONS #6).

### `YearReport` (`src/lib/report.ts`, also usable client-side via `buildYearReport`)

```jsonc
{
  "year": 2026, "years": [2026, 2025],          // years with dated items ∪ current year, DESC
  "closedAt": "…" | null,
  "itemCount": 12, "total": 54000, "paid": 30000, "owed": 24000, "quantity": 3500,
  "paidPct": 56, "owedPct": 44,                  // owedPct = 100 - paidPct (0 when total = 0)
  "months": [{ "month": 1, "name": "Leden", "abbr": "Led", "key": "2026-01",
               "items": PrintItem[], "sum": 0, "paid": 0, "owed": 0 }, …12],   // abbr unique: Čvn / Čvc
  "maxMonth": 12000,                             // max(1, …sums) for the chart scale
  "activeMonths": 5, "avgPerActiveMonth": 10800,
  "topMonth": { "name": "Březen", "sum": 12000 } | null,
  "types": [{ "typeId": "…" | null, "name": "Letáky" | "—", "sum": 0, "count": 0, "quantity": 0 }],  // sum DESC
  "maxType": 20000,
  "noDateCount": 2                               // non-archived items without a date (global, not per year)
}
```

Archived and active items of the year are both included.

## Budget (`/api/budget`)

`Budget = {spolek, asAmount, monthlyInstallment, installmentFrom: "YYYY-MM-01" | null}` (singleton).

| Method | Path | Body | Response / rules |
|---|---|---|---|
| GET | `/api/budget` | – | `Budget` |
| PUT | `/api/budget` | any subset; `installmentFrom` accepts `"YYYY-MM"` or `"YYYY-MM-DD"` (stored as the 1st) or `null` | `Budget`. When a non-zero installment is saved while `installmentFrom` is null (and none is sent), it is set to the current month (Europe/Prague). The migration seeds 0 / 0 / 7500 from the go-live month. |

`Zbývá = spolek + asAmount − Σ budget(persons with budgetColor "green") − monthlyInstallment × months(installmentFrom..now, inclusive)`
— `computeBudget()` in `src/lib/budget.ts`.

## Attachments (`/api/attachments`)

`Attachment = {id, parentKind: "task"|"print", parentId, kind: "file"|"link", name, url, sizeBytes, mime, createdAt}`.
The parent must already exist (create the task/item first, then upload).

| Method | Path | Body | Response / rules |
|---|---|---|---|
| POST | `/api/attachments` | `multipart/form-data`: `parentKind`, `parentId`, `file`, optional `id` | `201 Attachment` (`url` = `/api/attachments/:id/file`). Max 25 MB (`413`). One file per request. |
| POST | `/api/attachments` | JSON `{kind: "link", parentKind, parentId, url, name?, id?}` | `201 Attachment`. `https://` is prepended when the URL has no scheme; `javascript:`/`data:` rejected. |
| GET | `/api/attachments/:id/file` | – | The file. `Content-Type` = stored mime, `Content-Disposition: inline` for images / PDF / text, else `attachment`, with an RFC 5987 UTF-8 filename. `X-Content-Type-Options: nosniff` + sandbox CSP. |
| DELETE | `/api/attachments/:id` | – | `{ok:true}`; the file is removed from disk. |

## Realtime (`GET /api/realtime`)

Server-Sent Events (`text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`).

```
retry: 3000
event: hello
data: {"ok":true}

event: change
data: {"entity":"task","op":"move","id":"<uuid>","clientId":"<X-Client-Id of the author or null>"}

event: resync
data: {}

: ping 1791888428157          ← heartbeat comment every 25 s
```

- `entity`: `org_node | column | task | print_type | print_item | print_year | budget | attachment`
- `op`: `insert | update | delete | move | duplicate | close | reopen`
- `id`: the primary entity id (`print_year`: the year number, `budget`: 1)
- One event per committed mutation (sent via `pg_notify` inside the transaction, so it only arrives after commit),
  from **any** app instance (blue-green safe). Bulk side effects (e.g. tasks moved by a column delete) are not
  sent separately — **refetch `/api/state`** on any event not carrying your own `clientId`.
- `resync`: the server re-established its LISTEN connection and may have missed events → refetch.
- Clients must also refetch after reconnecting. On SIGTERM the server closes all streams immediately.
