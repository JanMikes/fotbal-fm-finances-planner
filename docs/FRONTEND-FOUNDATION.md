# Frontend foundation (for Phase-2 UI agents)

Phase 1 delivered everything except the feature screens. This page describes what exists and the conventions
to follow when building the UI on top of it. The UI must match the prototype 1:1 (`docs/analysis/prototype.md`)
with the resolutions in `docs/DECISIONS.md`.

## What to replace

`src/components/AppShell.tsx` is a **placeholder**: header (logo, title, tabs, identity select, „+ Nový úkol" button)
and a `<main data-phase1-placeholder>` that only prints counts. Replace the `<Placeholder/>` with the real views
(`Board` for tasks/print, `OrgView`, `YearReport`, modals). Keep `<StoreProvider>` at the top and render the data
UI inside `<StoreGate>`. `#modalRoot` (sibling of `.app`) exists for portals — modals and the yearly report go
there so the print stylesheet (`body>.app{display:none}`) keeps working.

Everything else (`src/lib/**`, `src/server/**`, API) is the foundation — extend it, don't fork it. If you must
change an API contract, update `docs/API.md` and the integration tests.

## Styling

- Global CSS = `src/styles/globals.css` → design tokens (`src/styles/fm/tokens/*`) + **prototype CSS verbatim**
  (`src/styles/fm/prototype-app.css`) + `src/styles/app-extra.css` (login page, `.app-msg`; put new non-prototype
  rules here). Use the prototype class names exactly (`.top`, `.tabs`, `.bar`, `.board`, `.col`, `.card`, `.ov`,
  `.modal`, `.onode`, `.tree`, `.curbud`, `.yv`, …). No Tailwind / UI libraries.
- Fonts: Montserrat 400–900 from `public/fonts` (`@font-face` in `tokens/fonts.css`). Logo: `/logo-short.svg`.
- Dead/legacy selectors from prototype.md §18 are still in `prototype-app.css` — remove them once the UI is built
  (DECISIONS #10: do not rebuild those features).

## Module map

| Module | Purpose |
|---|---|
| `src/lib/types.ts` | Domain types = API JSON (`OrgNode`, `BoardColumn`, `Task`, `PrintType`, `PrintItem`, `PrintYearClosure`, `Attachment`, `Budget`, `AppState`, `ChangeEvent`). |
| `src/lib/constants.ts` | `GROUPS`, `GROUP_FILTERS`, `CATS`, `CATEGORY_OPTGROUPS`, `AREAS`, `UNIT_NAME_SUGGESTIONS`, `AVC`, `AVPAL`, `LIGHT`, `DEFAULT_UNIT_COLOR`, `MNAMES`, `MONTH_ABBR` (Čvn/Čvc), `BUDGET_COLORS`, `MAX_UPLOAD_BYTES`, `ALL` (= "Vše"). |
| `src/lib/format.ts` | `nf`, `kcs` (`25 000 Kč`, normal space), `parseDigits` / `parseDigitsOrZero` (`replace(/\D/g,'')`), `cbFmt`, `signedKc` (U+2212), `budgetTag`, `fmtSize`, `ini`, `thousandsLabel` (`4,5 tis.`), `qtyLabel`, `formatDate` (`13. 10. 2026`), `formatDayMonth` (`13. 10.`), `monthKey`, `isoDate`, `monLab` (`Říjen 2026`), `normalizeUrl`. |
| `src/lib/due.ts` | `dueInfo(due, inLastColumn, now?, titlePrefix?)` → `{cls: ""\|"soon"\|"late"\|"done", text: "Dnes"\|"Zítra"\|"d. m.", title, diff}`. |
| `src/lib/filters.ts` | `columnsOf`, `lastColumnId`, `itemsInColumn`, `inGroup`, `taskVisible`, `groupCounts`, `taskMonthOptions` (−1…+11 + due months, counts by group), `printVisible`, `printTypeOptions`, `printMonthOptions` (−2…+5, Kč sums), `sumPrices`, `printTotalLabel`, `defaultTaskCategory`. Archived print items are excluded from all board counts/sums (DECISIONS #9). |
| `src/lib/budget.ts` | `monthsSince`, `computeBudget(budget, nodes, now?)` → `{total, green, installments, left, months}`. |
| `src/lib/tree.ts` | `personsInOrder` (identity order), `rootsOf`, `childrenOf`, `descendantsOf`, `wouldCreateCycle`, `peopleCount` (persons only, DECISIONS #3), `unitTaskCount` (null when the unit name matches no category/group), `personStats` („řeší"/„vede"), `assignedTaskCount`, `parentOptions` (Nadřízený select), `colorOf` (AVC fallback), `isLightColor`, `buildTree`. |
| `src/lib/report.ts` | `buildYearReport({items, types, closures, year, now?})` — same data as `GET /api/print/years/:y/report`. |
| `src/lib/sortOrder.ts` | `between`, `planInsert`, `appendOrder`, `MIN_GAP` (shared with the server). |
| `src/lib/api.ts` | Typed fetch client `api.*`, `ApiError`, `CLIENT_ID` (per tab, sent as `X-Client-Id`), `uuid()`. A 401 redirects to `/login`. |
| `src/lib/prefs.ts` | Per-browser UI prefs in localStorage `fotbalfm.ui.v1`: `me, view, filter, month, mine, prFilter (type id or "Vše"), prMonth, curBudOpen`. Search strings are never persisted. |
| `src/lib/store/store.ts` | `AppStore` (framework-agnostic): state, optimistic `mutate`, refetch scheduling. |
| `src/lib/store/optimistic.ts` | Pure optimistic transitions mirroring the server rules (move, duplicate, delete column/type/node, close year …). |
| `src/lib/store/actions.ts` | `createActions(store)` — the mutations the UI calls. |
| `src/lib/store/realtime.ts` | SSE client with reconnect/backoff + auth probe. |
| `src/lib/store/react.tsx` | `StoreProvider`, `StoreGate`, `useAppState`, `useStoreSnapshot`, `useActions`, `usePrefs`, `useStore`. |

## Using the store

```tsx
"use client";
import { useActions, useAppState, usePrefs, useStoreSnapshot } from "@/lib/store/react";
import { columnsOf, itemsInColumn, taskVisible } from "@/lib/filters";

function TasksBoard() {
  const state = useAppState();                 // full AppState (inside <StoreGate>)
  const [prefs, updatePrefs] = usePrefs();     // prefs.me is already resolved to an existing person (or null)
  const actions = useActions();
  const { error } = useStoreSnapshot();        // last mutation error message (Czech) → show it, then store.clearError()
  const [q, setQ] = useState("");              // search is local React state, never persisted
  const cols = columnsOf(state.columns, "tasks");
  const visible = (t: Task) => taskVisible(t, { filter: prefs.filter, month: prefs.month, mine: prefs.mine, me: prefs.me, q });
  // drop: beforeId = id of the next VISIBLE card in the target column, or null to append
  const onDrop = (id: string, columnId: string, beforeId: string | null) => actions.moveTask(id, columnId, beforeId);
  …
}
```

Rules of the store:

- Every action applies an **optimistic** change immediately, calls the API and returns its promise. On error the
  state is rolled back (if no other mutation is in flight), `snapshot.error` gets the server's Czech message and
  the promise rejects — `await` it in handlers that need the result (e.g. open the duplicated task) and `catch`
  to keep the modal open.
- After mutations settle, the store refetches `/api/state` to reconcile. Realtime events from other tabs/users
  trigger a debounced refetch, deferred while local mutations are pending. You never need to patch state manually.
- **IDs are generated client-side** (`uuid()`), so a new entity has its final id immediately. Duplicate actions
  return the server payload; e.g. `const { task } = await actions.duplicateTask(id, prefs.me)` → open `task.id`.
- `duplicateNode` for a **unit** has no optimistic step (recursive copy is server-side); it resolves with
  `{nodes}` once done.
- Identity („Přihlášen") is `prefs.me` — use it for `createdBy` and „Jen moje úkoly". Hide „Odebrat" for the
  current identity (DECISIONS #4).

### Actions (all return promises)

| Area | Actions |
|---|---|
| Tasks | `createTask({columnId, category, title, description, leadId, ownerId, dueDate, createdBy, id?})`, `updateTask(id, patch)`, `moveTask(id, columnId, beforeId)`, `duplicateTask(id, createdBy)`, `deleteTask(id)` |
| Columns | `createColumn(title)`, `renameColumn(id, title)`, `deleteColumn(id)` (tasks board only; ask the prototype confirm first; guard "min 1 column" client-side with the prototype alert) |
| Print | `createPrintItem({...})`, `updatePrintItem(id, patch)`, `movePrintItem(id, columnId, beforeId)`, `duplicatePrintItem(id, createdBy)`, `deletePrintItem(id)`, `createPrintType(name)`, `renamePrintType(id, name)`, `deletePrintType(id)`, `closeYear(year)`, `reopenYear(year)` |
| Org | `createNode({kind, name, parentId, …})`, `updateNode(id, patch)`, `deleteNode(id)`, `moveNode({id, parentId, beforeId?, afterId?, adoptChildren?})`, `duplicateNode(id)` |
| Budget | `updateBudget({spolek?, asAmount?, monthlyInstallment?, installmentFrom?})` — send integers (`parseDigits(input)`), `installmentFrom` as `"YYYY-MM"` |
| Attachments | `uploadFile(parentKind, parentId, file)`, `addLink(parentKind, parentId, url, label)`, `deleteAttachment(id)` |
| Misc | `refetch()` |

### Attachments in the task / print modal

The prototype edits attachments on a working copy and applies them on **Save**. The API needs an existing parent,
so in the modal keep pending `File`s / links / removed ids in local state and on Save:

1. new item: `await actions.createTask({...})` (client id) — existing item: `await actions.updateTask(...)`;
2. `await Promise.all(pending.map(f => actions.uploadFile("task", id, f)))`, `addLink(...)` for links,
   `deleteAttachment(id)` for removed ones;
3. close. Show uploaded files as `<a href={att.url}>` (the URL is the authenticated download route).

`MAX_UPLOAD_BYTES` (25 MB) — reject bigger files client-side with a Czech message. Link URLs are normalised
server-side too (`https://` prefix), but use `normalizeUrl` for the immediate UI.

## Conventions

- **Client-only rendering for data UI.** The page is a client component tree; dates/numbers use `Intl` (cs-CZ),
  so render data only inside `<StoreGate>` (after the client fetched state) to avoid hydration mismatches. Prefs
  use `useSyncExternalStore` with defaults on the server.
- **Numbers** in inputs accept any text; convert with `parseDigits` (→ `number | null`) before calling actions.
  Display with `kcs`, `cbFmt` (budget inputs, formatted on blur only), `qtyLabel`.
- **Dates**: `"YYYY-MM-DD"` in state; `<input type="date">` values map 1:1; display with `formatDate` /
  `dueInfo`.
- **Ordering**: always sort with `sortOrder` (`itemsInColumn`, `childrenOf`). Never rely on array order from the
  API.
- **Last column** („done") = `lastColumnId(state.columns, board)`.
- **Print type filter** stores the type **id** (not the name like the prototype) so renames don't break it.
- **Texts**: Czech, verbatim from prototype.md (including `„…"`, `—`, `−`, `×`). Native `confirm`/`alert` are fine.
- **Tests**: pure logic → Vitest in `tests/unit` (`npm test`); API changes → `tests/integration`
  (`npm run test:integration`, needs a `*test*` Postgres DB); flows → Playwright in `tests/e2e`. The e2e smoke tests
  check the header text „Marketingový plán úkolů" and the „Úkoly" tab button — keep those (or update the tests).

## Known gaps / TODO for Phase 2

- All feature UI: boards with pointer-event drag & drop (prototype §7.7, 220 ms touch hold), modals, org tree +
  drag & drop, budget box, yearly report + print stylesheet, info popover, toasts for `snapshot.error`.
- Remove the dead CSS listed in prototype.md §18.
- Optional: render `snapshot.online === false` as a subtle "offline" hint.
