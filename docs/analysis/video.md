# Video analysis: `~/Downloads/video.mov`

## Source

| Property | Value |
|---|---|
| Duration | 89.9 s |
| Video | H.264, 3360×2100 (Retina screen capture), 60 fps |
| Audio | AAC mono. **No narration.** Only quiet keyboard and mouse noise: mean −51 dB, energy only in short bursts while typing (6–16 s, 63–70 s). |
| Transcription | Ran faster-whisper (`small`, `language=cs`) and got only empty segments (`...`). The volume profile shows typing, not speech, so there is **no transcript**. |
| Method | 1 frame / 2 s plus 2 frames / s for detail, scene-change detection (threshold 0.08), all scaled to 1280 px. |

The video is a silent walkthrough of the **existing prototype** (the localStorage app the spec describes). The user stays logged in as "Lukáš Rejda" throughout. The video shows **behaviour only**. Nobody says out loud what they want. Everything in "Differences / new details" is **inferred from what the prototype does**. Where the prototype goes beyond `prompt.md` or differs from it, the spec says "keep the prototype's look and behaviour 1:1", so the prototype should win.

---

## Timeline

Times are approximate (±1 s).

### 0:00–0:26 Úkoly: creating a task
- **0:00**: The "NOVÝ ÚKOL" modal is already open, launched from the header button "+ Nový úkol". Defaults: Kategorie = **Celý klub** (filter is "Vše"), Stav = **Nápady** (first column). The Název field has focus. ![](video-frames/01-novy-ukol-modal.jpg)
- **0:02**: Opens the Kategorie select. Native `<select>` with optgroups: "…Školička, Žákyně Mladší, Žákyně Starší, Žákyně Přípravka", then the optgroup **"Klub a služby"**: Celý klub, Merch, Aplikace, Web, Ticketing, Eventy, Foto. Picks **Merch**. ![](video-frames/02-kategorie-select-optgroup.jpg)
- **0:04–0:06**: Stav select (Nápady, K řešení, Probíhá, Ke kontrole, Hotovo). Picks **K řešení**.
- **0:06–0:14**: Types Název "Test" and Popis "Popisek ukolu". Leaves the date empty. The native date input shows the placeholder `dd.mm.rrrr`.
- **0:14–0:20**: Zodpovědný vedoucí select. The list is: "— nevybráno —", Lukáš Rejda, Karin Miková, Daja Kučera, Jan Mikeš, Jakub Balon, **Lukáš Rejda (second time)**, Prázdná pozice ×3, Tomáš Kula, Natálie Kussior, Tomáš Smichovič. Sets the lead to Lukáš Rejda and the owner to Karin Miková, then changes the lead to Karin Miková.
- **0:18**: Hovering the attachment drop zone turns it light blue with a blue dashed border. ![](video-frames/03-prilohy-dropzone-hover.jpg)
- **0:24**: Clicks "Vytvořit úkol". The modal closes.
- **0:26**: A new card appears at the bottom of "K řešení": label MERCH, "Test", "Popisek ukolu", two "KM" avatars (the lead has a dark ring). The counter in the filter changes from "Vše (6)" to "Vše (7)", and the K řešení column count from 2 to 3. ![](video-frames/04-tabule-po-vytvoreni-ukolu.jpg)

### 0:27–0:31 Úkoly: drag & drop
- Drags "Pozvánka na nábor" (Probíhá) into **Nápady** and drops it under the existing card.
  - The original card stays in place as a **translucent placeholder**.
  - The ghost follows the cursor, **rotated about 2°**, with a shadow, and the cursor is a "grabbing" hand.
  - The target column gets a **light blue background and a blue outline**. ![](video-frames/05-ukoly-drag-ghost-placeholder.jpg)
- Drags "Plakát na domácí zápas" from K řešení into Probíhá. Then drags "Představení soupisky" from Ke kontrole into Probíhá, below the Plakát. ![](video-frames/06-ukoly-drag-zvyrazneni-sloupce.jpg)
- An empty column shows "Žádné úkoly" (Ke kontrole, count 0).
- The toolbar's right side always shows the hint "Karty přetahujte myší nebo podržením prstu".

### 0:31–0:36 Filter and identity
- **0:32**: Ticks **"Jen moje úkoly"**. Only the cards where Lukáš Rejda is lead or owner remain. Column counts update and empty columns show "Žádné úkoly". Unticks it again. ![](video-frames/07-jen-moje-ukoly.jpg)
- **0:34**: Opens the header select "Přihlášen". It is native and lists all members, including the duplicate "Lukáš Rejda" and three "Prázdná pozice" entries. Nothing is changed. ![](video-frames/08-prihlasen-identita-select.jpg)

### 0:37–0:52 Tiskoviny
- **0:38**: Switches to the Tiskoviny tab and the header button changes to "+ Nová tiskovina".
  - Toolbar: "Všechny typy (1)", "Všechny měsíce", "Hledat v tiskovinách…", the buttons "TYPY MÉDIÍ" and "UZAVŘÍT ROK", and on the right a red box "CELKEM 4 500 Kč".
  - Three columns fill the full width. Each column header shows a count and a price sum ("0 Kč", "4 500 Kč").
  - Card: label LETÁKY, "Testovací popis", chips "500 ks" and "23. 10.", and a **green price flag "4 500 Kč"** (paid by FK FM).
  - Note: the **CELKEM box is red even though everything is paid**. Its colour is fixed, not tied to payment status.

  ![](video-frames/09-tiskoviny-tabule.jpg)
- **0:40**: Clicking the card opens the "TISKOVINA" modal.
  - Fields: Typ média = Letáky, Stav = Ve výrobě, Název, Datum realizace 23.10.2026, Popis, Počet ks 500, Cena (Kč) 4500 (raw digits, no formatting in the input).
  - "Zaplaceno FK FM" is a pair of toggle buttons "● Ano" (green dot, selected = dark border) and "● Ne" (red dot).
  - Then "Přílohy a odkazy".
  - Footer: "Založil(a) Lukáš Rejda, 13. 10. 2026", SMAZAT (red text), DUPLIKOVAT, ZRUŠIT, ULOŽIT.

  Closes it without changes. ![](video-frames/10-tiskovina-modal-editace.jpg)
- **0:42–0:46**: Drags the card to Poptávka and then back to Ve výrobě. Same drag visuals as Úkoly: faded placeholder, rotated ghost, highlighted target column. Column counts and sums are recalculated after the drop. ![](video-frames/11-tiskoviny-drag.jpg)
- **0:47–0:50**: Opens the card and changes Cena from 4500 to 5000, then clicks Uložit. The card, the column sum and the **CELKEM box all change to 5 000 Kč** right away. ![](video-frames/12-tiskoviny-po-zmene-ceny.jpg)

### 0:52–0:60 Struktura týmu
- Switches to the Struktura týmu tab. The header button **stays "+ Nový úkol"**.
- Page header: eyebrow "MARKETINGOVÝ TÝM", heading "STRUKTURA TÝMU", legend "BUDGET ● Na dluh ● V budgetu ● Budoucnost", buttons "+ KATEGORIE" and "+ PŘIDAT ČLENA".
- Budget box (collapsed, dark): "AKTUÁLNÍ BUDGET · ZBÝVÁ · 7 500 Kč" with a small chevron. It is never expanded in the video.
- The tree:
  - **Root**: Lukáš Rejda, Vedoucí marketingu, chip CELÝ KLUB, "0 řeší 3 vede", green 10 000 Kč. Dark navy card.
  - Three categories: PROGRAMOVÁNÍ (light blue, "2 pod ní 0 úkolů"), INFOSERVIS (steel blue, "5 pod ní"), PRODUKCE A FOTO (grey, "4 pod ní").
  - Programování has Daja Kučera (Aplikace, 100 000 Kč red) and Jan Mikeš (Website, 250 000 Kč red), side by side.
  - Infoservis has Karin Miková (Infoservis mládeže, chip MLÁDEŽ, green 5 000) and Lukáš Rejda (Infoservis mužů, chip MUŽI, green 5 000).
  - Karin Miková has a vertical chain of 3 "Prázdná pozice" cards (Žáci / Přípravka / Dorostenci) with grey "PP" avatars and no price.
  - Produkce a foto has a vertical chain: Jakub Balon (Produkce, CELÝ KLUB, 5 000 green), then Tomáš Kula, then Natálie Kussior, then Tomáš Smicho… (all Fotograf).
  - A long name is **truncated with an ellipsis** ("Tomáš Smicho…").
  - **Layout rule**: an only child sits directly below its parent as a vertical chain. Two or more children sit side by side under a horizontal connector bus.

  ![](video-frames/13-struktura-tymu.jpg)

### 0:60–0:76 New member
- "+ PŘIDAT ČLENA" opens the "NOVÝ ČLEN" modal. ![](video-frames/14-novy-clen-modal.jpg)
- Form fields:
  - "JMÉNO A PŘÍJMENÍ *" (placeholder "Např. Jana Nováková") and "ROLE" ("Např. Sociální sítě")
  - "KRÁTKÁ INFORMACE" textarea ("Např. kontakt, dostupnost, na co se obracet…")
  - "BUDGET" ("Např. 25 000")
  - "BARVA PROFILU", 11 circles: blue, light blue, steel, navy, dark navy, dark grey, green, red, orange, purple, light grey
  - "STAV BUDGETU", toggle buttons "● Na dluh / ● V budgetu / ● Budoucnost". **Budoucnost is selected by default.**
  - "NADŘÍZENÝ" select, default "— nikdo (vedení týmu) —"
  - "OBLASTI, NA KTERÉ SE ZAMĚŘUJE", chips: Celý klub, Muži, Mládež, Merch, Aplikace, Web, Ticketing, Eventy, Foto
  - Footer: ZRUŠIT, PŘIDAT ČLENA
- Fills in: Simona Mikešová, role "Specialista puzzli", info "Testovací", **red** profile colour, budget 5000, chip Mládež. Stav budgetu stays Budoucnost. ![](video-frames/15-novy-clen-vyplneno.jpg)
- After saving, the new member appears as a **second top-level node, to the right of the root**, also as a dark navy card.
  - It shows a blue **"i"** icon top right, because it has info.
  - It shows a **blue price flag "5 000 Kč"** (Budoucnost).
  - "Zbývá 7 500 Kč" does not change, because blue budgets are not subtracted.

  ![](video-frames/16-novy-clen-nejvyssi-uroven.jpg)

### 0:77–0:90 Struktura: drag & drop in the tree
- **0:78**: Starts dragging Simona.
  - The original card stays as a **faded, dashed-outline placeholder**, with a small "+" under it.
  - A dashed bar appears above the tree: **"Pusťte sem — bude na nejvyšší úrovni struktury"**.
  - The ghost is rotated and has a blue outline and a shadow.
  - A dark **tooltip next to the cursor reads "Pod Tomáš Kula"**.

  Dropped: Simona becomes Tomáš Kula's second child. Kula's children change from a vertical chain to two side by side (Natálie Kussior and Simona), and "Produkce a foto" changes to "5 pod ní". The ghost visibly **animates/settles** into place. ![](video-frames/17-strom-drag-pod-x.jpg)
- **0:81**: Drags again. The tooltip reads **"Vpravo vedle Natálie Kussior"**: hovering the side third of the card means "place as sibling". The target card gets a blue outline. ![](video-frames/18-strom-drag-vpravo-vedle.jpg)
- **0:82**: Dropped under Natálie, so Simona becomes the sibling of Tomáš Smichovič. Hovering a card gives it a **blue border and a "+" circle centred on its bottom edge** (add a subordinate). ![](video-frames/19-strom-hover-plus.jpg)
- **0:83**: Drags again. The tooltip reads **"Pod Tomáš Smichovič"**. On drop, Simona joins the bottom of the vertical chain under Tomáš Smichovič. ![](video-frames/20-strom-drag-pod-tomas.jpg)
- **0:85–0:90**: Scrolls the page vertically to check the result. End of the video.

---

## Features observed (matches `prompt.md`)

- Header: logo, "MARKETINGOVÝ PLÁN ÚKOLŮ", tabs with the active one underlined in blue, the "Přihlášen" select, and a primary action button that depends on the tab.
- Úkoly: 5 default columns with counts, "×" to delete, "+ Přidat úkol" at the bottom of each column, a "+ SLOUPEC" column at the end, the filters (group select with count, month, search, "Jen moje úkoly"), and the task form fields exactly as specified (optgroups, Stav, Název*, termín, Popis, vedoucí, zodpovědný, attachments and links).
- Task card: label, name, description, avatars (the lead has a dark ring), "Přílohy 1".
- Drag & drop on both boards: placeholder, rotated ghost, highlighted target column, click without dragging opens the detail.
- Tiskoviny: fixed columns, column price sums, Typ média filter with count, month filter, search, Typy médií, Uzavřít rok, red CELKEM box, the form with Počet ks / Cena / Zaplaceno Ano–Ne, green price flag, "Založil(a)" footer with Smazat / Duplikovat / Zrušit / Uložit.
- Struktura: legend, + Kategorie, + Přidat člena, collapsed budget box, the two node types, "řeší / vede" counts, "N pod ní / N úkolů" on categories, the "i" icon only when there is info, the top-level drop bar, cursor tooltips, moving a whole subtree, and the "+" for adding a subordinate.

## Not demonstrated in the video

Month filter contents, search, column rename/add/delete, attachments (upload or link), Duplikovat, deleting a task, Typy médií management, the year report (Uzavřít rok), expanding the budget box and editing Splátka, the category form, clicking the "i" bubble, dropping a category onto a person with subordinates, mobile/touch layout, realtime between clients.

---

## Differences from / additions to `prompt.md`

There is no narration, so these come from prototype behaviour. Per the spec's "1:1 with the prototype" rule, treat them as requirements unless the owner says otherwise.

1. **Member form layout and wording differ from §5.4.**
   - Label "Jméno a příjmení *", not "Jméno*".
   - Budget status is labelled **"Stav budgetu"**, with buttons named **Na dluh / V budgetu / Budoucnost** and coloured dots. The spec says "Barva budgetu (Modrá/Zelená/Červená)".
   - Field order: Jméno, Role, Krátká informace, Budget, Barva profilu, Stav budgetu, Nadřízený, Oblasti.
   - Nadřízený defaults to "— nikdo (vedení týmu) —".
   - The areas field is labelled "Oblasti, na které se zaměřuje".
   - The new-member submit button reads "Přidat člena".
2. **Several top-level nodes.** A member with no superior shows up as a separate tree **to the right of the existing root**, and every top-level person card uses the dark "root" style. The spec only says "kořen tmavý", so it must support **multiple roots side by side**, each dark.
3. **Tree layout rule.** An only child is drawn **straight below its parent (vertical chain)**. Two or more children are drawn side by side under a horizontal connector. The spec does not mention this.
4. **Tree drag visuals in more detail than §5.3:**
   - The source card stays as a faded, dashed placeholder.
   - The ghost is rotated and has a blue outline.
   - The target card gets a blue outline.
   - The tooltip uses dark pill styling with the exact wording "Pod X" and "Vpravo vedle X" (and by symmetry "Vlevo vedle X").
   - The top-level bar text is "Pusťte sem — bude na nejvyšší úrovni **struktury**". The spec has it without "struktury".
   - There is a drop/settle animation.
5. **Node hover state.** Hovering a card gives it a blue border, and the "+" (add subordinate) is a small circle **centred on the card's bottom edge**. It shows on hover only.
6. **Truncation.** Long names on tree cards are cut with an ellipsis ("Tomáš Smicho…").
7. **Struktura tab header button** stays "+ Nový úkol". §6.1 only defines the Úkoly and Tiskoviny variants.
8. **CELKEM box** on Tiskoviny is always red, even when all items are paid. Its label is just "CELKEM" when "Všechny měsíce" is selected.
9. **Tiskovina card chips.** Quantity and date are grey chips ("500 ks", "23. 10."), and the price is a slanted "flag" tag in the bottom right. Member cards in the tree use the same flag style for budgets.
10. **Toolbar hint** "Karty přetahujte myší nebo podržením prstu" sits on the right of the Úkoly toolbar. It is not in the spec. Tiskoviny shows the CELKEM box in that place instead.
11. **Empty-column text**: "Žádné úkoly" and "Žádné tiskoviny".
12. **Drop-zone hover state** for attachments: light blue fill and a blue dashed border.
13. **Default values seen**:
    - A new task from the header button gets Kategorie "Celý klub" (filter "Vše") and Stav = first column.
    - A new member gets Stav budgetu "Budoucnost" (blue) and no superior.
    - "Zaplaceno" was "Ano" on the existing item. The spec's default "Ne" for new items was not shown.
14. **Placeholders** to copy verbatim:
    - Task: "Např. Plakát na domácí zápas", "Co je potřeba udělat, termíny, formáty…" (also used in the Tiskovina Popis), "https://…", "Popisek (nepovinné)", button "Přidat odkaz", "Přetáhněte soubory sem nebo **vyberte ze zařízení**".
    - Member: "Např. Jana Nováková", "Např. Sociální sítě", "Např. kontakt, dostupnost, na co se obracet…", "Např. 25 000".
    - Search: "Hledat v úkolech…", "Hledat v tiskovinách…".
15. **Data / UX issues the video exposes.** None of these are requested. They are worth raising with the owner:
    - There are two members named "Lukáš Rejda" (the root and "Infoservis mužů"). The identity select and the lead/owner selects show **names only**, so they are ambiguous. Showing the role or the category next to the name would fix it.
    - "Prázdná pozice" (vacant position) placeholders appear in the identity select and in the task assignee selects. It may be better to filter them out or mark them as vacant.
    - Member order in the selects is neither alphabetical nor tree order. It looks like creation order.
16. **Native controls.** The prototype uses native `<select>` and `<input type=date>` (Czech locale `dd.mm.rrrr`). A faithful 1:1 port can keep native controls.

## Frames

All frames are in `docs/analysis/video-frames/`, 1280 px wide:

| # | File | Content |
|---|---|---|
| 01 | `01-novy-ukol-modal.jpg` | Empty "Nový úkol" modal |
| 02 | `02-kategorie-select-optgroup.jpg` | Category select with the "Klub a služby" optgroup |
| 03 | `03-prilohy-dropzone-hover.jpg` | Attachment drop zone in hover state |
| 04 | `04-tabule-po-vytvoreni-ukolu.jpg` | Board after creating "Test" |
| 05 | `05-ukoly-drag-ghost-placeholder.jpg` | Task drag: ghost and placeholder |
| 06 | `06-ukoly-drag-zvyrazneni-sloupce.jpg` | Task drag: highlighted target column |
| 07 | `07-jen-moje-ukoly.jpg` | "Jen moje úkoly" filter |
| 08 | `08-prihlasen-identita-select.jpg` | Identity select (duplicates, vacancies) |
| 09 | `09-tiskoviny-tabule.jpg` | Tiskoviny board |
| 10 | `10-tiskovina-modal-editace.jpg` | Tiskovina edit modal |
| 11 | `11-tiskoviny-drag.jpg` | Tiskoviny drag |
| 12 | `12-tiskoviny-po-zmene-ceny.jpg` | Totals after the price change |
| 13 | `13-struktura-tymu.jpg` | Org chart overview |
| 14 | `14-novy-clen-modal.jpg` | Empty "Nový člen" modal |
| 15 | `15-novy-clen-vyplneno.jpg` | Filled member form |
| 16 | `16-novy-clen-nejvyssi-uroven.jpg` | New member as a second root |
| 17 | `17-strom-drag-pod-x.jpg` | Tree drag "Pod Tomáš Kula", top-level drop bar |
| 18 | `18-strom-drag-vpravo-vedle.jpg` | Tree drag "Vpravo vedle Natálie Kussior" |
| 19 | `19-strom-hover-plus.jpg` | Hover state with the "+" button |
| 20 | `20-strom-drag-pod-tomas.jpg` | Tree drag "Pod Tomáš Smichovič" |
