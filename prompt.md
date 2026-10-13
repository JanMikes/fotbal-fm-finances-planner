## 1. Technické zadání

- **Frontend:** zachovat vzhled a chování prototypu 1:1 (design system Fotbal FM — `styles.css`, tokeny v `tokens/`, font Montserrat, logo `assets/logo-short.svg`).
- **Doporučený stack:** Next.js / React + Supabase (Postgres, Storage pro přílohy, Realtime pro živou synchronizaci). Alternativa: libovolný backend s REST API + WebSocket.
- **Přihlášení:** žádné přihlašování uživatelů. Přístup přes tajný odkaz (token v URL nebo jednoduché sdílené heslo celého týmu). Výběr „Přihlášen: [jméno]" v hlavičce je jen volba identity (uložit do localStorage prohlížeče), ne autentizace.
- **Správa:** formuláře členů týmu a struktury upravuje správce (vlastník). V první verzi stačí, aby to mohl kdokoli s odkazem — volitelně přidat „admin PIN" pro záložku Struktura týmu, editaci členů, budget a uzavření roku.
- **Responzivita:** desktop, tablet, mobil. Drag & drop myší i dotykem (podržení prstu 220 ms → tažení, vibrace 15 ms).
- **Jazyk:** čeština, formát čísel `25 000 Kč`, data `cs-CZ`.
- **Realtime:** změny (přesun karty, úprava, nový člen) se mají propsat ostatním bez obnovení stránky.

---

## 2. Datový model (Postgres)

sql
-- Členové týmu = uzly stromu typu "person"
create table members (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 role text,
 info text, -- krátká informace (ikonka „i")
 budget integer, -- Kč, celé číslo
 budget_color text check (budget_color in ('blue','green','red')) default 'blue',
 -- red = Na dluh, green = V budgetu, blue = Budoucnost
 avatar_color text, -- hex z palety (viz 6.3)
 areas text[] default '{}', -- oblasti: Celý klub, Muži, Mládež, Merch, Aplikace, Web, Ticketing, Eventy, Foto
 parent_id uuid, -- nadřízený uzel (member nebo unit), null = nejvyšší úroveň
 sort_order numeric default 0,
 created_at timestamptz default now()
);

-- Kategorie ve stromu struktury (uzly typu "unit")
create table org_units (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 color text, -- hex z palety, default #00588e
 parent_id uuid, -- member nebo unit
 sort_order numeric default 0
);
-- parent_id v obou tabulkách odkazuje na id v members NEBO org_units.
-- Doporučení: sjednotit do jedné tabulky org_nodes(kind 'person'|'unit') — jednodušší strom.

-- Tabule (dvě instance: úkoly a tiskoviny)
create table boards (id text primary key); -- 'tasks', 'print'
create table board_columns (
 id uuid primary key default gen_random_uuid(),
 board_id text references boards(id),
 title text not null,
 sort_order numeric
);

-- Úkoly marketingu
create table tasks (
 id uuid primary key default gen_random_uuid(),
 column_id uuid references board_columns(id),
 category text not null, -- konkrétní kategorie (viz 3.2)
 title text not null,
 description text,
 lead_id uuid references members(id) on delete set null, -- zodpovědný vedoucí
 owner_id uuid references members(id) on delete set null, -- zodpovědný za úkol
 due_date date, -- předpokládaný termín dokončení
 sort_order numeric,
 created_by uuid references members(id) on delete set null,
 created_at timestamptz default now()
);

-- Tiskoviny
create table print_types (
 id uuid primary key default gen_random_uuid(),
 name text unique not null, -- Letáky, Vizitky, Plakáty, Bannery, Roll-upy, Samolepky, Brožury
 sort_order numeric
);
create table print_items (
 id uuid primary key default gen_random_uuid(),
 column_id uuid references board_columns(id),
 type_id uuid references print_types(id),
 title text not null,
 description text,
 quantity integer, -- počet ks
 price integer, -- Kč
 paid_by_club boolean default false, -- „Zaplaceno FK FM" ANO/NE
 realization_date date, -- datum realizace → určuje měsíc útraty
 archived boolean default false, -- true po uzavření roku
 sort_order numeric,
 created_by uuid references members(id) on delete set null,
 created_at timestamptz default now()
);
create table print_year_closures (
 year int primary key,
 closed_at timestamptz default now()
);

-- Přílohy (společné pro tasks i print_items)
create table attachments (
 id uuid primary key default gen_random_uuid(),
 parent_kind text check (parent_kind in ('task','print')),
 parent_id uuid not null,
 kind text check (kind in ('file','link')),
 name text, -- název souboru / popisek odkazu
 url text, -- Storage URL nebo externí odkaz
 size_bytes bigint,
 mime text,
 created_at timestamptz default now()
);

-- Aktuální budget (singleton)
create table budget (
 id int primary key default 1,
 spolek integer default 0, -- Kč
 as_amount integer default 0,-- Kč (AS)
 monthly_installment integer default 7500, -- splátka programování / měsíc
 installment_from date -- od kterého měsíce se splátka odečítá
);

Výchozí sloupce:
- `tasks`: Nápady, K řešení, Probíhá, Ke kontrole, Hotovo
- `print`: Poptávka, Ve výrobě, Hotovo (pevné — bez přidávání/mazání)

---

## 3. Záložka „Úkoly" (kanban)

### 3.1 Tabule
- Sloupce vedle sebe přes celou šířku, horizontální scroll; na mobilu snap po sloupcích (86 vw).
- Hlavička sloupce: název (editovatelný přímo kliknutím, Enter = uložit), počet karet, × smazat sloupec (pokud má úkoly → potvrzení a přesun do prvního sloupce; musí zůstat min. 1 sloupec).
- Na konci „+ Sloupec" (prompt na název).
- Ve sloupci dole „+ Přidat úkol" → formulář s předvyplněným sloupcem.
- **Drag & drop:** přesun karet mezi sloupci i změna pořadí; placeholder (průhledná karta), ghost s rotací 2°, zvýraznění cílového sloupce, autoscroll u okrajů (tabule vodorovně, seznam svisle). Klik bez tažení = otevřít detail.

### 3.2 Filtry (lišta pod hlavičkou)
- **Skupina kategorií** (select): Vše, Muži, Mládež, Merch, Aplikace, Web, Ticketing, Eventy, Foto — u každé počet úkolů.
 - Muži = Muži A, Muži B
 - Mládež = Dorost U16–U19, Žáci U12–U15, Přípravka U8–U11, Školička, Žákyně Mladší/Starší/Přípravka
 - Ostatní skupiny = 1:1 se stejnojmennou kategorií
 - „Celý klub" je vidět jen pod „Vše"
- **Měsíc** (select) podle `due_date`: Všechny měsíce, minulý + aktuální + 11 dalších měsíců + všechny měsíce, kde nějaký úkol termín má, „Bez termínu". U měsíce počet úkolů (respektuje skupinu).
- **Hledání** v názvu, popisu a kategorii.
- **Jen moje úkoly** — kde je zvolená identita vedoucím nebo zodpovědným.

### 3.3 Karta úkolu
Štítek kategorie, název, popis (max 2 řádky), avatary (vedoucí s tmavým prstencem + zodpovědný), termín, „Přílohy N".

Termín: šedý; ≤ 3 dny žlutý; po termínu červený; v posledním sloupci tlumený. Texty „Dnes", „Zítra", jinak `d. m.`.

### 3.4 Formulář úkolu (modal, na mobilu fullscreen)
Kategorie (select s optgroup: Muži / Mládež / Klub a služby), Stav (sloupec), Název*, Předpokládaný termín dokončení (date), Popis, Zodpovědný vedoucí, Zodpovědný za úkol, Přílohy a odkazy (drag & drop souborů nebo výběr, odkaz + popisek; automaticky doplnit `https://`).
Patička: „Založil(a) X, datum", Smazat, Duplikovat (kopie „(kopie)" hned za originál, otevře se), Zrušit, Uložit/Vytvořit. Nový úkol předvyplní kategorii podle aktivního filtru. Esc / klik mimo = zavřít.

---

## 4. Záložka „Tiskoviny"

Stejná tabule jako Úkoly s těmito rozdíly:
- Sloupce pevně **Poptávka, Ve výrobě, Hotovo** — bez přejmenování, mazání a přidávání; sloupce vyplní šířku.
- Místo kategorie **Typ média**; tlačítko **Typy médií** → správa (přejmenovat = propsat do všech položek, smazat = přesun položek do prvního typu s potvrzením, přidat). Min. 1 typ.
- Formulář: Typ média, Stav, Název*, **Datum realizace**, Popis, **Počet ks**, **Cena (Kč)**, **Zaplaceno FK FM: Ano / Ne** (výchozí Ne), Přílohy.
- Karta: typ, název, popis, počet ks, datum, přílohy, **cenovka** — červená = FK FM dluží (nezaplaceno), zelená = zaplatil FK FM, šedá „Bez ceny". Žádné osoby.
- Hlavička sloupce ukazuje součet cen.
- Lišta: filtr Typ média (s počty), **Měsíc** podle data realizace (u měsíce rovnou součet Kč), hledání, Typy médií, **Uzavřít rok**, vpravo červený box **„Celkem [za měsíc]"** = součet cen zobrazených položek.
- Archivované položky (uzavřený rok) se na tabuli nezobrazují.

### 4.1 Roční přehled tiskovin („Uzavřít rok")
Celoobrazovková stránka pod hlavní hlavičkou (záložky zůstávají; přepnutí záložky přehled zavře).
- Lišta: ← Zpět na tiskoviny, nadpis „Roční přehled tiskovin", výběr roku, stav „Uzavřeno [datum]", Tisk / PDF, Uzavřít rok Y / Znovu otevřít.
- KPI: Celkem utraceno (položky, ks), Zaplatil FK FM (Kč, %), Dluží FK FM (Kč, %), Průměr na aktivní měsíc + nejdražší měsíc.
- Graf útraty po měsících (12 sloupců, skládaný: zelená zaplaceno / červená dluh).
- Rozpad podle typu média (pruhy, Kč, počet objednávek, ks).
- Soupis položek po měsících (název, typ, ks, cena barevně; u měsíce součet a dluh).
- Upozornění na položky bez data realizace.
- **Uzavřít rok** → potvrzení → `archived = true` pro položky roku + záznam v `print_year_closures`. **Znovu otevřít** → vrátí.
- Tisk: barevně (print-color-adjust), skryté ovládací prvky.

---

## 5. Záložka „Struktura týmu"

### 5.1 Hlavička sekce
Nadpis, legenda barev budgetu (malá kolečka: červená Na dluh, zelená V budgetu, modrá Budoucnost), tlačítka „+ Kategorie" a „+ Přidat člena" (nový uzel na nejvyšší úroveň).

### 5.2 Aktuální budget (rozbalovací box vlevo pod nadpisem)
- Sbalený: „Aktuální budget — zbývá" + částka.
- Rozbalený: **Spolek** (Kč), **AS** (Kč), **Celkem**, **V budgetu** (− součet budgetů členů se zelenou barvou), **Splátka** (pole, hodnota červeně; odečítá se za každý měsíc od `installment_from` včetně aktuálního), **Zbývá** (červeně a s mínusem při přečerpání).
- `Zbývá = Spolek + AS − Σ(green budgets) − splátka × počet měsíců`.
- Stav rozbalení se pamatuje.

### 5.3 Strom
- Org chart shora dolů, spojovací čáry (rovné, navazující), kořen tmavý.
- Dva typy uzlů:
 - **Člen:** avatar (iniciály, barva), jméno, role, štítky oblastí, statistiky „řeší N" (owner, mimo poslední sloupec) a „vede N" (lead), **cenovka budgetu** v barvě stavu, ikona **„i"** vpravo nahoře (jen pokud je info) → bublina s textem, pouze ke čtení.
 - **Kategorie:** barevná karta (volitelná barva, světlé barvy → tmavý text), „Kategorie" + název, počet lidí pod ní, počet rozpracovaných úkolů, pokud název odpovídá kategorii/skupině úkolů.
- Tlačítko „+" pod kartou = nový podřízený.
- **Drag & drop** (myš i dotyk):
 - na střed karty = zařadit pod ni;
 - na levou/pravou třetinu = vedle (sourozenec, změna pořadí); na mobilu horní/dolní třetina;
 - pruh „Pusťte sem — bude na nejvyšší úrovni" se objeví při tažení;
 - kategorie puštěná na člověka s podřízenými → dotaz, zda je vložit mezi něj a podřízené;
 - přesouvá se uzel i s celým podstromem; nelze pustit do vlastního potomka;
 - tooltip u kurzoru („Pod X", „Vlevo vedle X", „Do kategorie X").
- Na mobilu odsazený seznam.

### 5.4 Formulář člena
Jméno*, Role, Krátká informace, Budget (Kč), Barva budgetu (Modrá/Zelená/Červená), Barva profilu (paleta 11 barev), Nadřízený (select: kategorie + členové, bez vlastních potomků), Oblasti (multi chips). Patička: počet přiřazených úkolů, Odebrat (úkoly ztratí přiřazení, podřízení přejdou pod jeho nadřízeného), Duplikovat, Zrušit, Uložit.

### 5.5 Formulář kategorie
Název* (s našeptávačem), Barva kategorie, Zařazení (pod koho). Smazat (vše pod ní o úroveň výš), Duplikovat (včetně podkategorií, bez lidí).

---

## 6. Společné

### 6.1 Hlavička
Tmavá navy lišta: zkrácené logo, „Marketingový plán úkolů", záložky **Úkoly · Tiskoviny · Struktura týmu** (aktivní podtržená modře), výběr identity „Přihlášen", tlačítko „+ Nový úkol" / „+ Nová tiskovina" podle záložky.

### 6.2 Formáty
Kč s mezerou po tisících, vstupy akceptují libovolný text, ukládá se jen číslo (`replace(/\D/g,'')`).

### 6.3 Barvy
- Brand: `--fm-navy #1b2341`, `--fm-blue #0099cf`, `--fm-steel #00588e`
- Stav: zelená `#1f8a4c`, červená `#c62f28`, žlutá (termín) `#fff4dc` / `#8a5a00`
- Paleta avatarů a kategorií: viz `AVC` / `AVPAL` v prototypu (včetně světle šedé `#c4c8ce` s tmavým textem).

### 6.4 Pravidla integrity
- Smazání člena → `tasks.lead_id/owner_id = null`, děti → `parent_id` smazaného.
- Smazání kategorie → děti o úroveň výš.
- Smazání sloupce → úkoly do prvního sloupce.
- Smazání typu tiskoviny → položky do prvního typu.
- Řazení přes `sort_order` (numeric, vkládání mezi = průměr sousedů nebo přečíslování).

---

## 7. API (pokud ne přímo Supabase klient)

GET /api/state -- vše najednou pro první načtení
CRUD /api/members, /api/org-units
PATCH /api/org/move {id, parent_id, before_id|after_id}
CRUD /api/columns (board_id)
CRUD /api/tasks
PATCH /api/tasks/:id/move {column_id, before_id}
CRUD /api/print-types
CRUD /api/print-items
PATCH /api/print-items/:id/move
POST /api/print/years/:year/close
DELETE /api/print/years/:year/close
GET /api/print/years/:year/report -- agregace pro roční přehled
PUT /api/budget
POST /api/attachments (multipart → Storage) / DELETE
Realtime kanál: změny tabulek `tasks`, `print_items`, `members`, `org_units`, `board_columns`, `budget` → refetch / patch klientského stavu.

---

## 8. Migrace z prototypu
Jednorázový import: v prototypu načíst `localStorage['fotbalfm.marketing.v1']` (JSON) a nahrát na `/api/import`. Mapování:
- `S.users` → members (`boss` → parent_id, `color`, `budColor` ''→blue, `ord` → sort_order)
- `S.units` → org_units
- `S.cols` / `S.tasks` → board 'tasks'
- `S.pr.cols` / `S.pr.tasks` / `S.pr.types` / `S.pr.closed` → board 'print', print_items (`cat` → type, `due` → realization_date, `paid==='ano'`, `arch`), closures
- `S.curBud` → budget (`spolek`, `as`, `pays[0].amt` → monthly_installment, `pays[0].from` → installment_from)
- přílohy: `files[].data` (data URL) → nahrát do Storage