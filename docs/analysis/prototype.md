# Prototype analysis — „Marketingový plán úkolů" (Fotbal FM)

Single source of truth for rebuilding the prototype `Marketing ukoly.html` 1:1 in React / Next.js.

- Source: `~/Downloads/Fotbal-FM-Design-System/Marketing ukoly.html` (849 lines, one file: inline `<style>` on lines 9–389, markup on 392–421, inline `<script>` on 422–847). A reference copy is in `docs/analysis/prototype-assets/Marketing ukoly.html`.
- Spec: `/prompt.md` (Czech technical brief). Section 19 lists where the spec and the prototype disagree.
- Line numbers below (`L123`) point into the prototype HTML.
- Czech UI strings are quoted **verbatim**, including typographic quotes `„…“`, `—` (em dash), `…` (ellipsis), `−` (U+2212 minus) and `×` (U+00D7).

---

## 1. File inventory and asset loading

### 1.1 Files the app needs (all copied to `docs/analysis/prototype-assets/`)

| File (relative to design system root) | Purpose | Notes |
|---|---|---|
| `styles.css` | Entry stylesheet. It only `@import`s the 6 token files. | The prototype links it with `<link rel="stylesheet" href="styles.css">`. |
| `tokens/fonts.css` | 9 `@font-face` rules for Montserrat (weights 100–900, OTF, `font-display:swap`). | `src:url("../assets/fonts/Montserrat-*.otf")`, so the path is relative to `tokens/`. |
| `tokens/colors.css` | Brand colours, blue and grey ramps, semantic aliases. | Used heavily (see §4.8). |
| `tokens/typography.css` | `--font-family`, `--fw-*`, `--fs-*`, `--lh-*`, `--ls-*`. | The prototype CSS mostly hard-codes its sizes; only the font family is relevant. |
| `tokens/spacing.css` | `--sp-*`, `--radius-*`. | Not referenced by the prototype CSS (values are hard-coded), but kept for completeness. |
| `tokens/effects.css` | `--shadow-*`, `--clip-*`, `--focus-ring`. | Not referenced by the prototype CSS (clip-paths are inlined). |
| `tokens/backgrounds.css` | `--bg-dark-img`/`--bg-light-img` + `.fm-bg-dark/.fm-bg-light`. | **Not used by the app.** It references `assets/bg-dark.png` (17 MB) and `bg-light.png` (5 MB). Those images were **not** copied. **Drop this import in Next.js**: the CSS loader resolves `url()` at build time and fails on missing files. |
| `assets/logo-short.svg` | Shortened crest shown in the header (`<img src="assets/logo-short.svg" alt="Fotbal FM">`, height 40px, or 32px on mobile). | viewBox `0 0 288.2 357.8`, no scripts, colours `#031c45 #035990 #0099d5 #d1d1d1 #f6f6f6 #fff`. |
| `assets/fonts/Montserrat-{Thin,ExtraLight,Light,Regular,Medium,SemiBold,Bold,ExtraBold,Black}.otf` | Font files (~470 KB total). | The weights the app actually uses are 400 (default), 500, 600, 700, 800 and 900, so Thin/ExtraLight/Light can be dropped. Consider converting them to WOFF2 (the design system readme suggests this too). |
| `prototype-app.css` *(extracted)* | The prototype's inline `<style>` (L9–389), saved verbatim as a separate file. | Copy-paste source for the global CSS. All class names in this document refer to it. |

What the app does **not** use: `components/` (React primitives for the print catalogue), `ui_kits/`, `guidelines/`, `templates/`, `export/`, `_ds_bundle.js`, `doc-page.js`, `image-slot.js`, `logo.svg`, `logo-dark.svg`, `logo-crest.svg`, or any background images. The app has **no icon set**. Every glyph is a text character: `×` (close/delete), `▾` (budget chevron), `←` (back), `+` (add), `i` (info, Georgia italic), `–` (empty avatar).

### 1.2 How Montserrat is loaded
`styles.css` → `@import "./tokens/fonts.css"` → local OTF `@font-face` rules (family name `"Montserrat"`). `body{font-family:"Montserrat",system-ui,sans-serif}`. Nothing is loaded from Google Fonts.

The info button is the only exception to Montserrat: `font: italic 800 13px/1 Georgia,serif`.

**Next.js recommendation:** use `next/font/local` with the 6 used weights and `variable: '--font-montserrat'`, or keep the CSS tree as-is under e.g. `src/styles/fm/` (`styles.css`, `tokens/`, `assets/fonts/`) so the relative `url()`s resolve, and remove the `backgrounds.css` import.

---

## 2. App shell (DOM skeleton)

```html
<div class="app">                                  <!-- flex column, height:100dvh -->
  <header class="top">                             <!-- navy bar -->
    <div class="brand"><img src="assets/logo-short.svg" alt="Fotbal FM"><div><h1>Marketingový plán úkolů</h1></div></div>
    <nav class="tabs" id="tabs">
      <button data-view="board">Úkoly</button><button data-view="print">Tiskoviny</button><button data-view="org">Struktura týmu</button>
    </nav>
    <div class="tools">
      <label class="who"><span>Přihlášen</span><select id="me"></select></label>
      <button class="btn primary" id="btnNew">+ Nový úkol</button>
    </div>
  </header>
  <div class="bar"> … tasks filter bar … </div>               <!-- visible only when view==="board" -->
  <div class="bar" id="pbar" hidden> … print filter bar … </div> <!-- visible only when view==="print" -->
  <main class="board" id="board"></main>                       <!-- hidden when view==="org" -->
  <main class="org" id="org" hidden> … </main>                 <!-- visible only when view==="org" -->
</div>
<div id="modalRoot"></div>   <!-- modals AND the yearly report overlay are rendered here (outside .app) -->
```

- Page `<title>`: `Marketing — úkoly | Fotbal FM`. `<html lang="cs">`. Viewport: `width=device-width,initial-scale=1,viewport-fit=cover`.
- `.brand` has `margin-right:auto`, which pushes the tabs and tools to the right. `.brand .k` (kicker) CSS exists, but the markup has no kicker element.
- `.tabs` uses `margin:-12px 0; align-self:stretch`, so the tab buttons fill the full header height. The active tab gets `.on` (white text + 3px `--fm-blue` bottom border).
- `[hidden]{display:none!important}` is used to toggle the views.
- Z-index stack: ghost 100, `#oTip` 101, `.yv` (yearly report) 150, `#infoPop` 150, `.ov` (modal overlay) 200.

### 2.1 `render()` (L517)
```
renderTop()                                   // identity select, group & month selects, "mine" checkbox
tabs: button.on where data-view === S.view
$(".bar").hidden   = S.view !== "board"       // first .bar = tasks bar
#pbar.hidden       = S.view !== "print"
#board.hidden      = S.view === "org"
#org.hidden        = S.view !== "org"
#btnNew text       = view==="print" ? "+ Nová tiskovina" : "+ Nový úkol"   // also "+ Nový úkol" on org tab
if print: renderPbar()
if org: renderOrg() else renderBoard()
```

---

## 3. State (`S`) — localStorage key `fotbalfm.marketing.v1`

Everything lives in one object `S`, stored as JSON. `save()` writes the whole object **minus `q` and `pq`** (the search strings are never persisted). If the write fails: `alert("Úložiště je plné — odeberte některé velké soubory z příloh.")`.

### 3.1 Top-level fields

| Field | Type | Default / init | Meaning | New app |
|---|---|---|---|---|
| `users` | `User[]` | seed (4 users) | Team members = person nodes of the org tree. Array order = identity/user select order and the AVC fallback colour index. | DB `members` |
| `units` | `Unit[]` | `[]` | Category nodes of the org tree. | DB `org_units` |
| `me` | `string` (user id) | `"u1"` | Current identity („Přihlášen"). | **per-browser localStorage** |
| `cols` | `{id:string,title:string}[]` | 5 seed columns | Task board columns, in array order. | DB `board_columns` (board `tasks`) |
| `tasks` | `Task[]` | 6 seed tasks | Tasks. **Array order = display order within a column** (there is no sort field). | DB `tasks` |
| `pr` | `PrintBoard` | see §3.4 | Print materials board. | DB |
| `curBud` | `CurBudget` | see §3.5 | Singleton budget. | DB `budget` |
| `filter` | `string` | `"Vše"` (reset to `"Vše"` on load if not a key of `GROUPS`) | Task category group filter. | per-browser |
| `month` | `"all" \| "none" \| "YYYY-MM"` | undefined → treated as `"all"` | Task month filter (by `due`). | per-browser |
| `mine` | `boolean` | undefined/false | „Jen moje úkoly". | per-browser |
| `q` | `string` | `""` (reset on every load) | Task search. **Not persisted.** | React state |
| `view` | `"board" \| "print" \| "org"` | `"board"` | Active tab. | per-browser (or URL) |
| `prFilter` | `string` | `"Vše"`; also reset to `"Vše"` in `renderPbar` if the type no longer exists | Print type filter. | per-browser |
| `prMonth` | `"all" \| "none" \| "YYYY-MM"` | undefined → `"all"` | Print month filter (by `due` = realisation date). | per-browser |
| `pq` | `string` | `""` (reset on load) | Print search. **Not persisted.** | React state |
| `curBudOpen` | `boolean` | undefined/false | Budget box expanded. | per-browser |
| `orgInit` | `true` | set once | Migration flag (see 3.6). | — |

### 3.2 `User` (person node)
```ts
type User = {
  id: string;            // uid() = Math.random().toString(36).slice(2,10); seed ids "u1".."u4"
  name: string;          // required, trimmed
  role?: string;         // "" allowed; rendered as "Člen týmu" when empty (org tree only)
  info?: string;         // „Krátká informace" (trimmed; "" = no info button)
  budget?: string;       // RAW user text, e.g. "25 000" or "25000 Kč"; parsed with /[^\d]/g→"" when used
  budColor?: "" | "green" | "red";   // "" = Budoucnost (blue). Set from a radio; new member defaults to ""
  color?: string;        // hex from AVPAL, or "" → fallback AVC[index % 8]
  boss?: string;         // parent node id (user OR unit), "" or undefined = top level
  areas: string[];       // subset of AREAS
  ord: number;           // sort order among siblings (see §10.8)
  unplaced: boolean;     // always false (dead "pool" feature, see §18)
}
```

### 3.3 `Unit` (category node)
```ts
type Unit = { id: string; kind: "unit"; name: string; color: string /* hex, default picker "#00588e" */;
              boss: string; ord: number; unplaced: boolean /* always false */ }
```
The `kind:"unit"` field tells the two node types apart (`isUnit(id)` = found in `S.units`). Users have no `kind`. `node$(id)` looks the id up in users, then units. `allNodes() = [...S.users, ...S.units]`.

### 3.4 `Task` / print item and `PrintBoard`
```ts
type Attachment = { name: string; size: number; type: string; data?: string /* data: URL; absent when file > 1.5 MB */ };
type Link = { url: string; label: string /* "" allowed */ };

type Task = {
  id: string; col: string /* column id */; cat: string /* category (tasks) | media type name (print) */;
  title: string /* required, trimmed */; desc: string /* trimmed */;
  lead: string /* user id | "" */; owner: string /* user id | "" */;
  due: string /* "YYYY-MM-DD" | "" */;
  files: Attachment[]; links: Link[];
  createdBy: string /* user id (S.me at creation) */; createdAt: number /* ms epoch */;
  // present on print items (and carried as ""/undefined on tasks):
  qty?: string /* raw text, e.g. "500" */; price?: string /* raw text, e.g. "4 500" */;
  paid?: "ano" | "ne";    // print: default "ne"; tasks: undefined
  arch?: true;            // print: archived by "Uzavřít rok"; the key is DELETED on reopen
}

type PrintBoard = {
  types: string[];        // media types, in array order (default list in §4.4)
  cols: {id,title}[];     // fixed [{p1,"Poptávka"},{p3,"Ve výrobě"},{p4,"Hotovo"}]
  tasks: Task[];          // print items; array order = display order
  closed?: Record<number /*year*/, number /*ms epoch closed_at*/>;
  cols3?: true;           // migration flag
}
```
When the form saves (L742), a task gets `lead/owner` from the selects and `qty: T.qty||""`, `price: T.price||""`, `paid: T.paid`. A print item gets `lead:"", owner:""` and `qty/price/paid` from the form. A newly built object always contains `price:""`.

### 3.5 `CurBudget`
```ts
type CurBudget = {
  spolek: string;   // raw text, default ""
  as: string;       // raw text, default ""
  pays: { id: string; name: string /* "Programování" */; amt: string /* default "7500" */; from: string /* "YYYY-MM" */ }[];
}
```
Init (L601–602): `S.curBud ||= {spolek:"",as:""}`. If `pays` is missing, it becomes `[{id:uid(), name:"Programování", amt:"7500", from:<current month, from new Date().toISOString().slice(0,7)>}]`. `pay0()` recreates `pays[0]` with `amt:""` if it is missing. **No UI edits `from` or `name`**, and only `pays[0].amt` is editable (the „Splátka" field). The computation still sums over *all* `pays`.

### 3.6 Load-time migrations / normalisation (L446–460) — order matters
1. Parse localStorage. If parsing fails or `!S.users`, use `S = seed()`.
2. If `!(S.filter in GROUPS)`, set `S.filter = "Vše"`.
3. If `!S.orgInit`: every user except the first gets `boss = users[0].id` (when it has none), every user gets `areas ||= []`, then `orgInit = true`.
4. `S.view ||= "board"`.
5. If `!S.pr`, create the default print board (types, 3 columns, `tasks: []`).
6. If `!S.pr.cols3`: remap tasks with `col === "p2"` to `"p3"`, reset the columns to the 3 fixed ones, and set `cols3 = true`.
7. `S.prFilter ||= "Vše"`, `S.pq = ""`, `S.units ||= []`.
8. For every node (users, then units) in index order: if `ord == null`, set `ord = index`. Set `unplaced = false` on every node.
9. Rename the task category `"Ženy A"` to `"Celý klub"` (a legacy category). `S.q = ""`.
10. Budget init (3.5).

### 3.7 Seed / demo data (`seed()`, L433–445) — candidate DB seed

**Users** (no colour, budget, info or areas. After the orgInit migration, u2–u4 get `boss:"u1"` and every user gets `areas:[]`):

| id | name | role |
|---|---|---|
| u1 | Petra Horáková | Vedoucí marketingu |
| u2 | Tomáš Kubala | Sociální sítě |
| u3 | Lucie Mrázková | Grafika |
| u4 | Ondřej Sýkora | Foto / video |

Effective colours via the AVC fallback: u1 `#0099cf`, u2 `#00588e`, u3 `#1b2341`, u4 `#007fb4`.

**Columns:** c1 `Nápady`, c2 `K řešení`, c3 `Probíhá`, c4 `Ke kontrole`, c5 `Hotovo`.

**Tasks** (`createdBy:"u1"`, `createdAt: now`, `files: []`. `due` is relative to today via `dd(n)` = today+n days, computed with `toISOString().slice(0,10)`, i.e. a UTC date):

| col | cat | title | desc | lead | owner | links | due |
|---|---|---|---|---|---|---|---|
| c1 | Celý klub | Série „Valcíři zblízka“ | Krátké portréty hráčů A-týmu, 1× týdně na Instagram a TikTok. | u1 | u4 | – | +21 |
| c2 | Muži A | Plakát na domácí zápas | A3 plakát + verze pro sociální sítě 1080×1350. | u1 | u3 | – | +2 |
| c2 | Přípravka U9 | Fotky z turnaje | Výběr 20 fotek, popisky se jmény se souhlasem rodičů. | u2 | u4 | – | −1 |
| c3 | Dorost U19 | Pozvánka na nábor | Text a grafika pro web a Facebook. | u1 | u2 | `{url:"https://www.fotbalfm.cz",label:"Web klubu"}` | +6 |
| c4 | Muži A | Představení soupisky | Carousel s fotkami hráčů. | u2 | u3 | – | "" |
| c5 | Merch | Nový merch v e-shopu | Produktové fotky a popisy. | u1 | u3 | – | "" |

The seed also sets `me:"u1"`. Print: default types and columns, no items. Units: none. Budget: `spolek:""`, `as:""`, `pays:[{name:"Programování", amt:"7500", from:<current month>}]`.

---

## 4. Constants

### 4.1 Category groups (L423–427)
```js
const GROUPS = {
  "Muži": ["Muži A","Muži B"],
  "Mládež": ["Dorost U16","Dorost U17","Dorost U18","Dorost U19","Žáci U12","Žáci U13","Žáci U14","Žáci U15",
             "Přípravka U8","Přípravka U9","Přípravka U10","Přípravka U11","Školička",
             "Žákyně Mladší","Žákyně Starší","Žákyně Přípravka"],
  "Merch": ["Merch"], "Aplikace": ["Aplikace"], "Web": ["Web"],
  "Ticketing": ["Ticketing"], "Eventy": ["Eventy"], "Foto": ["Foto"]
};
const OTHER = ["Celý klub"];
const CATS = [...OTHER, ...Object.values(GROUPS).flat()];   // CATS[0] === "Celý klub"
const inGroup = (cat, g) => g === "Vše" || (GROUPS[g] || []).includes(cat);
```
„Celý klub" belongs to no group, so it only shows under „Vše".

**Category `<select>` with optgroups** (`catOptions`, used by the task form):
- `Muži`: Muži A, Muži B
- `Mládež`: the 16 youth categories, in the order above
- `Klub a služby`: Celý klub, Merch, Aplikace, Web, Ticketing, Eventy, Foto

Options carry no `value` attribute (value = text). If the stored category is not in the list (legacy), nothing is selected and the browser shows the first option.

### 4.2 Areas (member „Oblasti")
```js
const AREAS = ["Celý klub", ...Object.keys(GROUPS)];
// = Celý klub, Muži, Mládež, Merch, Aplikace, Web, Ticketing, Eventy, Foto
```
Unit name suggestions (datalist `#uSug`, deduped): `Celý klub, Muži, Mládež, Merch, Aplikace, Web, Ticketing, Eventy, Foto, Sociální sítě, Grafika, Video, Partneři`.

### 4.3 Colour palettes
```js
const AVC   = ["#0099cf","#00588e","#1b2341","#007fb4","#093f6b","#4fbde4","#63666b","#12304f"]; // automatic avatar fallback
const AVPAL = ["#0099cf","#4fbde4","#00588e","#093f6b","#1b2341","#63666b","#1f8a4c","#c62f28","#d98a00","#6b4fa8","#c4c8ce"]; // 11 picker swatches (profile + unit colour)
const LIGHT = new Set(["#c4c8ce"]);   // swatches that need dark (navy) text
const colorOf = id => user(id)?.color || AVC[Math.max(0, S.users.findIndex(u => u.id === id)) % AVC.length];
```
AVPAL names (for a11y/labels; the prototype uses the hex as `title`): blue, light blue, steel, dark steel, navy, grey, green, red, amber `#d98a00`, violet `#6b4fa8`, light grey `#c4c8ce` (navy text).

Note: AVC contains `#007fb4` and `#12304f`, which are **not** in AVPAL. A member with a fallback colour therefore opens the form with no swatch checked when its fallback is one of those two.

### 4.4 Print defaults
- Types: `["Letáky","Vizitky","Plakáty","Bannery","Roll-upy","Samolepky","Brožury"]`
- Columns (fixed): `p1 "Poptávka"`, `p3 "Ve výrobě"`, `p4 "Hotovo"` (the id `p2` was removed by the migration)

### 4.5 Default task columns
`Nápady, K řešení, Probíhá, Ke kontrole, Hotovo`. The **last column** in array order counts as „done" (muted due date; excluded from „řeší/vede/úkolů" counts).

### 4.6 Month names
```js
const MNAMES = ["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];
const monLab = m => { const [y, mo] = m.split("-"); return MNAMES[+mo - 1] + " " + y };   // "Říjen 2026"
```
(`renderTop` has an identical local copy, `MN`.)

### 4.7 Budget colour states
| value | label | colour |
|---|---|---|
| `"red"` | Na dluh | `#c62f28` |
| `"green"` | V budgetu | `#1f8a4c` |
| `""` | Budoucnost | `var(--fm-blue)` `#0099cf` |

Radio order in the form: red, green, "" (blue). Legend order: Na dluh, V budgetu, Budoucnost.

### 4.8 Colour values hard-coded in the prototype CSS
- Green (paid / V budgetu): `#1f8a4c`
- Red (owed / Na dluh / negative): `#c62f28`. Red in the header for a negative total: `#ff8a84`.
- Danger / validation red: `#b3261e`, with danger border `#e6b8b4` and danger hover bg `#fbeceb`. Late due: bg `#fbeceb`, fg `#b3261e`.
- Soon due: bg `#fff4dc`, fg `#8a5a00`.
- Modal overlay: `rgba(18,23,43,.55)`. Ghost shadow: `0 14px 32px rgba(27,35,65,.25)`.
- Tokens used: `--fm-navy --fm-blue --fm-steel --blue-050/100/200/500/800 --grey-050/100/200/300/400/500/600/700/800 --text-body --text-muted --text-on-dark-muted --border-on-dark`.

---

## 5. Helpers and formatting (verbatim)

```js
const uid = () => Math.random().toString(36).slice(2,10);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ini = n => n.split(/\s+/).map(w => w[0]).slice(0,2).join("").toUpperCase();     // "Petra Horáková" → "PH"
const kcs = n => (n||0).toLocaleString("cs-CZ").replace(/ /g," ") + " Kč";      // 25000 → "25 000 Kč", 0 → "0 Kč"
const priceOf = t => Number(String(t.price||"").replace(/[^\d]/g,"")) || 0;          // the only digit-stripping parse
const fmtKc = v => { const n = Number(String(v).replace(/[^\d]/g,"")); return n ? n.toLocaleString("cs-CZ").replace(/ /g," ") + " Kč" : esc(v) };
       // used for the member budget tag: falls back to the RAW text when it contains no digits
const cbNum = v => Number(String(v||"").replace(/[^\d]/g,"")) || 0;
const cbFmt = n => n ? n.toLocaleString("cs-CZ").replace(/ /g," ") : "";          // 0 → "" (the input then shows placeholder "0")
const fmtSize = b => b > 1048576 ? (b/1048576).toFixed(1).replace(".",",") + " MB" : Math.max(1, Math.round(b/1024)) + " kB";
```
- **Number parsing** strips every non-digit, so `"4 500 Kč"` → 4500, `"1,5"` → 15, and negatives are impossible. The new app should store integers. Inputs accept free text and you save `parseInt(v.replace(/\D/g,''))`.
- **Thousand separator:** cs-CZ outputs U+00A0, which is replaced by a normal space. Newer ICU builds may emit U+202F, so use `/[  ]/g` or `/\s/g`. Beware SSR/CSR hydration differences with `Intl`, and format on the client or with the same ICU.
- **Dates:** `toLocaleDateString("cs-CZ")` → `13. 10. 2026`. Short form: `{day:"numeric",month:"numeric"}` → `13. 10.`.
- **Signed Kč (budget box):** `k = n => (n<0?"−":"") + (Math.abs(n) ? cbFmt(Math.abs(n)) : "0") + " Kč"`. The minus sign is U+2212.
- **Thousands in the chart label:** `nf(Math.round(s/100)/10).replace(",0","") + " tis."` → 4500 → `4,5 tis.`, 12000 → `12 tis.`, where `nf = n => n.toLocaleString("cs-CZ").replace(/ /g," ")`.

---

## 6. Header

- `.top`: navy background, white text, `display:flex; align-items:center; gap:20px; padding:12px 28px; flex-wrap:wrap`.
- Logo: `.brand img` is 40px high. Title `h1`: 22px, weight 900, `letter-spacing:-.02em`, UPPERCASE, `line-height:1`, text `Marketingový plán úkolů`.
- **Tabs** `#tabs`. Clicking a tab: if the yearly report is open, `close()` it; then set `S.view = data-view`, `save()`, `render()`.
- **Identity** `#me`: `<select>` of all users (`value=id`, text=name, selected = `S.me`). Its label `Přihlášen` is hidden on mobile. Changing it sets `S.me`, `save()`, `renderBoard()`. The style is a dark select (`--blue-800` bg, `--border-on-dark`, 40px min height).
- **`#btnNew`** (`.btn.primary`): text `+ Nový úkol` on Úkoly and Struktura týmu, `+ Nová tiskovina` on Tiskoviny. On click: if the view is `org`, switch to `board` first (save + render). Then `openTask(null, BK().cols[0]?.id)` opens a new item in the **first** column of the current board.

### 6.1 Buttons (`.btn`)
Inline-flex, radius 3px, `padding:0 16px`, 40px min height, 13px/700, `letter-spacing:.06em`, UPPERCASE, `nowrap`, `:active` moves it 1px down.

| Variant | Background | Text / border | Hover |
|---|---|---|---|
| `primary` | blue | white | `--blue-500` |
| `ghostd` (unused) | transparent | white, `--border-on-dark` | — |
| `outline` | white | navy, `--grey-300` border | navy border |
| `danger` | transparent | `#b3261e`, `#e6b8b4` border | `#fbeceb` bg |

---

## 7. Tab „Úkoly" (`S.view === "board"`)

### 7.1 Filter bar (`.bar` > `.sub`, L402–409)
```html
<select class="search fsel" id="grp" aria-label="Filtr kategorie"></select>
<select class="search fsel" id="mon" aria-label="Filtr měsíce"></select>
<input class="search" id="q" type="search" placeholder="Hledat v úkolech…">
<label class="tog"><input type="checkbox" id="mine"> Jen moje úkoly</label>
<div class="hint">Karty přetahujte myší nebo podržením prstu</div>
```
- **Group** `#grp` options: `["Vše", ...Object.keys(GROUPS)]`, each labelled `"{g} ({count})"` with `value=g`. `count = S.tasks.filter(t => inGroup(t.cat, g)).length`, which counts **all tasks** regardless of month, search or „mine". Changing it sets `S.filter`, then `save()`, `render()`.
- **Month** `#mon` (algorithm in §7.6). Changing it sets `S.month`, then `save()`, `render()`.
- **Search** `#q`, on `input`: `S.q = value; renderBoard()` (not saved).
- **Jen moje úkoly** `#mine`: `S.mine = checked; save(); renderBoard()`. Its checked state comes from `S.mine` on every `renderTop`.
- `.hint` is right-aligned (`margin-left:auto`) and hidden on mobile.
- The `.search`/`.fsel` style: 40px min height, `--grey-050` background (white for `.fsel`), 200px min width for selects, `max-width:360px` and `flex:1 1 220px` for the search input. Focus: `outline:2px solid var(--blue-200)`, white background.

### 7.2 `visible(t)` for tasks (L471–475)
```
if (!inGroup(t.cat, S.filter)) return false
if (S.month && S.month !== "all") {
  if (S.month === "none") { if (t.due) return false }
  else if (!t.due || t.due.slice(0,7) !== S.month) return false
}
if (S.mine && t.lead !== S.me && t.owner !== S.me) return false
if (S.q) { q = S.q.toLowerCase(); if (!(t.title+" "+t.desc+" "+t.cat).toLowerCase().includes(q)) return false }
return true
```

### 7.3 Board (`renderBoard`, L500)
```html
<main class="board" id="board">           <!-- .pboard added in print mode -->
  <section class="col" data-col="{colId}">
    <div class="colh">
      <span class="t" contenteditable="true" spellcheck="false" data-rename="{colId}">{title}</span>
      <span class="c">{visibleCount}</span>
      <!-- print only: --> <span class="sum">{kcs(sum of visible prices)}</span>
      <!-- tasks only: --> <button class="x" data-delcol="{colId}" title="Smazat sloupec">×</button>
    </div>
    <div class="list" data-list="{colId}">
      {cards… | <div class="empty-col">Žádné úkoly</div>  (print: "Žádné tiskoviny")}
    </div>
    <button class="add" data-addto="{colId}">+ Přidat úkol</button>   <!-- print: "+ Přidat tiskovinu" -->
  </section>
  …
  <button class="addcol" id="addCol">+ Sloupec</button>                <!-- tasks only -->
</main>
```
- `.board`: `flex:1; display:flex; gap:14px; padding:16px 20px 20px; overflow-x:auto; overflow-y:hidden`. Columns stretch to the full height, and each `.list` scrolls vertically.
- `.col`: `flex:1 0 280px; max-width:420px` (print: `max-width:none`, so the columns fill the width), `--grey-100` background, radius 6px.
- `.colh::before` draws a 4×16px blue bar. `.colh .t` is 13px/800, `.1em` letter spacing, UPPERCASE, navy, and gets a white background plus a `--blue-200` ring on focus.
- **The count** `.c` is the number of **visible** (filtered) tasks in the column.
- **`scrollLeft` is preserved** across re-renders.
- Clicks are handled by delegation on `#board` and ignored for 50ms after a drag (`dragJustEnded`):
  - `[data-addto]` → `openTask(null, colId)`.
  - `[data-delcol]`:
    - If `cols.length <= 1`: `alert("Musí zůstat alespoň jeden sloupec.")`.
    - `n` = the number of **all** tasks in the column (filters ignored). If `n > 0`: `confirm("Sloupec obsahuje ${n} úkolů. Přesunout je do prvního sloupce a sloupec smazat?")`. Cancel aborts.
    - Remove the column. Every task with `col === id` moves to `cols[0]` (the first column **after** removal), then `save()`, `renderBoard()`.
  - `#addCol` → `prompt("Název sloupce","Nový sloupec")`. If the result is truthy, push `{id:uid(), title:t.trim()}`, `save()`, render, and scroll the board fully right (`setTimeout(…,0)`). Edge case: entering only spaces creates a column with an empty title.
  - `.card` → `openTask(card.dataset.id)`.
- **Column rename:** `keydown` Enter on `[data-rename]` → `preventDefault()` + `blur()`. `focusout` → trimmed text. Non-empty saves `c.title`; empty restores the old title. Then `save()`. *(Note: the prototype leaves column titles contenteditable on the print board as well — see §19.)*

### 7.4 Task card (`cardHTML`, tasks mode)
```html
<div class="card" data-id="{id}">
  <span class="cat">{cat}</span>
  <h3>{title}</h3>
  <p>{desc}</p>                                            <!-- only if desc; clamped to 2 lines -->
  <div class="ft">
    <span class="ppl">{av(lead, lead=true)}{av(owner)}</span>
    {dueHTML}                                              <!-- only if due -->
    <span class="att">Přílohy {n}</span>                   <!-- only if n = files.length + links.length > 0; margin-left:auto -->
  </div>
</div>
```
- `.card`: white, 1px `--grey-200` border, radius 6px, `padding:12px 12px 10px`, `cursor:grab`, `user-select:none`, `-webkit-touch-callout:none`, column flex with `gap:6px`. Hover: `--grey-300` border plus a soft shadow.
- `.cat`: 10px/700, `.12em` letter spacing, UPPERCASE, `--blue-050` background, steel text, radius 3px.
- `h3`: 15px/700, navy. `p`: 13px, `--grey-600`, `-webkit-line-clamp:2`.
- **Avatar `av(id, lead)`:**
  - 26px circle, initials 10px/800, `background: colorOf(id)`. Text is white, or navy when the colour is in `LIGHT`.
  - Lead: `.av.lead` adds a ring `box-shadow:0 0 0 2px #fff,0 0 0 3.5px var(--fm-navy)`.
  - Tooltip: `Vedoucí: {name}` / `Zodpovědný: {name}`.
  - Unassigned (or deleted user): `<span class="av empty[ lead]" title="Vedoucí: nepřiřazeno">–</span>` (or `Zodpovědný: nepřiřazeno`) with a grey background.
  - Both avatars always render, even when empty.

### 7.5 Due-date badge (`dueHTML`, L492)
```js
if (!t.due) return "";
d = new Date(t.due + "T00:00:00");  now = new Date(); now.setHours(0,0,0,0);
diff = Math.round((d - now) / 864e5);
last = BK().cols[BK().cols.length-1]?.id === t.col;        // last column of the CURRENT board
cls  = last ? "done" : diff < 0 ? "late" : diff <= 3 ? "soon" : "";
txt  = diff === 0 ? "Dnes" : diff === 1 ? "Zítra" : d.toLocaleDateString("cs-CZ",{day:"numeric",month:"numeric"});   // "15. 10."
title= "Termín dokončení: " + d.toLocaleDateString("cs-CZ") + (!last && diff < 0 ? " — po termínu" : "");
→ <span class="due {cls}" title="{title}">{txt}</span>
```
| Class | Background | Text |
|---|---|---|
| (default) | `--grey-100` | `--grey-700` |
| `.soon` (0–3 days) | `#fff4dc` | `#8a5a00` |
| `.late` | `#fbeceb` | `#b3261e` |
| `.done` | `--grey-100` | `--grey-500` |

Yesterday or older shows the date (there is no „Včera"). The print board uses the same function, so its last column is „Hotovo" and the title still says „Termín dokončení".

### 7.6 Month filter options (tasks, L479–485)
```js
set = new Set();
for (i = -1; i < 12; i++) { d = new Date(now.getFullYear(), now.getMonth()+i, 1); set.add(YYYY-MM) }   // previous + current + 11 next = 13 months
S.tasks.forEach(t => t.due && set.add(t.due.slice(0,7)));                                           // + every month any task is due (ALL tasks)
ms = [...set].sort();                                                                               // lexicographic = chronological
count(m) = S.tasks.filter(t => inGroup(t.cat, S.filter) && t.due && t.due.slice(0,7) === m).length  // respects the GROUP filter only
options: <option value="all">Všechny měsíce</option>
         ms.map(m => <option value=m>{monLab(m)}{count ? ` (${count})` : ""}</option>)               // e.g. "Říjen 2026 (3)"
         <option value="none">Bez termínu</option>
```
No count is shown on „Všechny měsíce" or „Bez termínu". The selection is `S.month || "all"`.

### 7.7 Drag & drop of cards (mouse + touch, L643–691)

State `D = {card, id, x0, y0, x, y, touch, active, dx, dy, ghost, list}`. Module flags: `dragJustEnded`, `pressTimer`, `raf`.

**Start**
- `pointerdown` on `#board`: find `.card` (ignore if there is none or `e.button > 0`). Set up `D`. `touch = e.pointerType !== "mouse"` (so pen counts as touch).
- Touch: `pressTimer = setTimeout(220ms → if (D && !D.active) { startDrag(); navigator.vibrate?.(15) })`.
- Document `pointermove` (registered with `{passive:false}`):
  - Update `D.x/y`; `dist = hypot(x-x0, y-y0)`.
  - Before activation: touch with `dist > 8` cancels (clear the timer, `D = null`, so a scroll gesture wins); mouse with `dist > 5` calls `startDrag()`. Return.
  - When active: `e.preventDefault(); moveDrag()`.
- Document `touchmove` (passive:false): `preventDefault()` while active, which blocks page scroll.
- Document `contextmenu`: `preventDefault()` while active, which suppresses the long-press menu.
- `pointerup` → `endDrag()`. `pointercancel` → `endDrag()` if active, else clear the timer and set `D = null`.

**`startDrag()`**
```
r = card.getBoundingClientRect(); D.dx = x0 - r.left; D.dy = y0 - r.top;
ghost = card.cloneNode(true); ghost.classList.add("ghost"); ghost.style.width = r.width + "px"; body.appendChild(ghost)
card.classList.add("ph")            // the original stays in the DOM as the placeholder (opacity .35, dashed blue border)
D.active = true; body.classList.add("dragging")   // forces cursor:grabbing everywhere
moveDrag(); raf = requestAnimationFrame(autoScroll)
```
`.ghost` is `position:fixed; left:0; top:0; z-index:100; pointer-events:none`, with shadow `0 14px 32px rgba(27,35,65,.25)`, blue border and `cursor:grabbing`.

**`moveDrag()`**
```
ghost.style.transform = `translate(${x-dx}px, ${y-dy}px) rotate(2deg)`
col = document.elementFromPoint(x, y)?.closest(".col")
remove .over from other columns; if (!col) return;            // the placeholder stays where it was
col.classList.add("over")      // --blue-050 bg + inset 2px --blue-200 ring
D.list = col.querySelector(".list"); remove its ".empty-col" if present
cards = [...list.querySelectorAll(".card:not(.ph)")]
before = cards.find(c => y < c.rect.top + c.rect.height/2)     // first card whose vertical midpoint is below the pointer
if (before) { if (before.previousElementSibling !== D.card) list.insertBefore(D.card, before) }
else if (list.lastElementChild !== D.card) list.appendChild(D.card)
```
The placeholder moves **live**, so the order shown during the drag is the final order.

**`autoScroll()`** (rAF loop while active)
- Horizontal: if `x < board.left + 60`, `board.scrollLeft -= 12`; if `x > board.right - 60`, `+= 12` (12px per frame).
- Vertical, inside the current list: if `y < list.top + 40`, `list.scrollTop -= 10`; if `y > list.bottom - 40`, `+= 10`.
- Calls `moveDrag()` and loops.

**`endDrag()`**
```
clearTimeout(pressTimer); if (!D) return; if (!D.active) { D = null; return }      // a plain click falls through to the click handler
cancelAnimationFrame(raf); ghost.remove(); body.classList.remove("dragging"); clear .over
list = card.parentElement; colId = list.dataset.list; next = card.nextElementSibling
t = task(D.id); tasks = tasks without t; t.col = colId
i = next?.dataset.id ? tasks.findIndex(x => x.id === next.dataset.id) : -1
if (i < 0) { last = index of last task with col === colId (or -1); i = (last + 1) || tasks.length }   // NB: last=-1 → 0 → falsy → append at array end
tasks.splice(i, 0, t)
D = null; dragJustEnded = true; setTimeout(() => dragJustEnded = false, 50)        // suppresses the click that follows pointerup
save(); render()
```
- Order is **global array order**. With filters active, only visible neighbours define the insert position (the item goes before the next visible card, or after the last task of that column, hidden ones included).
- For the DB: compute `sort_order` from the visible `next` card (before_id), or append to the end of the column.

---

## 8. Task / print item modal (`openTask(id, colId)`, L701)

### 8.1 Generic modal shell (`shell(title, body, foot)`, L696)
```html
<div class="ov" id="ov">
  <div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><h2>{title}</h2><button class="close" data-close aria-label="Zavřít">×</button></div>
    {body /* <div class="mb">…</div> */}
    <div class="mf">{foot}</div>
  </div>
</div>
```
- `.ov` is a fixed overlay, `rgba(18,23,43,.55)`, centred at the top with `padding:5vh 16px`, and scrolls (`overflow-y:auto`). `.modal` is white, radius 6px, `max-width:720px`, shadow `0 24px 60px rgba(0,0,0,.3)`.
- `.mh`: `h2` is 18px/900, UPPERCASE, navy. `.close` is 44×44 with a 24px glyph.
- `.mb`: a 2-column grid (`gap:16px; padding:20px 24px`). `.f` is a field (label above control). `.f.w` spans the full width.
- `.f label, .lbl`: 11px/700, `.12em` letter spacing, UPPERCASE, `--grey-600`. `.req` (asterisk) is blue.
- Inputs: 1px `--grey-300` border, radius 3px, `padding:10px 12px`, 44px min height, 15px font. Textareas: 120px min height, vertical resize. Focus: 2px `--blue-200` outline plus blue border.
- `.mf` footer: flex, `gap:10px`, wraps. `.meta` (12px grey) gets `margin-right:auto`.
- **Closing:**
  - `pointerdown` on the overlay itself (`e.target === ov`).
  - The `×` button.
  - A `[data-close2]` button (Zrušit / Hotovo).
  - A document `keydown` `Escape` (`escKey`, removed in `close()`).
  - **There is no unsaved-changes guard.** `close()` empties `#modalRoot`.
- Only one modal can be open at a time (`#modalRoot.innerHTML` is replaced).

### 8.2 Initial object
`ex` = the existing item from the current board (`BK()` = `S` or `S.pr`). Editing works on a **deep copy** `T = JSON.parse(JSON.stringify(ex))`, so attachment edits only apply on Save. A new item:
```js
{ id: uid(), col: colId || BK().cols[0].id, price: "",
  cat: P ? (S.prFilter !== "Vše" ? S.prFilter : S.pr.types[0] || "")       // print: active type filter or the first type
         : (S.filter !== "Vše" ? GROUPS[S.filter][0] : CATS[0]),          // tasks: FIRST category of the active group, else "Celý klub"
  title: "", desc: "", lead: "", owner: "", due: "", files: [], links: [], createdBy: S.me, createdAt: Date.now() }
```

### 8.3 Fields, in DOM order (2-column grid)

| # | Tasks | Print | Width |
|---|---|---|---|
| 1 | `Kategorie` — select `#fCat` with optgroups (§4.1) | `Typ média` — select `#fCat`, options = unique `[...S.pr.types, T.cat]` (keeps an orphan type) | ½ |
| 2 | `Stav` — select `#fCol` of the board's columns (`value=id`) | same | ½ |
| 3 | `Název úkolu *` — `#fTitle`, placeholder `Např. Plakát na domácí zápas` | `Název *`, placeholder `Např. Letáky na nábor, 500 ks` | ½ |
| 4 | `Předpokládaný termín dokončení` — `#fDue type=date` | `Datum realizace` | ½ |
| 5 | `Popis` — `#fDesc` textarea, placeholder `Co je potřeba udělat, termíny, formáty…` | same | full |
| 6 | `Zodpovědný vedoucí` — `#fLead` select: `<option value="">— nevybráno —</option>` + users | `Počet ks` — `#fQty inputmode=numeric`, placeholder `Např. 500` | ½ |
| 7 | `Zodpovědný za úkol` — `#fOwner` (same options) | `Cena (Kč)` — `#fPrice inputmode=numeric`, placeholder `Např. 4 500` | ½ |
| 7b | — | `Zaplaceno FK FM` (`span.lbl`) + `.budc` radio group `name=fPaid`: `Ano` (green dot `#1f8a4c`, value `ano`) / `Ne` (red dot `#c62f28`, value `ne`). Checked: `ano` if `T.paid==="ano"`, else `ne` (default Ne). | ½ |
| 8 | `Přílohy a odkazy` (`span.lbl`) + attachment box (§8.4) | same | full |

`.budc` radio chips are hidden native inputs; the label is 44px tall with a 14px dot. Checked state: navy border plus an inset 1px navy shadow (`label:has(input:checked)`).

### 8.4 Attachments box
```html
<div class="attbox">
  <div class="items" id="items">
    <!-- file with data -->   <div class="item"><span class="ty">Soubor</span><a href="{dataURL}" download="{name}">{name}</a><span class="sz">{fmtSize}</span><button data-rf="{i}" aria-label="Odebrat">×</button></div>
    <!-- file w/o data -->    <span class="nm" title="Soubor je příliš velký pro uložení v prohlížeči — uložen jen název">{name}</span> (instead of <a>)
    <!-- link -->             <div class="item"><span class="ty l">Odkaz</span><a href="{url}" target="_blank" rel="noopener">{label || url}</a><button data-rl="{i}" aria-label="Odebrat">×</button></div>
  </div>
  <label class="drop" id="drop"><input type="file" id="fFile" multiple hidden>Přetáhněte soubory sem nebo <b>vyberte ze zařízení</b></label>
  <div class="attrow">
    <input id="lUrl" type="url" inputmode="url" placeholder="https://…">
    <input id="lLabel" placeholder="Popisek (nepovinné)">
    <button class="btn outline" id="lAdd" type="button">Přidat odkaz</button>
  </div>
</div>
```
- Files are listed first, then links. `.ty` is steel for „Soubor" and blue (`.ty.l`) for „Odkaz".
- File input change → `addFiles(files)`, then reset the input value. The drop zone handles `dragover` (adds `.on`: blue border, `--blue-050` background), `dragleave` and `drop`.
- `addFiles`: for each file, keep `meta = {name, size, type}`. Files **> 1.5 MB** (`1.5*1048576`) get the meta only. Smaller files are read with `FileReader.readAsDataURL`, which sets `meta.data`. → **New app:** upload to Storage. The size limit no longer applies, but keep the „Soubor" row UI.
- `addLink`: trim the URL; if it is empty, do nothing. If it does not match `/^[a-z]+:\/\//i`, prepend `https://`. Push `{url, label: lLabel.trim()}`, then clear both inputs. Enter in `#lUrl` also adds the link (with `preventDefault`).
- Removing items (×) only changes the working copy.

### 8.5 Footer
```
<span class="meta">{ex && creator exists ? `Založil(a) ${creator.name}, ${new Date(createdAt).toLocaleDateString("cs-CZ")}` : ""}</span>
{ex ? <button class="btn danger" id="del">Smazat</button><button class="btn outline" id="dup">Duplikovat</button> : ""}
<button class="btn outline" data-close2>Zrušit</button>
<button class="btn primary" id="ok">{ex ? "Uložit" : P ? "Přidat tiskovinu" : "Vytvořit úkol"}</button>
```
Modal title: tasks `Úkol` / `Nový úkol`; print `Tiskovina` / `Nová tiskovina`.

- **Save** (`#ok`):
  - The title is required. If it is empty, focus it and set `style.borderColor = "#b3261e"`, then stop.
  - Otherwise assign `cat, col, desc(trim), due`. Tasks also get `lead, owner`. Print items get `qty(trim), price(trim), paid (checked radio || "ne")`.
  - Replace the item in place (existing) or **push it to the end of the array** (new, so it lands at the bottom of its column). Then `save(); close(); render()`.
  - There is no Enter-to-submit (no `<form>`).
- **Delete:** `confirm("Opravdu smazat úkol?")` (print: `confirm("Opravdu smazat tiskovinu?")`) → remove it, save, close, render.
- **Duplicate:**
  - Deep-copies the **stored** original `ex`. Unsaved edits in the open form are discarded.
  - The copy gets `id: uid()`, `title: ex.title + " (kopie)"`, `createdBy: S.me`, `createdAt: now`. Files and links are copied too.
  - It is inserted at `indexOf(ex)+1` (right after the original, same column). Then `save(); close(); render(); openTask(copy.id)` opens the copy.
- A new item's title input is focused after 30ms.

---

## 9. Tab „Tiskoviny" (`S.view === "print"`, `BK() = S.pr`)

### 9.1 Filter bar `#pbar` (L410–415)
```html
<select class="search fsel" id="ptype" aria-label="Filtr typu média"></select>
<select class="search fsel" id="pmon" aria-label="Měsíc"></select>
<input class="search" id="pq" type="search" placeholder="Hledat v tiskovinách…">
<button class="btn outline" id="btnTypes" type="button">Typy médií</button>
<button class="btn outline" id="btnYear" type="button">Uzavřít rok</button>
<div class="ptot"><span id="ptotL">Celkem</span> <b id="ptot"></b></div>
```
- **Type** `#ptype`: `["Vše", ...types]`. The label is `Všechny typy ({n})` for „Vše", else `{type} ({n})`, where `n` = all print items of that type (**archived included**). Changing it sets `S.prFilter`, `save()`, `renderPbar()`, `renderBoard()`.
- **Month** `#pmon` (`renderPbar`, L511–514):
  ```
  for (i = -2; i < 6; i++) add month(now + i)          // 2 previous + current + 5 next = 8 months   (≠ tasks: −1..+11)
  + every month any print item has a due in (archived included)
  sorted; label = monLab(m) + (sum ? " · " + kcs(sum) : "")   // e.g. "Říjen 2026 · 4 500 Kč"
  sum(m) = Σ priceOf over items matching the type filter with due in m (archived included)
  options: all "Všechny měsíce" … "none" "Bez termínu"
  ```
  Changing it sets `S.prMonth`, `save()`, `renderBoard()`.
- **Search** `#pq`: `S.pq = value; renderBoard()`.
- **`.ptot`** red total box: `margin-left:auto`, background `#c62f28`, `padding:8px 14px`. The label span is 11px/700 UPPERCASE, white at 85% opacity. `b` is 20px/900 white.
  - Label: `Celkem` (all months), `Celkem bez termínu` (none), else `"Celkem za " + monLab(pm)` → `Celkem za Říjen 2026`. The code lowercases the label and then capitalises the first letter, so the result is unchanged.
  - Value: `kcs(Σ priceOf(visible items))`.

### 9.2 `visible(t)` in print mode (L469–470)
```
if (t.arch) return false
if (S.prFilter !== "Vše" && t.cat !== S.prFilter) return false
month filter on t.due with S.prMonth (same logic as tasks)
search S.pq over title + " " + desc + " " + cat
```
There is no „mine" filter and no group logic.

### 9.3 Board differences
- Board classes: `.board.pboard`, columns use `max-width:none` (fill the width).
- The column header shows `.sum` = `kcs(Σ prices of visible items in the column)` (`margin-left:auto`). There is no delete `×` and no `+ Sloupec`.
- Empty column text: `Žádné tiskoviny`. Add button: `+ Přidat tiskovinu`.
- Drag & drop is identical (§7.7) and operates on `S.pr.tasks`.

### 9.4 Print card
```html
<div class="card" data-id>
  <span class="cat">{type}</span><h3>{title}</h3>{desc ? <p>…</p> : ""}
  <div class="ft">
    {qty ? <span class="qty">{Number(qty digits).toLocaleString cs-CZ} ks</span> : ""}   <!-- "500 ks"; navy 12px/800 on --grey-100 -->
    {dueHTML}
    {n ? <span class="att">Přílohy {n}</span> : ""}
    {price ? <span class="price paid|owed" title="Zaplatil FK FM|Dluží FK FM">{kcs(price)}</span>
           : <span class="price none">Bez ceny</span>}
  </div>
</div>
```
- `.price`: 12px/800 white, `padding:3px 10px 3px 8px`, `clip-path:polygon(0 0,100% 0,calc(100% - 7px) 100%,0 100%)` (slanted right edge), `margin-left:auto` (`.att + .price` resets the margin to 0 so it sits next to the attachments count).
- Colours: `.paid` → `#1f8a4c`, `.owed` → `#c62f28`, `.none` → `--grey-200` background with `--grey-600` text.
- `.ft` wraps (`row-gap:6px`), and every chip is `nowrap`.
- Edge case: a truthy `qty` with no digits renders `0 ks`.

### 9.5 „Typy médií" modal (`openTypes`, L747)
- Title `Typy médií`. Body:
  - A list `#tl` of rows: `<div class="urow trow"><input data-ti="{i}" value="{type}"><span class="n">{n} položek</span><button class="btn outline" data-td="{i}">Smazat</button></div>`, where `n` counts all items of that type, archived included.
  - Then the field `Nový typ`: input `#tNew` (placeholder `Např. Pozvánky`) + `btn primary` `Přidat`.
- Footer: meta `Přejmenování se propíše do všech tiskovin.` + `btn outline [data-close2]` `Hotovo`.
- **Rename** fires on the input's `change` event (blur or Enter):
  - `v = trim`. If `v` is empty, or it duplicates another type, revert silently.
  - Otherwise `types[i] = v`, every item with `cat === old` gets `cat = v`, and `prFilter` follows if it equalled `old`. Then save, redraw, render.
- **Delete:**
  - If `types.length <= 1`: `alert("Musí zůstat alespoň jeden typ.")`.
  - `rest` = types without i. If n > 0: `confirm("Typ „${t}“ používá ${n} tiskovin. Přesunout je pod „${rest[0]}“ a typ smazat?")`.
  - Move the items to `rest[0]` (the first *remaining* type), `types = rest`, then save, redraw, render.
- **Add:** with an empty value, refocus. If the type is not already present, push it (duplicates are ignored silently). Clear, save, redraw, render, refocus. Enter in `#tNew` also adds.

### 9.6 Yearly report „Uzavřít rok" (`openYear(y)`, L760–797)

Rendered into `#modalRoot` as a full-screen overlay `.yv#yv`:
- `position:fixed; inset:0; z-index:150; background: --grey-050`.
- Then `yv.style.top = header.getBoundingClientRect().bottom + "px"`, so it sits **below the main header**, which keeps the tabs usable. A tab click closes it.
- `Escape` closes it (`escKey`).

**Data**
```js
years = unique(+t.due.slice(0,4) for print items with due)  ∪ {currentYear}, sorted DESC      // archived included
y     = y || currentYear
closed = S.pr.closed[y]                                       // ms timestamp | undefined
its   = S.pr.tasks.filter(t => t.due && +t.due.slice(0,4) === y)   // archived AND active items of that year
noDate= S.pr.tasks.filter(t => !t.due && !t.arch).length            // NOT year-specific
num   = v => Number(String(v||"").replace(/[^\d]/g,"")) || 0
tot   = Σ priceOf(its); paid = Σ priceOf(its where paid==="ano"); owed = tot - paid; ks = Σ num(qty)
months= MNAMES.map((n,i) => { m = `${y}-${pad(i+1)}`; l = its with due in m; s = Σ price(l); p = Σ price(l paid); return {n, l, s, p, o: s-p} })
maxM  = Math.max(1, ...months.s); active = months with s>0 count
top   = months.reduce((a,m) => m.s > a.s ? m : a, months[0])      // first max wins
types = group its by (cat || "—"): {s: Σ price, n: count, ks: Σ qty}; tl = entries sorted by s DESC; maxT = Math.max(1, ...s)
pct   = tot ? Math.round(paid/tot*100) : 0
```

**DOM**
```html
<div class="yv" id="yv">
  <div class="bar yv-bar"><div class="sub">
    <button class="btn outline" id="yvBack">← Zpět na tiskoviny</button>
    <h2 class="yv-t">Roční přehled tiskovin</h2>                         <!-- blue 4×18 bar ::before -->
    <select class="search fsel" id="yrSel" aria-label="Rok" style="min-width:110px">{years}</select>
    {closed ? <span class="yv-st">Uzavřeno {toLocaleDateString cs-CZ}</span> : ""}   <!-- green, uppercase -->
    <span class="yv-sp"></span>                                           <!-- spacer margin-left:auto -->
    <button class="btn outline" id="yrPrint">Tisk / PDF</button>
    {closed ? <button class="btn outline" id="yrOpen">Znovu otevřít</button>
            : <button class="btn primary" id="yrClose" [disabled if its.length===0]>Uzavřít rok {y}</button>}
  </div></div>
  <div class="yv-b">                                   <!-- 12-col grid, gap 16, padding 24px 28px 40px, scrolls -->
    <section class="yv-kpi">                           <!-- 4 equal columns -->
      <div class="kp main"><span>Celkem utraceno</span><b>{kcs(tot)}</b><i>{its.length} položek · {nf(ks)} ks</i></div>
      <div class="kp"><span>Zaplatil FK FM</span><b class="g">{kcs(paid)}</b><div class="kbar"><em style="width:{pct}%"></em></div><i>{pct} % z celku</i></div>
      <div class="kp"><span>Dluží FK FM</span><b class="r">{kcs(owed)}</b><div class="kbar r"><em style="width:{tot?100-pct:0}%"></em></div><i>{tot?100-pct:0} % z celku</i></div>
      <div class="kp"><span>Průměr na aktivní měsíc</span><b>{kcs(active ? Math.round(tot/active) : 0)}</b><i>{top.s ? "Nejvíc: " + top.n.toLowerCase() + " · " + kcs(top.s) : "—"}</i></div>
    </section>
    <section class="yv-card yv-chart">                 <!-- grid-column: span 8 -->
      <div class="yv-ch"><h2>Útrata po měsících</h2><div class="lg"><span><i class="g"></i>Zaplatil FK FM</span><span><i class="r"></i>Dluží FK FM</span></div></div>
      <div class="cols">                               <!-- 12-col grid, height 240px, bars aligned to bottom -->
        <div class="mc" title="{n}: {kcs(s)}">
          <span class="v">{s ? nf(Math.round(s/100)/10).replace(",0","") + " tis." : ""}</span>
          <div class="st" style="height:{s/maxM*100}%"><em class="r" style="flex:{o}"></em><em class="g" style="flex:{p}"></em></div>   <!-- red on TOP, green bottom -->
          <span class="l">{n.slice(0,3)}</span>          <!-- Led Úno Bře Dub Kvě Čer Čer Srp Zář Říj Lis Pro -->
        </div> ×12
      </div>
    </section>
    <section class="yv-card yv-types"><h2>Podle typu média</h2>    <!-- span 4 -->
      {tl.map: <div class="tr"><div class="tn"><b>{type}</b><span>{n}× · {nf(ks)} ks</span></div><div class="tb"><em style="width:{s/maxT*100}%"></em></div><span class="tv">{kcs(s)}</span></div>}
      || <p class="yv-e">Žádná data</p>
    </section>
    <section class="yv-card yv-list"><h2>Soupis položek</h2>        <!-- full width -->
      {months with items: <div class="yv-m"><div class="yv-mh"><b>{Měsíc}</b><span class="o">{o ? "dluh " + kcs(o) : ""}</span><span>{kcs(s)}</span></div>
                           {rows: <div class="yv-r"><span class="nm">{title}</span><span class="ty">{cat}</span><span class="q">{qty>0 ? nf(qty)+" ks" : ""}</span><span class="pr[ ok]">{kcs(price)}</span></div>}</div>}
      || <p class="yv-e">V roce {y} nejsou žádné tiskoviny s datem realizace.</p>
      {noDate && !closed ? <p class="yv-e">{noDate} tiskovin nemá vyplněné datum realizace, a proto v přehledu nejsou.</p> : ""}
    </section>
  </div>
</div>
```
- Rows keep array order within each month. The price is red (`.pr`) or green (`.pr.ok`) when paid.
- `.yv-r` grid: `minmax(0,1fr) 140px 90px 110px`.
- Card styles:
  - `.kp`: white, radius 6px, `padding:18px 20px`, label 11px/700 UPPERCASE grey, value 30px/900 navy (`.g` green, `.r` red), sub-text 12px.
  - `.kp.main`: navy background, `--blue-200` label, white 36px value.
  - `.kbar`: 6px track on `--grey-100`, filled with green (or red for `.r`).
  - `.yv-card h2`: 13px/800, `.12em` letter spacing, UPPERCASE, with a 4×14px blue bar.
  - `.tb`: 8px track, blue fill.

**Actions**
- `#yvBack` → `close()`.
- `#yrSel` change → `openYear(+value)` (full re-render).
- `#yrPrint` → `window.print()`.
- `#yrClose` → `confirm("Uzavřít rok ${y}? ${its.length} položek za ${kcs(tot)} se přesune do archivu.")`. On OK: every item in `its` gets `arch = true`, `S.pr.closed[y] = Date.now()`, then save, `render()`, `openYear(y)`.
- `#yrOpen` (**no confirm**): `delete t.arch` for every item in `its`, `delete S.pr.closed[y]`, then save, render, `openYear(y)`.
- Archived items disappear from the board, but the yearly report and the filter counts/sums still include them.

---

## 10. Tab „Struktura týmu" (`S.view === "org"`)

### 10.1 Section header (L417)
```html
<main class="org" id="org">                 <!-- flex:1; overflow:auto; padding:24px 28px 40px; position:relative -->
  <div class="orgh">                        <!-- flex, align-items:flex-end, gap 16, wrap, margin-bottom 28 -->
    <div><div class="kick">Marketingový tým</div><h2>Struktura týmu</h2></div>     <!-- kick: blue 11px uppercase + 4×14 bar; h2 30px/900 uppercase -->
    <div class="legend" aria-label="Vysvětlivky k barvám budgetu">
      <span class="lg-t">Budget</span>
      <span><i style="background:#c62f28"></i>Na dluh</span>
      <span><i style="background:#1f8a4c"></i>V budgetu</span>
      <span><i style="background:var(--fm-blue)"></i>Budoucnost</span>
    </div>                                  <!-- margin-left:auto; white box, 1px grey border, 40px min height; dots 10px -->
    <div class="obtns"><button class="btn outline" id="addUnit">+ Kategorie</button><button class="btn primary" id="addMember">+ Přidat člena</button></div>
  </div>
  <section class="curbud" id="curBud"> … §10.2 … </section>
  <div class="rootzone" id="rootZone">Pusťte sem — bude na nejvyšší úrovni struktury</div>
  <div class="tree" id="tree"></div>
</main>
```
- `#addUnit` → `openUnit(null)`, which creates a top-level unit. `#addMember` → `openMember(null)`, which creates a top-level member.

### 10.2 Current budget box „Aktuální budget" (L417–418, 601–617)
```html
<section class="curbud" id="curBud">                       <!-- max-width:420px; margin:-12px 0 28px; white card -->
  <button class="cb-h" id="cbToggle" aria-expanded="false">  <!-- navy, 56px min-height, full width -->
    <span class="cb-k">Aktuální budget <small>zbývá</small></span>   <!-- 12px/700 uppercase + blue bar; small 10px --blue-200 -->
    <span class="cb-tot" id="cbTot"></span>                  <!-- 20px/900, margin-left:auto; .cb-neg → #ff8a84 -->
    <span class="cb-ch" aria-hidden="true">▾</span>          <!-- rotates 180° when expanded -->
  </button>
  <div class="cb-b" id="cbBody" hidden>
    <label class="cb-row"><span class="cb-l">Spolek</span><span class="cb-in"><input id="cbSpolek" inputmode="numeric" placeholder="0"><span>Kč</span></span></label>
    <label class="cb-row"><span class="cb-l">AS</span><span class="cb-in"><input id="cbAS" inputmode="numeric" placeholder="0"><span>Kč</span></span></label>
    <div class="cb-row cb-sub"><span class="cb-l">Celkem</span><span class="cb-v" id="cbSum"></span></div>
    <div class="cb-row cb-sub"><span class="cb-l"><i class="cb-dot"></i>V budgetu</span><span class="cb-v" id="cbGreen"></span></div>   <!-- green text, green dot -->
    <label class="cb-row"><span class="cb-l">Splátka</span><span class="cb-in"><input id="cbPay" inputmode="numeric" placeholder="0"></span></label>  <!-- input text RED (#cbPay), NO "Kč" suffix -->
    <div class="cb-row cb-left"><span class="cb-l">Zbývá</span><span class="cb-v" id="cbLeft"></span></div>   <!-- 2px navy top border, 20px/900; .cb-neg red -->
  </div>
</section>
```
- Row styles: `.cb-row` is flex with `padding:12px 18px` and a 1px top border. `.cb-l` is 14px/800 UPPERCASE navy (`.cb-sub .cb-l` is 12px grey-700). `.cb-sub` rows have a `--grey-050` background and 44px min height. `.cb-in input` is 180px wide (`max-width:50vw`), right-aligned, 16px/700 navy, 44px tall.
- **Computation** (`cbRender`, verbatim logic):
  ```js
  monthsSince = f => { if (!f) return 0; const [y,m] = f.split("-").map(Number), n = new Date();
                       return Math.max(0, (n.getFullYear()-y)*12 + (n.getMonth()+1-m) + 1) };   // inclusive of the current month
  tot  = cbNum(spolek) + cbNum(as)
  gr   = Σ cbNum(u.budget) for users with budColor === "green"
  ps   = Σ over curBud.pays of cbNum(p.amt) * monthsSince(p.from)
  left = tot - gr - ps
  #cbSum   = k(tot)          #cbGreen = "− " + k(gr)        #cbLeft = #cbTot = k(left)
  .cb-neg toggled on #cbLeft and #cbTot when left < 0
  ```
  Example: from = this month → months = 1 → 7 500 Kč deducted. From = 3 months ago → 4 × 7 500.
- **Inputs:**
  - On `input`, store the raw value (`S.curBud.spolek/as`, `pays[0].amt`), `save()`, re-render.
  - A focused input is **not** reformatted while typing (`document.activeElement` check). On `blur`, re-render, which formats it as `25 000`. A zero value shows empty (placeholder `0`).
- **Toggle:** `S.curBudOpen = !S.curBudOpen` → `save()` → shows/hides `#cbBody` and sets `aria-expanded`. Persisted. **New app:** per-browser localStorage (spec: „Stav rozbalení se pamatuje").
- `cbRender()` also runs at the end of every `renderOrg()`.

### 10.3 Root drop zone
`.rootzone#rootZone`:
- 52px tall, `margin:-14px auto 14px`, `max-width:520px`, 2px dashed grey border, white background, 13px/600 grey centred text.
- It keeps its space but is invisible (`visibility:hidden; opacity:0`) until `body.odrag`, i.e. while an org drag is active.
- `.rootzone.drop` = blue border, `--blue-050` background, steel text.
- Text: `Pusťte sem — bude na nejvyšší úrovni struktury`.

### 10.4 Tree construction (`renderOrg`, L526–539)
```js
placed = allNodes().filter(u => !u.unplaced)          // = all nodes
pids   = Set(placed ids)
roots  = placed.filter(u => !u.boss || !pids.has(u.boss)).sort(byOrd)    // dangling boss → treated as root
kids(u)= placed.filter(x => x.boss === u.id && x.id !== u.id).sort(byOrd)
byOrd  = (a,b) => (a.ord ?? 0) - (b.ord ?? 0)
#tree.innerHTML = `<ul>${roots.map(r => node(r, /*root*/ true)).join("")}</ul>`
node(u, root):
  unit   → <li>{unitCard(u)}{kids.length ? <ul>{kids.map(node)}</ul> : ""}</li>
  person → <li><div class="onode{root ? " root" : ""}" …>…</div>{kids ? <ul>…</ul>}</li>
```
Every **top-level person** gets `.root` (a dark navy card). Top-level units keep their own colour. Several roots render side by side.

### 10.5 Person node
```html
<div class="onode[ root]" data-uid="{id}" role="button" tabindex="0">
  <div class="hd">{av(id) /* 40px, 13px font; no lead ring; title "Zodpovědný: {name}" (quirk) */}
    <div><div class="nm">{name}</div><div class="rl">{role || "Člen týmu"}</div></div></div>
  {areas.length ? <div class="ar">{areas.map(a => <span>{a}</span>)}</div> : ""}
  <div class="st"><span><b>{act}</b>řeší</span><span><b>{lead}</b>vede</span>
     {u.budget ? <span class="bud[ green| red]" title="Budget">{fmtKc(budget)}</span> : ""}</div>
  {u.info ? <button class="info has" data-info="{id}" title="Informace" aria-label="Informace">i</button> : ""}
  <button class="plus" data-sub="{id}" title="Přidat podřízeného" aria-label="Přidat podřízeného">+</button>
</div>
```
- `act = tasks.filter(owner === id && col !== lastCol()).length`
- `lead = tasks.filter(lead === id && col !== lastCol()).length`
- `lastCol()` = the last column of `S.cols` (the task board, not print).
- Styles:
  - `.onode`: 230px wide, white, radius 6px, `padding:14px`, column flex with `gap:10px`, `cursor:grab`, `user-select:none`. Hover: blue border plus a shadow.
  - **In-tree fixed heights:** person 146px, unit 100px (`height:auto` on mobile). `.st` uses `margin-top:auto`.
  - `.nm` is 15px/800 navy, single-line ellipsis. `.rl` is 12px grey-600.
  - `.ar` chips: 10px/700 UPPERCASE on `--blue-050`. Inside the tree they don't wrap, are clipped, and fade out with `mask-image:linear-gradient(90deg,#000 85%,transparent)`.
  - `.st`: 1px `--grey-100` top border, `padding-top:8px`, 11px/600 grey. `b` is 14px/800 navy with `margin-right:3px`.
  - `.bud` budget tag: `margin-left:auto`, blue background (green `#1f8a4c` / red `#c62f28`), 12px/800 white, the same slanted clip-path as the price tag.
  - **Root** (`.onode.root`): navy background, 2px blue border, white name, `--blue-200` role. Chips use `--blue-800` with `--blue-200` text. Stats use `--border-on-dark` and the on-dark muted colour. The avatar ring is `0 0 0 2px navy, 0 0 0 3.5px #fff`.
  - `.hd{padding-right:24px}` leaves room for the info button.
- **Info button:**
  - 24px circle at `top:8px; right:8px`, italic Georgia „i". `.has` = blue fill, white text.
  - Its hit area is enlarged by `::after{inset:-10px}`.
  - It only renders when `info` is non-empty.
- **Plus button:**
  - 28px circle centred under the card (`bottom:-14px`), 2px grey border.
  - Shows on hover/focus-within (`opacity:0` → `1`). On `@media (hover:none)` it is always visible.
  - Click → `openMember(null, id)`, a new member under this node.

### 10.6 Unit node (`unitCard`)
```html
<div class="onode unit[ lt]" data-uid="{id}" data-unit="1" role="button" tabindex="0" style="background:{color};border-color:{color}">
  <span class="uk">Kategorie</span><span class="un">{name}</span>
  <div class="st"><span><b>{ppl}</b>pod ní</span><span><b>{n}</b>úkolů</span></div>
  <button class="plus" data-sub="{id}" title="Přidat člena pod kategorii" aria-label="Přidat člena">+</button>
</div>
```
- `ppl = descOf(u.id).size - 1`, i.e. **all descendants, units included** (not just people).
- `n = tasks.filter(t => (t.cat === u.name || (inGroup(t.cat, u.name) && u.name in GROUPS)) && t.col !== lastCol()).length`. A unit named „Mládež" counts every youth category, „Muži A" counts exact matches. The count is **always shown, including 0**.
- Styles:
  - Default background is steel when no colour is set. `.uk` is 10px/700 UPPERCASE in `rgba(255,255,255,.8)`. `.un` is 16px/900 UPPERCASE.
  - `.st` uses `rgba(255,255,255,.18)` for its border and white bold numbers.
  - `.lt` (colour in `LIGHT`) switches to navy text, grey-700 secondary text and `rgba(27,35,65,.15)` borders.
- The plus button opens `openMember(null, unitId)`, so it always creates a **person**. Sub-units can only be created through the unit form's „Zařazení" select.

### 10.7 Connector lines — tree CSS (verbatim, desktop)
```css
.tree{display:flex;justify-content:center;min-width:max-content}
.tree ul{display:flex;justify-content:center;padding:24px 0 0;margin:0;position:relative}
.tree>ul{padding-top:0}
.tree li{list-style:none;position:relative;padding:24px 8px 0;display:flex;flex-direction:column;align-items:center}
.tree li::before,.tree li::after{content:"";position:absolute;top:0;right:calc(50% - 1px);width:calc(50% + 1px);height:24px;border-top:2px solid var(--grey-300);box-sizing:border-box}
.tree li::after{right:auto;left:calc(50% - 1px);border-left:2px solid var(--grey-300)}
.tree li:first-child::before,.tree li:last-child::after{border:0}
.tree li:last-child::before{border-right:2px solid var(--grey-300);border-radius:0 6px 0 0}
.tree li:first-child::after{border-radius:6px 0 0 0}
.tree li:only-child::before{display:none}.tree ul>li:only-child::after{display:none}.tree ul ul:has(>li:only-child)::before{height:48px}.tree>ul>li:only-child::after{display:none}
.tree ul ul::before{content:"";position:absolute;top:0;left:calc(50% - 1px);height:24px;border-left:2px solid var(--grey-300)}
.tree>ul>li{padding-top:0}.tree>ul>li::before,.tree>ul>li::after{display:none}
.tree li{padding-bottom:14px}
```
How it works:
- Each `li` draws half of the horizontal bar on each side (`::before` left half, `::after` right half plus a vertical drop to its card). The first and last children drop their outer halves and get 6px rounded corners.
- Each nested `ul::before` draws the vertical stub from the parent card down to the bar.
- An only child gets no bar. Instead the stub is extended to 48px (`:has` selector), so the line runs straight down.
- Top-level items have no connectors.
- The whole tree is centred and can scroll horizontally (`min-width:max-content` inside `.org{overflow:auto}`).
- Lines are 2px `--grey-300`.

### 10.8 Org drag & drop (L549–598)

State `O = {n, id, x0, y0, x, y, touch, active, dx, dy, bad, g, pos, sib, parent, target}`. Flags: `orgDragEnded`, `oTimer`, `oRaf`.

```js
descOf = id => { s = new Set([id]); loop until stable: for every node u with u.boss in s and u.id not in s → add u.id; return s }   // includes self
```

**Start**
- `pointerdown` on `#org`:
  - Find `.onode`. Ignore if there is none, if `e.button > 0`, or if the target is inside `.plus` or `.info`.
  - Touch: a 220ms timer → `oStart()` + `vibrate(15)`.
  - Activation thresholds match the cards: mouse > 5px, touch cancels if moved > 8px before the timer fires.
- The `touchmove` and `pointercancel` handling matches the cards. A cancel while active calls `oEnd({cancel:1})`, which drops nothing.

**`oStart()`**
- `dx/dy` offset; `O.bad = descOf(O.id)` (self + descendants).
- Ghost = clone with `.ghost` (without `.drop`), width = source width. `.onode.ghost` is fixed, `pointer-events:none`, with a shadow and the plus button hidden.
- The source gets `.ph` (opacity .35, dashed border; it is **not** moved in the DOM).
- `body.classList.add("dragging","odrag")`, which shows the root zone.
- `oMove()`; start the `oAuto` rAF loop.

**`oMove()`**
```
hide tooltip; ghost.transform = translate(x-dx, y-dy) rotate(2deg)
el = elementFromPoint(x,y); t = el?.closest("#tree .onode"); if (t && O.bad.has(t.dataset.uid)) t = null   // cannot drop onto self/descendant
clear .drop-before/.drop-after/.drop-no everywhere
O.pos = "child"
if (t) {
  r = t.rect; mob = matchMedia("(max-width:760px)").matches
  f = mob ? (y - r.top)/r.height : (x - r.left)/r.width
  O.pos = f < .34 ? "before" : f > .66 ? "after" : "child"
  tn = node(t); dragUnit = isUnit(O.id)
  if (tn.kind === "unit" && !dragUnit)  O.pos = (O.pos === "child" || !tn.boss) ? "child" : O.pos
       // a person dropped onto a TOP-LEVEL unit always goes inside it; onto a nested unit the thirds apply
  tooltip: pos==="child" ? (tn is unit ? "Do kategorie " : "Pod ") + tn.name
                         : (pos==="before" ? "Vlevo vedle " : "Vpravo vedle ") + tn.name      // same wording on mobile (where it means above/below)
  parent = pos==="child" ? tn.id : (tn.boss || "")
  if (pos !== "child") { t.classList.add("drop-" + pos); O.sib = tn.id; O.parent = parent; O.target = "__sib"; clear all .drop; return }
}
pl = el?.closest("#pool") /* dead */; rz = el?.closest("#rootZone")
clear .drop except on t / rz / pl
t → t.classList.add("drop")        // blue border + 4px --blue-100 ring
rz → rz.classList.add("drop")
O.target = t ? t.dataset.uid : rz ? "" : (pl ? "__pool" : null)
```
- Tooltip `#oTip` (created lazily in `body`): navy, white 12px/700, `padding:6px 10px`, positioned at `translate(x+16px, y+18px)`. It only shows over a valid node, not over the root zone.
- Sibling indicator bars:
  - Desktop: `.drop-before::before` / `.drop-after::before` is a 5px-wide blue vertical bar placed 11px left/right of the card (`top:-2px; bottom:-2px`).
  - Mobile (≤760px): a 5px-tall horizontal bar 8px above/below the card.
- `.drop-no` is styled (red dashed outline, opacity .5) but **never applied**.

**`oAuto()`** — `#org` container: within 60px of an edge, scroll 12px per frame horizontally and vertically, then `oMove()`.

**`oEnd(e)`**
```
clearTimeout; if (!O) return; if (!O.active) { O = null; return }       // a plain click opens the form via the click handler
cancel rAF; ghost.remove(); hide tip; body.remove("dragging","odrag"); clear .drop
u = node(O.id); tg = O.target; pos = O.pos; sib = O.sib; parent = O.parent; O = null
orgDragEnded = true; setTimeout(() => orgDragEnded = false, 50)        // swallow the following click
if (!e.cancel && tg != null) {
  if (tg === "__sib") {
    u.boss = parent; u.unplaced = false
    sibs = placed nodes with (x.boss||"") === (parent||"") && x.id !== u.id, sorted byOrd
    i = sibs.findIndex(x => x.id === sib); if (pos === "after") i++
    sibs.splice(max(0,i), 0, u); sibs.forEach((x,k) => x.ord = k)      // renumber the sibling group 0..n
  } else if (tg === "__pool") { … dead … }
  else {                                                                // tg = node id, or "" (root zone)
    others = nodes with x.boss === tg && x.id !== u.id && !x.unplaced
    u.boss = tg; u.unplaced = false; u.ord = Math.max(-1, ...others.map(x => x.ord ?? 0)) + 1   // append as last child
    tp = node(tg); ppl = others.filter(x => x.kind !== "unit")          // PERSON children only
    if (u.kind === "unit" && ppl.length && confirm(
        `Vložit kategorii „${u.name}“ mezi ${tp.name} a jeho podřízené?\n\nOK = ${ppl.map(x=>x.name).join(", ")} se přesunou pod kategorii.\nZrušit = kategorie se jen přidá vedle nich.`))
      ppl.forEach(x => x.boss = u.id)                                   // sub-UNITS stay under the target
  }
  save()
}
renderOrg()
```
- The whole subtree moves implicitly, because children keep `boss = u.id`.
- **BUG (root zone + unit):**
  - Dropping a *unit* on the root zone while top-level persons have `boss === ""` makes `tp = node$("")` undefined, and `tp.name` throws. The ghost is already removed, the state is mutated but not saved, and no re-render happens.
  - Top-level nodes with `boss === undefined` (e.g. the seed u1) do not match `x.boss === ""`, so the bug only shows after moves.
  - **New app:** a root-zone drop appends at the top level with **no** confirm.

**Click / keyboard on the org tab**
- Delegated `click` on `#org`, ignored while `orgDragEnded`:
  - `[data-info]` → `showInfo`.
  - `[data-sub]` → `openMember(null, id)`.
  - `.onode` → `openUnit(id)` if `data-unit`, else `openMember(id)`.
- `keydown` Enter on a focused `.onode` opens the same form.

### 10.9 Info popover `#infoPop` (read-only)
```js
showInfo(btn): closeInfo(); u = user(id); if (!u?.info) return;
  p = <div id="infoPop"><div class="ih">{name}</div>{info}</div>  appended to body
  r = btn.rect; x = max(8, min(r.right - pw, innerWidth - pw - 8)); y = r.bottom + 8;
  if (y + ph > innerHeight - 8) y = max(8, r.top - ph - 8);   // flip above
  position:fixed left/top
```
- Styles: navy background, white 13px text, `line-height:1.5`, `max-width:280px`, radius 6px, `white-space:pre-wrap` (newlines preserved), z-index 150. `.ih` is the 10px UPPERCASE `--blue-200` header.
- Closes on any document `pointerdown` outside `#infoPop` and outside `[data-info]`, and on `#org` scroll. Clicking the button again re-opens it (it does not toggle).

### 10.10 Member form (`openMember(id, boss, focusId)`, L799)
New member defaults: `{id: uid(), name:"", role:"", boss: boss ?? "", unplaced:false, areas:[], ord: 1e6}`. `ord` 1e6 places it last among its siblings, with no renumbering. Editing works on a shallow copy with a copied `areas` array.
`bosses = allNodes().filter(u => !descOf(M.id).has(u.id) && !u.unplaced)` excludes self and every descendant.

Modal title: `Člen týmu` (edit) / `Nový člen`. Fields in DOM order:

| # | Label | Control | Width |
|---|---|---|---|
| 1 | `Jméno a příjmení *` | `#mName`, placeholder `Např. Jana Nováková` | ½ |
| 2 | `Role` | `#mRole`, placeholder `Např. Sociální sítě` | ½ |
| 3 | `Krátká informace` | `#mInfo` textarea (`min-height:80px`), placeholder `Např. kontakt, dostupnost, na co se obracet…` | full |
| 4 | `Budget` | `#mBud inputmode=numeric`, placeholder `Např. 25 000` | ½ |
| 5 | `Barva profilu` (`span.lbl`) | `.avpick` with 11 AVPAL radio swatches `name=avc` (32px circles, 2px navy ring when checked, `title` = hex). Checked: `M.color` or, when editing, `colorOf(ex.id)`. A new member has none checked. | full |
| 6 | `Stav budgetu` (`span.lbl`) | `.budc` radios `name=budc`: `Na dluh` (red, `red`), `V budgetu` (green, `green`), `Budoucnost` (blue, `""`). Checked: `M.budColor || ""`, so a new member defaults to Budoucnost. | ½ |
| 7 | `Nadřízený` | `#mBoss` select: `<option value="">— nikdo (vedení týmu) —</option>`, then `<optgroup label="Kategorie">` (units), then `<optgroup label="Členové">` (persons). Each optgroup is omitted when empty. Options are in array order. | full |
| 8 | `Oblasti, na které se zaměřuje` (`span.lbl`) | `.chkgrid` of checkbox pills for AREAS (40px pills; checked = blue fill, white text) | full |

Footer:
```
<span class="meta">{ex ? `${tasks.filter(t => t.lead===id || t.owner===id).length} přiřazených úkolů` : ""}</span>    <!-- all columns -->
{ex && ex.id !== S.me ? <button class="btn danger" id="mDel">Odebrat</button> : ""}       <!-- you cannot remove your current identity -->
{ex ? <button class="btn outline" id="mDup">Duplikovat</button> : ""}
<button class="btn outline" data-close2>Zrušit</button>
<button class="btn primary" id="mOk">{ex ? "Uložit" : "Přidat člena"}</button>
```
- **Save:**
  - Name is required; the error style is a red border plus focus.
  - Assigns `name, role, info` (trimmed), `budget` (trimmed raw text), `budColor` (checked or ""), `color` (checked, else the old value or ""), `boss` (select value), `unplaced:false`, and `areas` (the checked values).
  - Updates in place or pushes. Then save, close, render.
- **Remove:** `confirm("Odebrat ${name}? Jeho úkoly zůstanou bez přiřazení a podřízení přejdou pod jeho nadřízeného.")`. Then:
  - remove the user;
  - every node with `boss === id` gets `boss = ex.boss || ""`;
  - every task's `lead`/`owner` equal to the id becomes `""`;
  - `createdBy` is left as is (the „Založil(a)" meta then disappears).
- **Duplicate:**
  - Copy = `{...ex, id: uid(), name: name + " (kopie)", areas copy, ord: ex.ord + .5}`. Same boss and the same info/budget/colour.
  - Children are **not** copied.
  - Push it, `reord(c.boss)` renumbers that sibling group 0..n by ord (so the copy lands right after the original), then save, close, render, and **open the copy**.
- `focusId` param: focuses that field id (unused by any caller). A new member's name field is focused after 30ms.

```js
const reord = boss => allNodes().filter(x => (x.boss||"") === (boss||"")).sort(byOrd).forEach((x,k) => x.ord = k);
```

### 10.11 Unit form (`openUnit(id, boss)`, L826)
New unit: `{id: uid(), kind:"unit", name:"", boss: boss ?? "", unplaced:false, ord: 1e6}`. Title: `Kategorie` / `Nová kategorie`.

| Label | Control |
|---|---|
| `Název kategorie *` | `#uName list="uSug"`, placeholder `Např. Sociální sítě, Mládež, Web…`, datalist from §4.2 (full width) |
| `Barva kategorie` | `.avpick` radios `name=ucol`, AVPAL; checked `M.color || "#00588e"` |
| `Zařazení ve struktuře (pod koho patří)` | `#uBoss`: `<option value="">— nejvyšší úroveň —</option>` + `bossOpts` (Kategorie / Členové), excluding self and descendants |

Footer: meta `Pokud se název shoduje s kategorií úkolů, karta ukazuje počet rozpracovaných úkolů.` For an existing unit, `btn danger #uDel` `Smazat` and `btn outline #uDup` `Duplikovat`. Then `Zrušit` and primary `Uložit` / `Přidat kategorii`.
- **Save:** name required, `color` (checked or ""), `boss`. Updates in place or pushes.
- **Delete:** `confirm("Smazat kategorii ${name}? Vše pod ní se přesune o úroveň výš.")`. Remove the unit; its children get `boss = ex.boss || ""`.
- **Duplicate:**
  - Recursively copies **units only**. The top copy gets `name + " (kopie)"` and `ord + .5`; nested copies keep their names and ords and are re-parented to their new copies. Persons are not copied.
  - Then `reord(top.boss)`, save, close, render.
  - It does **not** open the copy, unlike members and tasks.

---

## 11. All alert / confirm / prompt texts

| Where | Type | Text (verbatim) |
|---|---|---|
| Storage write fails | alert | `Úložiště je plné — odeberte některé velké soubory z příloh.` |
| Delete last column | alert | `Musí zůstat alespoň jeden sloupec.` |
| Delete column with tasks | confirm | `Sloupec obsahuje ${n} úkolů. Přesunout je do prvního sloupce a sloupec smazat?` |
| + Sloupec | prompt | `Název sloupce` (default `Nový sloupec`) |
| Delete task | confirm | `Opravdu smazat úkol?` |
| Delete print item | confirm | `Opravdu smazat tiskovinu?` |
| Delete last type | alert | `Musí zůstat alespoň jeden typ.` |
| Delete used type | confirm | `Typ „${t}“ používá ${n} tiskovin. Přesunout je pod „${rest[0]}“ a typ smazat?` |
| Close year | confirm | `Uzavřít rok ${y}? ${count} položek za ${kcs(tot)} se přesune do archivu.` |
| Remove member | confirm | `Odebrat ${name}? Jeho úkoly zůstanou bez přiřazení a podřízení přejdou pod jeho nadřízeného.` |
| Delete unit | confirm | `Smazat kategorii ${name}? Vše pod ní se přesune o úroveň výš.` |
| Unit dropped on a node with person children | confirm | `Vložit kategorii „${u.name}“ mezi ${tp.name} a jeho podřízené?\n\nOK = ${names joined ", "} se přesunou pod kategorii.\nZrušit = kategorie se jen přidá vedle nich.` |

Native dialogs are acceptable for a 1:1 rebuild. If you replace them with custom dialogs, keep the texts and the OK/Cancel semantics (the last row explains what OK and Cancel mean).

## 12. Keyboard handling
- `Escape` closes any modal and the yearly report (document listener, active only while one is open).
- `Enter` in a column title (contenteditable) blurs and saves it.
- `Enter` in a link URL adds the link. `Enter` in „Nový typ" adds the type. `Enter`/blur in a type row input renames it (`change` event).
- `Enter` on a focused org node (`tabindex=0`, `role=button`) opens its form.
- Cards are not focusable, so there is no keyboard drag and drop. (An a11y improvement would be optional.)
- Autofocus: the title of a new task/print item, the name of a new member/unit (30ms delay).

## 13. UI preferences (per browser, not shared)
Persisted in the prototype's single state object. In the new app, keep them in the browser's `localStorage` under your own key, e.g. `fotbalfm.ui.v1`:
`me` (identity), `view` (active tab), `filter` (task group), `month`, `mine`, `prFilter`, `prMonth`, `curBudOpen`.
Never persisted: `q`, `pq` (search strings).
Validate on load: `filter` must be a key of GROUPS or `"Vše"`, `prFilter` must be an existing type, and `me` should fall back to the first member when it is missing (the prototype has no fallback).

---

## 14. Responsive behaviour

### 14.1 `@media (max-width:760px)` — main breakpoint
**Header**
- `.top{padding:10px 14px; gap:10px}`. Logo 32px high, `h1` 17px.
- `.tools{width:100%}` is a full-width row. `.who{flex:1}`, the `Přihlášen` label is hidden, and the select takes the full width.
- The tabs move to their own row: `.tabs{order:3; width:100%; margin:0 -14px -10px; padding:0 6px; border-top:1px solid var(--border-on-dark)}`, with each button at `flex:1`.

**Filter bars:** `.bar{padding:10px 0}`, `.sub{padding:0 14px}`, `.fsel{flex:1 1 100%}` (each select on its own line), `.search{max-width:none}`, `.hint` hidden.

**Board:**
- `.board{padding:12px 14px 14px; gap:10px; scroll-snap-type:x mandatory; scroll-padding:14px}`.
- **Columns `flex:0 0 86vw; max-width:none; scroll-snap-align:start`**. `.addcol{flex:0 0 60vw}`, also snapping. Print columns are 86vw as well.

**Modals are fullscreen:**
- `.ov{padding:0}`, `.modal{max-width:none; min-height:100%; border-radius:0}`, `.mb{grid-template-columns:1fr; padding:16px}` (single column).
- The header is sticky at the top (`.mh{position:sticky; top:0; background:#fff; z-index:1; padding:10px 10px 10px 16px}`) and the footer sticky at the bottom (`.mf{position:sticky; bottom:0; background:#fff; padding:12px 16px}`).

**Org:**
- `.org{padding:16px 14px 30px}`, `h2` 22px. The `.orgh .btn` group is pushed right (`.obtns{margin-left:auto}`).
- **The tree becomes an indented list:**
  ```css
  .tree{min-width:0;display:block}
  .tree ul{display:block;padding:0 0 0 18px;margin-left:10px;border-left:2px solid var(--grey-300)}
  .tree>ul{padding:0;margin:0;border:0}
  .tree li{display:block;padding:10px 0 0}
  .tree li::before{display:block!important;top:34px;left:-18px;right:auto;width:16px;height:0;border:0;border-top:2px solid var(--grey-300)!important;border-radius:0!important}
  .tree li::after,.tree ul ul::before{display:none!important}
  .tree>ul>li::before{display:none!important}
  .onode{width:100%}
  .tree .onode:not(.unit),.tree .onode.unit{height:auto}
  ```
- Org drag uses vertical thirds (top = before, bottom = after), and the sibling indicators are horizontal bars.

**Budget box payments** (`.cb-p` grid): CSS exists but no element uses it.

**Yearly report:**
- `.yv-t{font-size:15px}`, the `.yv-sp` spacer is hidden, `.yv-b{padding:14px; gap:12px}`.
- KPI values 22px (main 26px). Chart `height:180px; gap:4px`, value labels `.mc .v` hidden.
- `.yv-r` is reduced to name + price (type and qty hidden).

### 14.2 `@media (max-width:1000px)`
Yearly report only: KPIs in 2 columns; the chart and the types card take the full width.

### 14.3 `@media (hover:none)`
The org `.plus` button is always visible.

### 14.4 Other
- `.app` uses `height:100vh; height:100dvh` (handles the mobile URL bar).
- The board scrolls horizontally on every viewport. Below 760px columns snap; above it they are `flex:1 0 280px; max-width:420px`.
- Touch drag requires a 220ms hold, so normal swipes still scroll the board or list.

---

## 15. Print stylesheet (yearly report)
```css
@media print{body>.app{display:none!important}.ov{position:static;background:none;padding:0;overflow:visible}.modal{box-shadow:none;max-width:none}.mh .close,.mf,.yr-top select{display:none!important}.yr-m{break-inside:avoid}}
@media print{.yv{position:static;overflow:visible}.yv-b{overflow:visible}.yv-bar .btn,.yv-bar select{display:none!important}.yv *{-webkit-print-color-adjust:exact;print-color-adjust:exact}.yv-card,.kp,.yv-m{break-inside:avoid}}
```
- Printing hides the whole app (`.app` is a direct child of `body`; the report lives in `#modalRoot`, outside it), so only the yearly report prints. In print, `.yv` is static (the inline `top` is ignored) and nothing scrolls internally.
- What prints from the bar: the title `Roční přehled tiskovin` and the `Uzavřeno …` status. Hidden: all buttons (back, print, close/reopen) and the year select.
- Colours print exactly (`print-color-adjust: exact`). KPI tiles, cards and month blocks avoid page breaks.
- The first block also prints an open modal without its close button or footer (generic modal printing).
- The `.yr-*` selectors belong to an older yearly-report version and are dead.
- **Nuance:** media queries use the printed page width. A4 portrait at default margins is ≈ 718 CSS px, so the ≤1000px and ≤760px rules **also apply in print** (2-column KPIs, full-width chart, hidden chart value labels, list rows with only name and price). Reproduce this 1:1 (same CSS). If you want a richer print, add a print-specific override and flag it as a deliberate change.
- For React: render the report outside the `.app` root (a portal into a sibling of `.app`), or adapt the `body>.app{display:none}` selector to your root structure.

---

## 16. Integrity rules (as implemented)

| Action | Effect |
|---|---|
| Delete member | Children → `boss = deleted.boss \|\| ""`. Tasks: `lead`/`owner === id` → `""`. `createdBy` untouched. You cannot delete the current identity. |
| Delete unit | Children → `boss = deleted.boss \|\| ""` (moved up one level). |
| Delete task column | Requires ≥1 remaining column. All its tasks (visible or not) move to the new first column. |
| Print columns | Fixed. They cannot be added or deleted (the title is editable in the prototype; see §19). |
| Delete print type | Requires ≥1 remaining type. Its items move to the first remaining type. |
| Rename print type | Propagated to every item with that type. Empty names and duplicates are rejected. |
| Move org node | The subtree comes along. It cannot be dropped on itself or a descendant. The boss select excludes descendants. |
| Close year | `arch = true` on the year's items with a due date, plus `closed[y] = now`. Items without a date are unaffected. Items added later to a closed year are **not** auto-archived. |
| Reopen year | Removes `arch` from the year's items and deletes `closed[y]`. |
| Duplicate task / print item | Inserted directly after the original, then opened. |
| Duplicate member | Sibling order: `ord + .5`, then renumbered. The copy is opened. |
| Duplicate unit | Includes all sub-units (not persons). Not opened. |

**Ordering:**
- Tasks, print items, columns and types use array order. Org nodes use `ord` within a sibling group.
- Map both to `sort_order numeric`: the midpoint between neighbours, or renumber.
- New items are appended (tasks are pushed to the array end; new org nodes get `ord = 1e6`, or `max+1` after a drop).

---

## 17. Per-feature checklist of behaviours easy to miss
- Counts in the group select ignore the month filter. Counts in the month select respect the group filter only. Neither respects search or „mine".
- The column count and sum reflect **visible** cards. The delete-column confirm counts **all** tasks.
- A new task pre-fills the category from the active group (its *first* category). A new print item uses the active type filter.
- `+ Nový úkol` on the org tab switches to the Úkoly tab first.
- The board keeps its horizontal scroll position across re-renders.
- Clicks are swallowed for 50ms after a drag (both boards and the org tree).
- During a card drag, the original card is the placeholder and moves live. During an org drag, the original stays in place (dimmed) and indicators show the target.
- The org tooltip only shows over valid node targets.
- A unit's people count includes sub-units. A unit's task count is always shown.
- Root-level persons are styled dark (`.root`). Every top-level person is a „root".
- The budget „Splátka" counts months **inclusive** of the current month and has no lower bound other than 0. The `from` month is fixed at first initialisation.
- In budget inputs, formatting applies on blur only.
- The yearly report includes archived items. The board excludes them. The filter counts and month sums in the print bar include archived items (likely unintended; see §19).

## 18. Dead / legacy code (do NOT implement)
- **Unplaced „pool"** (`#pool`, `#poolList`, `.pool*`, `.poollist*`, `__pool` targets/options, `unplaced` flag): the markup does not exist, `unplaced` is reset to false on load, and no select offers `__pool`. Ignore it.
- **Category chips** `.chips/.chip` (the earlier filter UI, see screenshot `uploads/Snímek obrazovky 2026-10-12 v 12.42.49.png`). Replaced by the `#grp` select.
- `.pdebt`, `.card .pst`, `.yr-*` (old yearly modal), `.yv-h`, `.cb-pay/.cb-ph/.cb-add/.cb-p/.cb-pi` (multiple payments UI), `.cb-note`, `#infoPop textarea/.ia` (editable info), `.drop-no`, `.urow .me`, `.ohint`, `.brand .k`, `.btn.ghostd`, `.trow` inside `.urow` (used), `.hint` (used).
- `!(tn.boss&&!tn.unplaced&&false)` at L571 is always true (a no-op).

---

## 19. Discrepancies: prompt.md vs prototype, and ambiguities

Prototype behaviour wins for UI unless noted. **[A]** = ambiguous, needs a product decision. **[B]** = prototype bug, fix it in the new app.

1. **Print column titles are editable in the prototype** (contenteditable is unconditional). The spec says „bez přejmenování". **[A]** Recommendation: follow the spec (not editable). It is low-risk, and the spec is explicit.
2. **Task form primary button**: the spec says „Uložit/Vytvořit". The prototype says `Vytvořit úkol` / `Přidat tiskovinu` / `Uložit`. Use the prototype texts.
3. **Member form**: the spec calls it „Barva budgetu (Modrá/Zelená/Červená)". The prototype uses the label `Stav budgetu` with `Na dluh / V budgetu / Budoucnost` (red, green, blue), and „Barva profilu" comes *before* it. Use the prototype. In the DB, `budget_color` 'blue' maps to the prototype's `""`.
4. **„Odebrat" is hidden for the current identity** in the prototype. The spec doesn't mention it. **[A]** Keep it (it prevents deleting yourself), but since identity is not authentication, this is cosmetic.
5. **Unit „počet lidí pod ní"**: the prototype counts all descendant nodes, units included. **[A]** Recommendation: count persons only (the spec's wording), or keep it 1:1. Decide.
6. **Unit task count „pokud název odpovídá"**: the prototype always renders `N úkolů`, including 0 when nothing matches. **[A]** Recommendation: show it only when the name matches a category or group (spec), or keep it 1:1.
7. **Category dropped on a node with children**: the spec says „na člověka s podřízenými". The prototype triggers the confirm for any target, units included, and moves only *person* children, never sub-units. Keep the prototype logic, and fix the root-zone crash **[B]** (§10.8).
8. **Mobile org drop tooltip** still says „Vlevo/Vpravo vedle" although the thirds are vertical. **[A]** Possibly use „Nad"/„Pod … (vedle)" on mobile. Default: keep 1:1.
9. **„+" under a card**: the spec says „nový podřízený". The prototype always opens the *member* form (`Přidat člena pod kategorii` on units). Keep it.
10. **Root zone text**: the spec says „…bude na nejvyšší úrovni". The prototype says „…na nejvyšší úrovni struktury". Use the prototype.
11. **Splátka `installment_from`**: the prototype sets it automatically to the month of first use and has **no UI** for it. The spec has an `installment_from date` column. **[A]** Seed it to the go-live month and decide whether to add a month input (the `.cb-p` CSS hints a planned `type=month` input). The multiple-payments array (`pays`) collapses to one installment in the spec model.
12. **Print month list range**: tasks use −1…+11 months. Print uses **−2…+5**. The spec doesn't specify print. Keep the prototype.
13. **Print filter counts and month sums include archived items** (`cnt`, `sm` don't check `arch`). The board total and column sums exclude them. **[B]/[A]** Recommendation: exclude archived items everywhere on the board screen.
14. **Yearly report „Upozornění na položky bez data"** counts undated, non-archived items **globally** (not per year) and is hidden for closed years. Keep it.
15. **Items added to an already-closed year** stay visible on the board and are not archived. **[A]** Decide (e.g. auto-archive, or warn).
16. **Reopen year has no confirm**. Close year has one. Keep it.
17. **Month abbreviations in the chart**: `Červen` and `Červenec` both become `Čer`. **[A]** Consider `Čvn`/`Čvc` (the standard Czech abbreviations). Default: 1:1.
18. **Duplicate copies the saved version**, discarding unsaved form edits (tasks and members). Keep it, or save first. **[A]**
19. **Delete column → first column**: when the deleted column *is* the first, its tasks go to the new first column. Consistent with the spec.
20. **`Escape` / overlay click discard unsaved changes** with no warning. That matches the spec („Esc / klik mimo = zavřít").
21. **Due colouring on print items** uses the realisation date with the same late/soon logic, and the tooltip says „Termín dokončení". Keep it, or adjust the tooltip to „Datum realizace". **[A]** (minor)
22. **Identity fallback**: if `me` points to a deleted or unknown member, the prototype shows the first option but keeps the stale id. The new app should fall back to the first member.
23. **Number fields** are stored as raw text in the prototype (budget, price, qty, Spolek, AS, Splátka). The spec says integer columns. Parse with `replace(/\D/g,'')`. Note that „1,5" becomes 15 and negatives are impossible.
24. **Attachments**: the prototype keeps data URLs only up to 1.5 MB and shows a name-only row above that. With Storage, upload everything (keep the per-file size label and the `Soubor` / `Odkaz` row UI). The tooltip text about „příliš velký" becomes obsolete.
25. **Tasks ordering**: the prototype uses global array order and renders with filters. The spec uses `sort_order`. Move semantics = „insert before the next visible card in the target column, else append at the column end".
26. **API `PATCH /api/org/move {id, parent_id, before_id|after_id}`** matches the prototype's three outcomes: child (append last), sibling before/after, root (append last at the top level). The category-insert confirm adds a fourth: re-parent the target's person children under the moved unit.
27. **Spec §3.1 „+ Sloupec" (prompt)**: whitespace-only input creates an empty-titled column in the prototype **[B]**. Reject it.
28. **Header button on the org tab** reads „+ Nový úkol" and jumps to Úkoly. The spec only mentions the Úkoly/Tiskoviny texts. Keep it.

---

## 20. Suggested React decomposition (non-binding)
- `AppShell` (header with logo, title, `Tabs`, `IdentitySelect`, `NewButton`)
- `TaskFilterBar`, `PrintFilterBar`
- `Board` (generic, with a `mode: 'tasks'|'print'` prop) → `Column` (`ColumnHeader` with inline rename / sum / delete) → `TaskCard` | `PrintCard`. Drag and drop goes in a custom pointer-events hook that replicates §7.7 exactly. Libraries like dnd-kit would differ in feel (220ms hold, live placeholder, 2° ghost, autoscroll rates).
- `Modal` (the shell, §8.1), `TaskModal`, `PrintTypesModal`, `MemberModal`, `UnitModal`
- `YearReport` (portal outside `.app` for printing)
- `OrgView` → `OrgHeader` (legend, buttons), `BudgetBox`, `RootZone`, `OrgTree` (recursive `ul/li` with the CSS connectors), `PersonNode`, `UnitNode`, `InfoPopover`, `OrgDragLayer` (ghost + `#oTip`)
- Shared utilities: `kcs`, `fmtKc`, `parseDigits`, `ini`, `colorOf`, `monLab`, `monthsSince`, `descOf`, `inGroup`, `dueInfo`.
- Reuse `prototype-app.css` verbatim as the global stylesheet (class names as in this document) to guarantee 1:1 visuals. Then remove the dead selectors in §18.
