# Frontend foundation (for Phase-2 UI agents)

Phase 1 delivered everything except the feature screens. This page describes what exists and the conventions
to follow when building the UI on top of it. The UI must match the prototype 1:1 (`docs/analysis/prototype.md`)
with the resolutions in `docs/DECISIONS.md`.

## What to replace

`src/components/AppShell.tsx` (Phase 2: real shell, see „Shell & shared UI" below) keeps `<StoreProvider>` at the
top and renders the data UI inside `<StoreGate>`. `#modalRoot` (sibling of `.app`) exists for portals — modals and the yearly report go
there so the print stylesheet (`body>.app{display:none}`) keeps working.

Everything else (`src/lib/**`, `src/server/**`, API) is the foundation — extend it, don't fork it. If you must
change an API contract, update `docs/API.md` and the integration tests.

## Styling

- Global CSS = `src/styles/globals.css` → design tokens (`src/styles/fm/tokens/*`) + **prototype CSS verbatim,
  frozen** (`src/styles/fm/prototype-app.css`) + `src/styles/app-extra.css` (login page, `.app-msg`) +
  `src/styles/app-ux.css` (UX-round tokens and global overrides, last). Primitive styles: `src/components/ui/ui.css`
  (imported in `layout.tsx` after `components.css`). See „UI primitives" below. Use the prototype class names exactly (`.top`, `.tabs`, `.bar`, `.board`, `.col`, `.card`, `.ov`,
  `.modal`, `.onode`, `.tree`, `.curbud`, `.yv`, …). No Tailwind / UI libraries.
- Fonts: Montserrat 400–900 from `public/fonts` (`@font-face` in `tokens/fonts.css`). Logo: `/logo-short.svg`.
- The dead/legacy selectors from prototype.md §18 have been removed from `prototype-app.css` (DECISIONS #10: do not
  rebuild those features). The print rule `body>.app{display:none}` stays.

## Module map

| Module | Purpose |
|---|---|
| `src/lib/types.ts` | Domain types = API JSON (`OrgNode`, `BoardColumn`, `Task`, `PrintType`, `PrintItem`, `PrintYearClosure`, `Attachment`, `Budget`, `AppState`, `ChangeEvent`). |
| `src/lib/constants.ts` | `GROUPS`, `GROUP_FILTERS`, `CATS`, `CATEGORY_OPTGROUPS`, `AREAS`, `UNIT_NAME_SUGGESTIONS`, `AVC`, `AVPAL`, `LIGHT` (needs navy text: `#c4c8ce`, `#4fbde4`, `#d98a00`), `colorName(hex)` (Czech names for swatch `aria-label`s), `DEFAULT_UNIT_COLOR`, `MNAMES`, `MONTH_ABBR` (Čvn/Čvc), `BUDGET_COLORS`, `MAX_UPLOAD_BYTES`, `ALL` (= "Vše"). |
| `src/lib/dates.ts` | Czech dates, pure and `Intl`-free: `parseIsoDate`, `toIsoDate`, `addDays`, `addMonths`, `addMonthsToDate`, `diffDays` (DST-safe), `formatDate` (`13. 10. 2026`, NBSP), `formatDayMonth`, `formatDateShort` (year only when ≠ current), `formatDateInput` (`út 3. 11. 2026`), `formatDateLong` (`úterý 3. listopadu 2026`), `formatRelativeDay` (`dnes`, `zítra`, `včera`, `za 3 dny`, `za 5 dní`, `před 2 dny`), `formatDateWithRelative` (suffix within ±6 days), `formatMonth` (`Říjen 2026`), `monthGrid` (6×7, Monday first), `weekStart`, `capitalize`, `plural`, `parseCzDate` (`1.2.2026`, `1. 2.`, `1/2/26`, `3. listopadu`, ISO, `dnes`/`zítra`/`pozítří`/`včera`, `+3`/`-2`, leading weekday ignored; implicit year = this year, next year if > 60 days past), `parseCzMonth` (`2026-10`, `10/2026`, `říjen 2026`, `rijen 2026`; `{requireYear}`), `CS_MONTHS`, `CS_MONTHS_GENITIVE`, `CS_WEEKDAYS`, `CS_WEEKDAYS_SHORT`. |
| `src/lib/format.ts` | `nf`, `kcs` (`25 000 Kč` with U+00A0 as thousands separator and before the unit, so amounts never wrap; `NBSP`), `parseDigits` / `parseDigitsOrZero` (a trailing decimal part `,`/`.` + 1–2 digits is ignored — „4 500,50" → 4500 — then `replace(/\D/g,'')`), `cbFmt`, `signedKc` (U+2212), `fmtSize`, `ini`, `thousandsLabel` (`4,5 tis.`), `qtyLabel`, `formatDate` / `formatDayMonth` / `parseIsoDate` / `plural` (re-exported from `dates.ts`), `pluralize(n, one, few, many)` (`3 položky`), `monthKey`, `monLab` (`Říjen 2026`), `normalizeUrl`. |
| `src/lib/due.ts` | `dueInfo(due, inLastColumn, now?, titlePrefix?)` → `{cls: ""\|"soon"\|"late"\|"done", text, title, srText, diff}`; `text` = „Dnes" / „Za 3 dny" / „Před 2 dny" within ±6 days, else `formatDateShort`; last column: `formatDateShort`, no suffix; `title`/`srText` = prefix + date + „ — po termínu" / „ — za 3 dny". Pass `useToday()` as `now`. |
| `src/lib/filters.ts` | `columnsOf`, `lastColumnId`, `itemsInColumn`, `inGroup`, `taskVisible`, `groupCounts`, `taskMonthOptions` (−1…+11 + due months, counts by group), `printVisible`, `printTypeOptions`, `printMonthOptions` (−2…+5, Kč sums; both month lists always include the currently selected month), `sumPrices`, `printTotalLabel`, `defaultTaskCategory`. Archived print items are excluded from all board counts/sums (DECISIONS #9). |
| `src/lib/budget.ts` | `monthsSince`, `computeBudget(budget, nodes, now?)` → `{total, green, installments, left, months}`. |
| `src/lib/tree.ts` | `personsInOrder` (identity order), `rootsOf`, `childrenOf`, `descendantsOf`, `peopleCount` (persons only, DECISIONS #3), `unitTaskCount` (null when the unit name matches no category/group), `personStats` („řeší"/„vede"), `assignedTaskCount`, `parentOptions` (Nadřízený select), `colorOf` (AVC fallback), `isLightColor`, `buildTree`. |
| `src/lib/report.ts` | `buildYearReport({items, types, closures, year, now?})` — same data as `GET /api/print/years/:y/report`. |
| `src/lib/sortOrder.ts` | `between`, `planInsert`, `appendOrder`, `MIN_GAP` (shared with the server). |
| `src/lib/api.ts` | Typed same-origin fetch client `api.*`, `ApiError`, `CLIENT_ID` (per tab, sent as `X-Client-Id`), `uuid()`. Every non-GET request is `Content-Type: application/json` (except multipart uploads). A 401 redirects to `/login`. Only the app's own JSON errors (`{error, message}`) reach the UI; proxy pages („Bad Gateway", HTML) become a Czech generic message. |
| `src/lib/patch.ts` | `changedFields(next, initial)` — edit forms PATCH only what the user changed since the form opened (no lost updates). |
| `src/lib/prefs.ts` | Per-browser UI prefs in localStorage `fotbalfm.ui.v1`: `me, view, filter, month, mine, prFilter (type id or "Vše"), prMonth, curBudOpen`. Search strings are never persisted. A stored `me` pointing to a deleted member is reset (effective identity = first member); „Jen moje úkoly" with no identity shows nothing. |
| `src/lib/store/store.ts` | `AppStore` (framework-agnostic): state, optimistic `mutate`, refetch scheduling, load retry with backoff, `notify(msg)` (toast). |
| `src/lib/store/optimistic.ts` | Pure optimistic transitions mirroring the server rules (move, duplicate, delete column/type/node, close year …). |
| `src/lib/store/actions.ts` | `createActions(store)` — the mutations the UI calls. |
| `src/lib/store/realtime.ts` | SSE client with reconnect/backoff + auth probe; every `hello` (incl. the first) and `resync` triggers a full refetch. |
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

- Every action applies an **optimistic** change immediately, calls the API and returns its promise. On error only
  that mutation's change is rolled back (the state is rebuilt from the confirmed base plus the other pending
  changes), `snapshot.error` gets the server's Czech message and the promise rejects — `await` it in handlers that
  need the result (e.g. open the duplicated task) and `catch` to keep the modal open.
- After mutations settle, the store refetches `/api/state` to reconcile. Realtime events from other tabs/users
  trigger a debounced refetch, deferred while local mutations are pending; a response whose request started before
  the latest mutation is discarded (and fetched again). Failed loads are retried with backoff (1 s → 30 s) and on
  the `online` event; while they fail `snapshot.stale` is true (the „Offline" pill shows) — background failures are
  not toasted. You never need to patch state manually.
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
| Budget | `updateBudget({spolek?, asAmount?, monthlyInstallment?, installmentFrom?}, {keepalive?})` — send integers (`parseDigits(input)`), `installmentFrom` as `"YYYY-MM"` (`null` = no deduction yet; the server sets it with the first non-zero installment). Pending BudgetBox edits are flushed on unmount and `pagehide`. |
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
- **Dates**: `"YYYY-MM-DD"` in state; edit with `DateInput` / `MonthInput`; display with `dates.ts` / `dueInfo`
  (never `toLocaleDateString`).
- **Ordering**: always sort with `sortOrder` (`itemsInColumn`, `childrenOf`). Never rely on array order from the
  API.
- **Last column** („done") = `lastColumnId(state.columns, board)`.
- **Print type filter** stores the type **id** (not the name like the prototype) so renames don't break it.
- **Texts**: Czech, verbatim from prototype.md (including `„…"`, `—`, `−`, `×`). Native `confirm`/`alert` are fine.
- **Tests**: pure logic → Vitest in `tests/unit` (`npm test`); API changes → `tests/integration`
  (`npm run test:integration`, needs a `*test*` Postgres DB); flows → Playwright in `tests/e2e`. The e2e smoke tests
  check the header text „Marketingový plán úkolů" and the „Úkoly" tab button — keep those (or update the tests).

## Shell & shared UI (Phase 2, boards)

| Module | Purpose |
|---|---|
| `src/components/AppShell.tsx` | `StoreProvider` → `UiProvider` → `.app` (`Header` + active tab: `TasksTab` / `PrintTab` / `TeamTab`) and the sibling `#modalRoot` (yearly report host + the one open modal), plus `StatusLayer`. |
| `src/components/UiContext.tsx` | `useUi()` → `modal` + `openTask(id \| null, columnId?)`, `openPrint(…)`, `openTypes()`, `closeModal()`, `reportOpen` / `setReportOpen`. One modal at a time (prototype `#modalRoot`). |
| `src/components/Header.tsx` | Tabs (switching closes the report), identity select, „+ Nový úkol" / „+ Nová tiskovina" (org tab → jumps to Úkoly). Publishes the header bottom as CSS var `--fm-top-h`. |
| `src/components/StatusLayer.tsx` | Error toast for `snapshot.error` (6 s), subtle „Offline" pill after 4 s without SSE or while refetches fail, silent refetch on `visibilitychange`. |
| `src/components/ui/Modal.tsx` | Prototype modal shell (`.ov > .modal > .mh + body + .mf`), see „UI primitives". Render it from `ModalHost` (inside `#modalRoot`), or pass `portal` to portal it there (team forms). |
| `src/components/ui/useCloseWhenDeleted.ts` | Edit modals (task, print item, member, unit): when the entity is deleted elsewhere, close with the toast „Položka byla smazána jiným uživatelem." |
| `src/components/ui/Avatar.tsx` | `.av` circle (`lead` ring, „–" when unassigned, tooltip „Vedoucí/Zodpovědný: …", `role="img"` named by the tooltip, navy initials on `LIGHT` colours). |
| `src/components/components.css` | Non-prototype CSS for the shell (report host, toast, offline pill); imported in `layout.tsx`. |
| `src/features/board/Board.tsx` | Generic kanban (`mode: "tasks" \| "print"`, `visible` map, `renderCard`, `columnExtra`, optional `columnEditing`). Prototype DOM/classes. |
| `src/features/board/useBoardDnd.ts` | Pointer-event drag & drop (prototype §7.7): mouse > 5 px, touch hold 220 ms + `vibrate(15)`, live placeholder `.ph` (a separate element — the original card stays mounted, hidden with `data-dragsrc`, so a touch drag survives crossing columns), ghost portal `body > .card.ghost`, `.col.over`, autoscroll (`body.dragging` disables the mobile scroll-snap), `pointercancel` reverts, `onDrop(id, columnId, beforeIdOfNextVisible)`, click swallowed 50 ms after a drag. |
| `src/features/board/DueChip.tsx` | `.due` chip from `dueInfo`. |
| `src/features/attachments/AttachmentBox.tsx` | „Přílohy a odkazy" box with a draft (`AttachmentDraft`) applied after save via `applyAttachmentDraft` (attempts everything, resolves with the failed part, which the modal keeps for a retry); `attachmentsOf`, `attachmentCounts`. |
| `src/features/tasks/*`, `src/features/print/*` | Tabs, filter bars, cards, `TaskModal`, `PrintModal`, `PrintTypesModal`. |

The yearly report (`PrintReport`) is rendered inside `#modalRoot > .report-host` (fixed below the header, `transform`
makes it the containing block of `.yv`); the Tiskoviny bar/board are not rendered while it is open.
Local parallel dev servers: `NEXT_DIST_DIR=.next/<name> next dev -p <port>` (optional `distDir` override in `next.config.ts`).

## UI primitives (UX round)

Import from `@/components/ui`. Live catalogue: **`/ui-lab`** (unlinked, behind the login like every route,
`noindex`); `tests/e2e/ui-primitives.spec.ts` runs against it. Primitives portal their layers to `<body>` and never
use `data-sub` / `data-info` / `data-close` / `data-id` / `.onode` (React events still bubble to TeamTab).

| Primitive | Use |
|---|---|
| `Select` | `<label htmlFor="fCat">…</label><Select id="fCat" value onChange options={[opt \| {label, options}]} />`. Option `{value, label, meta?, disabled?, keywords?}`. `variant="field"` (44px) \| `"filter"` (40px, 600, min 180) \| `"onDark"`; `searchable` (default `"auto"` = ≥ 10 options); `placeholder`, `renderValue`, `invalid`, `aria-*`. Trigger `button#id.fm-select[role=combobox][data-value]`; popup `#{id}-listbox [role=option][data-value]`. APG keys (see file header); fine pointer → popover (flips up), coarse → bottom sheet. Tests: `pick`, `pickByText`, `expectValue`, `optionTexts`, `optionText` in `tests/e2e/ui-helpers.ts`. |
| `DateInput` | `<DateInput id="fDue" value={iso\|""} onChange />` (+ `min`, `max`, `invalid`, `showRelative`). Text input `#id[data-value]` parses Czech input on every keystroke (`fill("2026-11-20")` works), normalises on blur („út 3. 11. 2026"), reverts unparseable text („Datum nerozpoznáno"). Calendar button `.fm-date__btn` / Alt+↓; quick picks Dnes / Zítra / Za týden / Vymazat. Coarse pointer: read-only input, tap → sheet. Tests: `setDate(input, text)`. |
| `MonthInput` | `<MonthInput id="cbFrom" value={ym\|""} onChange compact placeholder="od měsíce…" />`. Typing commits only full months with a 4-digit year; blur/Enter also accept a bare month name. `.fm-month`, `#id[data-value]`. Tests: `fill("2026-10")` or `pickMonth(page, "#cbFrom", "2026-10")`. |
| `MoneyInput` | `<MoneyInput id="fPrice" value={n\|null} onChange suffix="Kč" />` (+ `zeroAsEmpty`, `compact`, `onBlur`, `onFocus`). `.fm-money > input.fm-money__input[inputmode=numeric] + .fm-money__sfx`. Raw text while focused, `parseDigits` on every keystroke, NBSP thousands on blur („4 500"), mirrors the prop while not focused. |
| `Field` + `fieldA11y` | `<Field label htmlFor required hint error wide group>` → `.f[.w]` > label (`.req` „*") → control → `p.f-hint#{id}-hint` → `p.f-err#{id}-err[role=alert]`; `group` = `fieldset.f > legend.lbl` for radio/checkbox sets. Spread `fieldA11y(id, {hint, error, required})` on the control (`aria-describedby`, `aria-invalid`, `aria-required`). Invalid border stays `#b3261e`. |
| `Button` | `<Button variant="primary\|secondary\|outline\|ghost\|danger\|onDark" size="sm" icon block busy>` → `.btn.{variant}[.sm][.icon][.block]`, `type="button"` by default; `busy` = disabled + `aria-busy` spinner (label unchanged). Plain `<button className="btn outline">` gets the same styles. |
| `Modal` | `<Modal title onClose foot={end buttons} footStart={Smazat, Duplikovat} meta="Založil(a) …" onSubmit={save} initialFocus="#fTitle" testId portal size>`. `aria-labelledby` → `.mh h2`; initial focus (skipped on coarse pointers) or the dialog; focus trap (body layers `[data-fm-layer]` and `.app-toast` allowed); focus restore to the opener; Esc and Ctrl/Cmd+Enter on `window`, ignored when `defaultPrevented` (Escape contract) and only for the topmost modal; overlay pointerdown that just dismissed a popover does not close. Footer `.mf > span.meta + .mf-start + .mf-end`; desktop centred with a scrolling `.mb`, ≤ 760px full screen. A legacy `foot` with `span.meta` + all buttons still renders as before. |
| `Popover` | Low-level anchored layer / bottom sheet (`anchor` ref, `open`, `onClose(reason)`, `label`, `sheet?`, `matchWidth?`, `placement?`, `role?`, `trapFocus?`). Escape contract: a layer that handles Esc calls `preventDefault()` + `stopPropagation()`; window-level Esc listeners must ignore `defaultPrevented`. |
| `Calendar` | The month grid used by DateInput (standalone use possible). |
| `useToday()` | Local midnight of today; one shared timer to the next midnight + `visibilitychange`. Feed it to `dueInfo` / date displays so chips refresh at midnight. |
| `useCoarsePointer()` / `isCoarsePointer()` | `(pointer: coarse)` media query. |

CSS tokens (`app-ux.css`): `--c-ok`, `--c-ok-bg`, `--c-danger`, `--c-danger-ink` (#b3261e), `--c-danger-bg`,
`--c-danger-line`, `--c-warn`, `--c-warn-bg`, `--c-warn-ink`, `--control-h` (44px), `--control-h-compact` (40px),
`--control-fs` (15px), `--z-modal` 200, `--z-toast` 300, `--z-layer` 400, `--focus-ring-danger`, `--focus-ring-dark`;
utility `.sr-only`. Global pass: `:focus-visible` ring (light on navy surfaces), field focus = blue border +
`--focus-ring`, `.budc`/`.avpick`/`.chkgrid` inputs visually hidden but focusable (ring via `:has(:focus-visible)`,
checked = tint/fill + ✓), grey-600 minimum for small text, 11px minimum labels, `(pointer: coarse)` 44px minimums,
`prefers-reduced-motion`. axe in e2e: `expectNoA11yViolations(page, {include, exclude, disableRules})` waits for
animations and allowlists only the white-on-`--fm-blue` brand trade-off.

## Known gaps / TODO for Phase 2

- Boards, task/print modals, type management, toasts and the offline hint are done (see „Shell & shared UI").
  Org tree / budget box / info popover (`src/features/team`) and the yearly report (`src/features/print-report`) are
  built separately.
- Dead CSS from prototype.md §18: removed.
