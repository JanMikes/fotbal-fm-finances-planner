import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { card, column, columnsOf, createPerson, deleteNode, getState, mouseDrag, openApp, touchDrag } from "./boards-helpers";
import { expectNoA11yViolations, expectValue, optionText, pick, setDate } from "./ui-helpers";

/**
 * Úkoly tab (prototype §7, §8): task CRUD, modal behaviour, columns, drag & drop (mouse + touch), filters,
 * attachments and realtime sync. Everything this spec creates carries TAG and the search box is set to TAG, so it
 * is isolated from other data (demo seed / other specs).
 */
const PASSWORD = process.env.APP_PASSWORD ?? "dev-password";
const TAG = `E2E-T${Date.now().toString(36)}`;
const persons: { a: string; b: string } = { a: "", b: "" };
const createdColumns: string[] = [];

test.describe.configure({ mode: "serial" });

async function login(request: APIRequestContext) {
  expect((await request.post("/api/auth/login", { data: { password: PASSWORD } })).status()).toBe(200);
}

async function createTask(request: APIRequestContext, data: { columnId: string; title: string; category?: string; dueDate?: string | null; leadId?: string | null; ownerId?: string | null }) {
  const res = await request.post("/api/tasks", { data: { category: "Celý klub", description: "", ...data } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function open(page: Page, q = TAG) {
  await openApp(page, { me: persons.a, view: "board" });
  await page.locator("#q").fill(q);
}

test.beforeAll(async ({ request }) => {
  await login(request);
  persons.a = await createPerson(request, `${TAG} Alena Nová`);
  persons.b = await createPerson(request, `${TAG} Boris Malý`);
});

test.beforeEach(async ({ request }) => {
  await login(request);
});

test.afterAll(async ({ request }) => {
  await login(request);
  const s = await getState(request);
  for (const t of s.tasks.filter((t) => t.title.includes(TAG))) await request.delete(`/api/tasks/${t.id}`);
  for (const id of createdColumns) await request.delete(`/api/columns/${id}`);
  for (const c of columnsOf(s, "tasks").filter((c) => c.title.includes(TAG))) await request.delete(`/api/columns/${c.id}`);
  await deleteNode(request, persons.a);
  await deleteNode(request, persons.b);
});

test("create, edit, duplicate and delete a task", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  await open(page);
  await page.locator("#btnNew").click();
  const modal = page.getByTestId("task-modal");
  await expect(modal.locator(".mh h2")).toHaveText("Nový úkol");
  await expectValue(modal.locator("#fCat"), "Celý klub");
  await expectValue(modal.locator("#fCol"), cols[0].id);
  await expect(modal.locator("#fTitle")).toBeFocused();
  await expect(modal.locator("#del")).toHaveCount(0);

  await pick(page, modal.locator("#fCat"), "Merch");
  await pick(page, modal.locator("#fCol"), cols[1].id);
  await modal.locator("#fTitle").fill(`${TAG} Plakát`);
  // Czech date entry: typed „15. 6. 2031" is understood and normalised on blur (with the weekday)
  await setDate(modal.locator("#fDue"), "15. 6. 2031");
  await expect(modal.locator("#fDue")).toHaveValue("ne 15. 6. 2031");
  await expectValue(modal.locator("#fDue"), "2031-06-15");
  await modal.locator("#fDesc").fill("Popisek úkolu");
  await pick(page, modal.locator("#fLead"), persons.a);
  await pick(page, modal.locator("#fOwner"), persons.b);
  await modal.getByRole("button", { name: "Vytvořit úkol" }).click();
  await expect(modal).toHaveCount(0);

  const c = card(page, `${TAG} Plakát`);
  await expect(c).toHaveCount(1);
  await expect(column(page, cols[1].title).locator(".card", { hasText: `${TAG} Plakát` })).toHaveCount(1);
  await expect(c.locator(".cat")).toHaveText("Merch");
  await expect(c.locator("p")).toHaveText("Popisek úkolu");
  await expect(c.locator(".av.lead")).toHaveText("EA"); // initials of „E2E-T… Alena"
  await expect(c.locator(".av.lead")).toHaveAttribute("title", `Vedoucí: ${TAG} Alena Nová`);
  await expect(c.locator(".av:not(.lead)")).toHaveAttribute("title", `Zodpovědný: ${TAG} Boris Malý`);
  await expect(c.locator(".due")).toHaveText("15. 6. 2031"); // other year → with the year
  await expect(c.locator(".due")).toHaveAttribute("title", /^Termín dokončení: 15\.\s6\.\s2031 — za \d+ dní$/);

  // edit
  await c.click();
  await expect(modal.locator(".mh h2")).toHaveText("Úkol");
  await expect(modal.locator(".meta")).toContainText(`Založil(a) ${TAG} Alena Nová ·`);
  await expect(modal.locator("#fDue")).toHaveValue("ne 15. 6. 2031");
  await modal.locator("#fTitle").fill(`${TAG} Plakát A3`);
  await modal.getByRole("button", { name: "Uložit" }).click();
  await expect(modal).toHaveCount(0);
  await expect(card(page, `${TAG} Plakát A3`)).toHaveCount(1);

  // duplicate → opens the copy, placed right after the original
  await card(page, `${TAG} Plakát A3`).click();
  await modal.getByRole("button", { name: "Duplikovat" }).click();
  await expect(modal.locator("#fTitle")).toHaveValue(`${TAG} Plakát A3 (kopie)`);
  await modal.getByRole("button", { name: "Zrušit" }).click();
  const titles = await column(page, cols[1].title).locator(".card h3").allTextContents();
  expect(titles.indexOf(`${TAG} Plakát A3 (kopie)`)).toBe(titles.indexOf(`${TAG} Plakát A3`) + 1);

  // delete (native confirm)
  await card(page, `${TAG} Plakát A3 (kopie)`).click();
  page.once("dialog", (d) => {
    expect(d.type()).toBe("confirm");
    expect(d.message()).toBe("Opravdu smazat úkol?");
    void d.accept();
  });
  await modal.getByRole("button", { name: "Smazat" }).click();
  await expect(card(page, `${TAG} Plakát A3 (kopie)`)).toHaveCount(0);
  await expect(card(page, `${TAG} Plakát A3`)).toHaveCount(1);
});

test("modal: required title, Esc / overlay close, prefill from filter and column", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  await open(page);
  await page.locator("#btnNew").click();
  const modal = page.getByTestId("task-modal");
  await modal.getByRole("button", { name: "Vytvořit úkol" }).click();
  await expect(modal).toBeVisible();
  await expect(modal.locator("#fTitle")).toHaveCSS("border-top-color", "rgb(179, 38, 30)");
  await expect(modal.locator("#fTitle")).toHaveAttribute("aria-invalid", "true");
  await expect(modal.locator("#fTitle")).toBeFocused();
  await expect(modal.locator("#fTitle-err")).toHaveText("Vyplňte název úkolu");
  await expect(modal.locator("#fTitle")).toHaveAttribute("aria-describedby", "fTitle-err");
  // typing clears the error
  await modal.locator("#fTitle").fill("x");
  await expect(modal.locator("#fTitle-err")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  await page.locator("#btnNew").click();
  await expect(modal).toBeVisible();
  await page.locator(".ov").click({ position: { x: 5, y: 5 } });
  await expect(modal).toHaveCount(0);

  // category from the active group filter (its first category) + column from the column's „+ Přidat úkol"
  await pick(page, "#grp", "Mládež");
  await column(page, cols[2].title).locator(".add").click();
  await expectValue(modal.locator("#fCat"), "Dorost U16");
  await expectValue(modal.locator("#fCol"), cols[2].id);
  await page.keyboard.press("Escape");
});

test("columns: add (prompt), rename inline, delete with confirm", async ({ page, request }) => {
  await open(page);
  const before = columnsOf(await getState(request), "tasks");

  // whitespace-only name is rejected
  page.once("dialog", (d) => void d.accept("   "));
  await page.locator("#addCol").click();
  await page.waitForTimeout(300);
  expect(columnsOf(await getState(request), "tasks")).toHaveLength(before.length);

  page.once("dialog", (d) => {
    expect(d.type()).toBe("prompt");
    expect(d.message()).toBe("Název sloupce");
    expect(d.defaultValue()).toBe("Nový sloupec");
    void d.accept(`  ${TAG} Sloupec  `);
  });
  await page.locator("#addCol").click();
  await expect(column(page, `${TAG} Sloupec`)).toHaveCount(1);
  await expect(page.locator("#board .col").last().locator(".t")).toHaveText(`${TAG} Sloupec`);
  await expect(page.locator("#board .col").last().locator(".empty-col")).toHaveText("Žádné úkoly");

  // rename right away: the store holds the rename until the optimistic create has reached the server (no 404)
  const t = column(page, `${TAG} Sloupec`).locator(".t");
  await t.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(`${TAG} Přejmenováno`);
  await page.keyboard.press("Enter");
  await expect(column(page, `${TAG} Přejmenováno`)).toHaveCount(1);
  await expect.poll(async () => columnsOf(await getState(request), "tasks").some((c) => c.title === `${TAG} Přejmenováno`)).toBe(true);
  await expect(page.locator(".app-toast")).toHaveCount(0);

  // empty rename restores the old title
  await column(page, `${TAG} Přejmenováno`).locator(".t").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await expect(column(page, `${TAG} Přejmenováno`)).toHaveCount(1);

  // delete with a task inside → confirm, task moves to the first column
  const col = columnsOf(await getState(request), "tasks").find((c) => c.title === `${TAG} Přejmenováno`)!;
  const taskId = await createTask(request, { columnId: col.id, title: `${TAG} V mazaném sloupci` });
  await expect(column(page, `${TAG} Přejmenováno`).locator(".card")).toHaveCount(1);
  page.once("dialog", (d) => {
    expect(d.message()).toBe("Sloupec obsahuje 1 úkol. Přesunout ho do prvního sloupce a sloupec smazat?");
    void d.accept();
  });
  await column(page, `${TAG} Přejmenováno`).locator(".x").click();
  await expect(column(page, `${TAG} Přejmenováno`)).toHaveCount(0);
  await expect
    .poll(async () => {
      const s = await getState(request);
      return s.tasks.find((x) => x.id === taskId)?.columnId === columnsOf(s, "tasks")[0].id;
    })
    .toBe(true);
});

test("drag & drop with the mouse: reorder, move across columns, ghost/placeholder, click opens", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  const t1 = await createTask(request, { columnId: cols[0].id, title: `${TAG} DnD jedna` });
  const t2 = await createTask(request, { columnId: cols[0].id, title: `${TAG} DnD dva` });
  await open(page, `${TAG} DnD`);
  await expect(card(page, `${TAG} DnD dva`)).toBeVisible();

  // mid-drag visuals
  const src = card(page, `${TAG} DnD dva`);
  const box = (await src.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 4 });
  await expect(page.locator("body > .card.ghost")).toBeVisible();
  await expect(page.locator("#board .card.ph")).toHaveCount(1);
  await expect(page.locator("body")).toHaveClass(/dragging/);
  const target = column(page, cols[2].title);
  const tb = (await target.boundingBox())!;
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 120, { steps: 10 });
  await expect(target).toHaveClass(/over/);
  await page.mouse.up();
  await expect(page.locator("body > .card.ghost")).toHaveCount(0);
  await expect(target.locator(".card", { hasText: `${TAG} DnD dva` })).toHaveCount(1);
  await expect(page.getByTestId("task-modal")).toHaveCount(0); // a drag is not a click
  await expect.poll(async () => (await getState(request)).tasks.find((t) => t.id === t2)?.columnId).toBe(cols[2].id);

  // move „jedna" above „dva" in column 3
  await mouseDrag(page, card(page, `${TAG} DnD jedna`), card(page, `${TAG} DnD dva`), { yFrac: 0.15 });
  await expect(target.locator(".card h3")).toHaveText([`${TAG} DnD jedna`, `${TAG} DnD dva`]);
  await expect
    .poll(async () => {
      const s = await getState(request);
      const a = s.tasks.find((t) => t.id === t1)!;
      const b = s.tasks.find((t) => t.id === t2)!;
      return a.columnId === cols[2].id && a.sortOrder < b.sortOrder;
    })
    .toBe(true);

  // a plain click opens the detail
  await card(page, `${TAG} DnD jedna`).click();
  await expect(page.getByTestId("task-modal").locator("#fTitle")).toHaveValue(`${TAG} DnD jedna`);
});

test("drop while filtered goes before the next VISIBLE card (prototype rule)", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  const a = await createTask(request, { columnId: cols[1].id, title: `${TAG} F vis A` });
  const h = await createTask(request, { columnId: cols[1].id, title: `${TAG} F hidden` });
  const b = await createTask(request, { columnId: cols[1].id, title: `${TAG} F vis B` });
  const x = await createTask(request, { columnId: cols[0].id, title: `${TAG} F vis X` });
  await open(page, `${TAG} F vis`);
  await expect(column(page, cols[1].title).locator(".card")).toHaveCount(2);
  await mouseDrag(page, card(page, `${TAG} F vis X`), card(page, `${TAG} F vis B`), { yFrac: 0.2 });
  await expect(column(page, cols[1].title).locator(".card h3")).toHaveText([`${TAG} F vis A`, `${TAG} F vis X`, `${TAG} F vis B`]);
  await expect
    .poll(async () => {
      const s = await getState(request);
      return s.tasks
        .filter((t) => [a, h, b, x].includes(t.id))
        .sort((p, q) => p.sortOrder - q.sortOrder)
        .map((t) => t.title.replace(`${TAG} F `, ""));
    })
    .toEqual(["vis A", "hidden", "vis X", "vis B"]);
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("drag & drop by touch: hold 220 ms, then move", async ({ page, request }) => {
    const cols = columnsOf(await getState(request), "tasks");
    const id = await createTask(request, { columnId: cols[0].id, title: `${TAG} Touch` });
    await open(page, `${TAG} Touch`);
    await page.evaluate(() => {
      (window as unknown as { __vibrated: number[] }).__vibrated = [];
      navigator.vibrate = ((p: number) => {
        (window as unknown as { __vibrated: number[] }).__vibrated.push(p);
        return true;
      }) as typeof navigator.vibrate;
    });
    await touchDrag(page, card(page, `${TAG} Touch`), column(page, cols[1].title).locator(".list"), { yFrac: 0.3 });
    await expect(column(page, cols[1].title).locator(".card", { hasText: `${TAG} Touch` })).toHaveCount(1);
    await expect.poll(async () => (await getState(request)).tasks.find((t) => t.id === id)?.columnId).toBe(cols[1].id);
    expect(await page.evaluate(() => (window as unknown as { __vibrated: number[] }).__vibrated)).toEqual([15]);
  });
});

test("filters: group (with counts), month, search, Jen moje úkoly", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await createTask(request, { columnId: cols[0].id, title: `${TAG} Flt muži`, category: "Muži A", dueDate: `${thisMonth}-15`, leadId: persons.a });
  await createTask(request, { columnId: cols[0].id, title: `${TAG} Flt merch`, category: "Merch", ownerId: persons.b });
  await createTask(request, { columnId: cols[1].id, title: `${TAG} Flt dorost`, category: "Dorost U17", ownerId: persons.a });
  await open(page, `${TAG} Flt`);
  const cards = page.locator("#board .card h3");
  await expect(cards).toHaveCount(3);

  expect(await optionText(page, "#grp", "Muži")).toMatch(/^Muži \(\d+\)$/);
  await pick(page, "#grp", "Muži");
  await expect(cards).toHaveText([`${TAG} Flt muži`]);
  await pick(page, "#grp", "Vše");

  await pick(page, "#mon", "none");
  await expect(cards).toHaveCount(2);
  await pick(page, "#mon", thisMonth);
  await expect(cards).toHaveText([`${TAG} Flt muži`]);
  await pick(page, "#mon", "all");

  await page.locator("#mine").check();
  await expect(cards).toHaveText([`${TAG} Flt muži`, `${TAG} Flt dorost`]);
  await expect(column(page, cols[0].title).locator(".c")).toHaveText("1");
  await page.locator("#mine").uncheck();

  await page.locator("#q").fill(`${TAG} Flt merch`);
  await expect(cards).toHaveText([`${TAG} Flt merch`]);
  await expect(column(page, cols[1].title).locator(".empty-col")).toHaveText("Žádné úkoly");
  await expect(page.locator(".board-empty")).toHaveCount(0); // something is still shown
});

test("filtered empty state: banner + „Zrušit filtry“ resets the filters and the search; „/“ focuses the search", async ({ page }) => {
  await openApp(page, { me: persons.a, view: "board", filter: "Muži", month: "none", mine: true });
  await page.locator("#q").fill(`${TAG} nic takového`);
  await expect(page.locator("#board .card")).toHaveCount(0);
  const banner = page.locator(".board-empty");
  await expect(banner).toContainText("Filtru neodpovídá žádný úkol.");
  await expect(page.locator(".board-status")).toHaveAttribute("role", "status");
  await expect(page.locator("#board .col").first().locator(".empty-col")).toHaveText("Žádné úkoly"); // per-column texts stay
  await banner.getByRole("button", { name: "Zrušit filtry" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator("#q")).toHaveValue("");
  await expect(page.locator("#q")).toBeFocused();
  await expectValue(page.locator("#grp"), "Vše");
  await expectValue(page.locator("#mon"), "all");
  await expect(page.locator("#mine")).not.toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fotbalfm.ui.v1") ?? "{}"))).toMatchObject({ filter: "Vše", month: "all", mine: false });

  // „/" jumps to the search from anywhere on the board (but not while typing in a field)
  await page.locator("#board .col").first().locator(".add").focus();
  await page.keyboard.press("/");
  await expect(page.locator("#q")).toBeFocused();
  await page.keyboard.type("a/b");
  await expect(page.locator("#q")).toHaveValue("a/b");
});

test("keyboard: Tab to a card, Enter / Space open it, Esc closes and focus returns to the card", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  await createTask(request, { columnId: cols[0].id, title: `${TAG} Klávesnice` });
  await open(page, `${TAG} Klávesnice`);
  const c = card(page, `${TAG} Klávesnice`);
  await expect(c).toHaveAttribute("role", "button");
  await expect(c).toHaveAttribute("tabindex", "0");
  // Tab from the column header reaches the card
  await column(page, cols[0].title).locator(".x").focus();
  await page.keyboard.press("Tab");
  await expect(c).toBeFocused();
  await page.keyboard.press("Enter");
  const modal = page.getByTestId("task-modal");
  await expect(modal.locator("#fTitle")).toHaveValue(`${TAG} Klávesnice`);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(c).toBeFocused();
  await page.keyboard.press(" ");
  await expect(modal).toBeVisible();
  // Ctrl/Cmd+Enter saves
  await modal.locator("#fTitle").fill(`${TAG} Klávesnice 2`);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(modal).toHaveCount(0);
  await expect(card(page, `${TAG} Klávesnice 2`)).toHaveCount(1);
  // names of the column controls
  await expect(column(page, cols[0].title).locator(".x")).toHaveAttribute("aria-label", `Smazat sloupec ${cols[0].title}`);
  await expect(column(page, cols[0].title).locator(".t")).toHaveAttribute("role", "textbox");
  await expect(column(page, cols[0].title).locator(".t")).toHaveAttribute("aria-label", "Název sloupce");
});

test("a11y: board, filter popup, task modal (new / existing / validation), calendar — no serious axe violations", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  await createTask(request, { columnId: cols[1].id, title: `${TAG} Axe`, dueDate: "2031-06-15", leadId: persons.a });
  await open(page, `${TAG} Axe`);
  const scope = { include: ["#tbar", "#board", ".board-status"] };
  await expectNoA11yViolations(page, scope);
  await page.locator("#mon").click();
  await expect(page.locator("#mon-listbox")).toBeVisible();
  await expectNoA11yViolations(page, { include: ["#tbar", "[data-fm-layer]"] });
  await page.keyboard.press("Escape");

  await page.locator("#q").fill(`${TAG} nic`);
  await expect(page.locator(".board-empty")).toBeVisible();
  await expectNoA11yViolations(page, scope);
  await page.locator("#q").fill(`${TAG} Axe`);

  const modal = page.getByTestId("task-modal");
  await card(page, `${TAG} Axe`).click();
  await expect(modal).toBeVisible();
  await expectNoA11yViolations(page, { include: ".modal" });
  await modal.locator(".fm-date__btn").click();
  await expect(page.locator('[role="dialog"][aria-label="Vybrat datum"]')).toBeVisible();
  await expectNoA11yViolations(page, { include: [".modal", "[data-fm-layer]"] });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  await page.locator("#btnNew").click();
  await modal.getByRole("button", { name: "Vytvořit úkol" }).click();
  await expect(modal.locator("#fTitle-err")).toBeVisible();
  await expectNoA11yViolations(page, { include: ".modal" });
});

test.describe("mobile filter bar", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("search + „Filtry (n)“ toggle; the board keeps ≥ 560 px", async ({ page }) => {
    await openApp(page, { me: persons.a, view: "board", filter: "Muži" });
    const toggle = page.locator("#tbar .fbar-toggle");
    await expect(page.locator("#q")).toBeVisible();
    await expect(toggle).toHaveText("Filtry (1)");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "tbar-panel");
    await expect(page.locator("#grp")).toBeHidden();
    const board = (await page.locator("#board").boundingBox())!;
    expect(board.height).toBeGreaterThanOrEqual(560);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); // no sideways page scroll
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#grp")).toBeVisible();
    await expect(page.locator("#mine")).toBeVisible();
    // the select opens as a bottom sheet on touch
    await page.locator("#grp").click();
    await expect(page.locator(".fm-sheet")).toBeVisible();
    await page.locator('#grp-listbox [role="option"][data-value="Vše"]').click();
    await expectValue(page.locator("#grp"), "Vše");
    await expect(toggle).toHaveText("Filtry");
    await expectNoA11yViolations(page, { include: ["#tbar", "#board"] });
  });
});

test("attachments: upload a file and add a link (https:// auto-prefix)", async ({ page }) => {
  await open(page);
  await page.locator("#btnNew").click();
  const modal = page.getByTestId("task-modal");
  await modal.locator("#fTitle").fill(`${TAG} Přílohy`);
  await modal.locator("#fFile").setInputFiles({ name: "zadani.txt", mimeType: "text/plain", buffer: Buffer.from("Ahoj FM") });
  await expect(modal.locator(".item", { hasText: "zadani.txt" }).locator(".ty")).toHaveText("Soubor");
  await modal.locator("#lUrl").fill("fotbalfm.cz/nabor");
  await modal.locator("#lLabel").fill("Nábor");
  await modal.locator("#lUrl").press("Enter");
  const link = modal.locator(".item", { hasText: "Nábor" });
  await expect(link.locator(".ty")).toHaveText("Odkaz");
  await expect(link.locator("a")).toHaveAttribute("href", "https://fotbalfm.cz/nabor");
  await expect(modal.locator("#lUrl")).toHaveValue("");
  await modal.getByRole("button", { name: "Vytvořit úkol" }).click();
  await expect(modal).toHaveCount(0);
  await expect(card(page, `${TAG} Přílohy`).locator(".att")).toHaveText("Přílohy 2");

  await card(page, `${TAG} Přílohy`).click();
  const fileLink = modal.locator(".item", { hasText: "zadani.txt" }).locator("a");
  const href = await fileLink.getAttribute("href");
  expect(href).toMatch(/^\/api\/attachments\/[0-9a-f-]+\/file$/);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe("Ahoj FM");
  // remove the link and save → 1 attachment left
  await modal.locator(".item", { hasText: "Nábor" }).getByRole("button", { name: "Odebrat" }).click();
  await modal.getByRole("button", { name: "Uložit" }).click();
  await expect(card(page, `${TAG} Přílohy`).locator(".att")).toHaveText("Přílohy 1");
});

test("realtime: a change in one browser appears in another without reload", async ({ browser, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await open(a, `${TAG} RT`);
    await open(b, `${TAG} RT`);
    await a.waitForTimeout(500); // let both SSE streams connect

    await a.locator("#btnNew").click();
    await a.getByTestId("task-modal").locator("#fTitle").fill(`${TAG} RT nový`);
    await a.getByTestId("task-modal").getByRole("button", { name: "Vytvořit úkol" }).click();
    await expect(card(b, `${TAG} RT nový`)).toBeVisible({ timeout: 10_000 });
    await expect(column(b, cols[0].title).locator(".card", { hasText: `${TAG} RT nový` })).toHaveCount(1);

    // move in B → visible in A
    await mouseDrag(b, card(b, `${TAG} RT nový`), column(b, cols[3].title).locator(".list"), { yFrac: 0.2 });
    await expect(column(a, cols[3].title).locator(".card", { hasText: `${TAG} RT nový` })).toHaveCount(1, { timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
