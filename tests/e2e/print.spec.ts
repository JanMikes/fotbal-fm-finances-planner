import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { dueInfo } from "../../src/lib/due";
import { card, column, columnsOf, getState, mouseDrag, openApp } from "./boards-helpers";
import { expectNoA11yViolations, expectValue, optionText, optionTexts, pick, setDate } from "./ui-helpers";

const NB = "\u00a0";

/**
 * Tiskoviny tab (prototype §9): item CRUD with price → column sum + „Celkem", paid/owed/none tags, fixed columns,
 * type management, drag & drop, archived items hidden, „Uzavřít rok" opens the yearly report.
 * Everything carries TAG and the search box is set to TAG so other data does not interfere.
 */
const PASSWORD = process.env.APP_PASSWORD ?? "dev-password";
const TAG = `E2E-P${Date.now().toString(36)}`;
const ARCHIVE_YEAR = 2016;

test.describe.configure({ mode: "serial" });

async function login(request: APIRequestContext) {
  expect((await request.post("/api/auth/login", { data: { password: PASSWORD } })).status()).toBe(200);
}

async function createItem(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post("/api/print-items", { data });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const firstType = async (request: APIRequestContext) => [...(await getState(request)).printTypes].sort((a, b) => a.sortOrder - b.sortOrder)[0];

async function open(page: Page, q = TAG) {
  await openApp(page, { view: "print" });
  await page.locator("#pq").fill(q);
}

test.beforeEach(async ({ request }) => {
  await login(request);
});

test.afterAll(async ({ request }) => {
  await login(request);
  await request.delete(`/api/print/years/${ARCHIVE_YEAR}/close`);
  const s = await getState(request);
  for (const i of s.printItems.filter((i) => i.title.includes(TAG))) await request.delete(`/api/print-items/${i.id}`);
  for (const t of s.printTypes.filter((t) => t.name.includes(TAG))) await request.delete(`/api/print-types/${t.id}`);
});

test("fixed columns: no rename, no delete, no „+ Sloupec“; header button text", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "print");
  await open(page);
  await expect(page.locator("#board")).toHaveClass(/pboard/);
  await expect(page.locator("#board .col .t")).toHaveText(cols.map((c) => c.title));
  await expect(page.locator("#board .col .t[contenteditable]")).toHaveCount(0);
  await expect(page.locator("#board .colh .x")).toHaveCount(0);
  await expect(page.locator("#addCol")).toHaveCount(0);
  await expect(page.locator("#btnNew")).toHaveText("+ Nová tiskovina");
  await expect(page.locator("#board .col").first().locator(".empty-col")).toHaveText("Žádné tiskoviny");
  await expect(page.locator("#board .col").first().locator(".add")).toHaveText("+ Přidat tiskovinu");
});

test("create item with price → column sum and „Celkem“; paid / owed / none tags; edit", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "print");
  const type = await firstType(request);
  await open(page);
  await expect(page.locator("#ptot")).toHaveText("0 Kč");

  await page.locator("#btnNew").click();
  const modal = page.getByTestId("print-modal");
  await expect(modal.locator(".mh h2")).toHaveText("Nová tiskovina");
  await expectValue(modal.locator("#fCat"), type.id);
  await expectValue(modal.locator("#fCol"), cols[0].id);
  await expect(modal.locator("input[name=fPaid][value=ne]")).toBeChecked();
  await expect(modal.locator("#fTitle")).toBeFocused();
  await modal.locator("#fTitle").fill(`${TAG} Letáky`);
  // Czech date entry, normalised with the weekday on blur
  await setDate(modal.locator("#fDue"), "20.11.2026");
  await expect(modal.locator("#fDue")).toHaveValue("pá 20. 11. 2026");
  await expectValue(modal.locator("#fDue"), "2026-11-20");
  await modal.locator("#fQty").fill("1 000 ks");
  await modal.locator("#fPrice").fill("4 500 Kč");
  await modal.locator("#fPrice").press("Tab");
  await expect(modal.locator("#fPrice")).toHaveValue(`4${NB}500`); // formatted on blur, unit as an adornment
  await expect(modal.locator("#fQty")).toHaveValue(`1${NB}000`);
  await modal.getByRole("button", { name: "Přidat tiskovinu" }).click();
  await expect(modal).toHaveCount(0);

  const c = card(page, `${TAG} Letáky`);
  await expect(c.locator(".cat")).toHaveText(type.name);
  await expect(c.locator(".qty")).toHaveText("1 000 ks");
  await expect(c.locator(".due")).toHaveText(dueInfo("2026-11-20", false, new Date(), "Datum realizace: ").text);
  await expect(c.locator(".due")).toHaveAttribute("title", /^Datum realizace: 20\.\s11\.\s2026( — |$)/);
  await expect(c.locator(".price")).toHaveText("4 500 Kč");
  await expect(c.locator(".price")).toHaveClass(/owed/);
  await expect(c.locator(".price")).toHaveAttribute("title", "Dluží FK FM");
  await expect(c.locator(".price + .sr-only")).toHaveText("dluží FK FM");
  await expect(c.locator(".av")).toHaveCount(0); // no people on print cards
  await expect(column(page, cols[0].title).locator(".sum")).toHaveText("4 500 Kč");
  await expect(page.locator("#ptotL")).toHaveText("Celkem");
  await expect(page.locator("#ptot")).toHaveText("4 500 Kč");

  // edit: price + paid → green tag, sums follow
  await c.click();
  await expect(modal.locator(".mh h2")).toHaveText("Tiskovina");
  await expect(modal.locator("#fPrice")).toHaveValue(`4${NB}500`);
  await expect(modal.locator(".meta")).toContainText("Založil(a)");
  await modal.locator("#fPrice").fill("5000");
  await modal.locator("label", { hasText: "Ano" }).click();
  await modal.getByRole("button", { name: "Uložit" }).click();
  await expect(c.locator(".price")).toHaveText("5 000 Kč");
  await expect(c.locator(".price")).toHaveClass(/paid/);
  await expect(page.locator("#ptot")).toHaveText("5 000 Kč");

  // second item without price in another column
  await createItem(request, { columnId: cols[1].id, typeId: type.id, title: `${TAG} Bez ceny` });
  await expect(card(page, `${TAG} Bez ceny`).locator(".price.none")).toHaveText("Bez ceny", { timeout: 10_000 });
  await expect(column(page, cols[1].title).locator(".sum")).toHaveText("0 Kč");
  await expect(page.locator("#ptot")).toHaveText("5 000 Kč");

  // month filter by realisation date: label „Celkem za Listopad 2026", option carries the Kč sum
  await expect.poll(() => optionText(page, "#pmon", "2026-11")).toMatch(/^Listopad 2026 · [\d\s]+\sKč$/);
  await pick(page, "#pmon", "2026-11");
  await expect(page.locator("#ptotL")).toHaveText("Celkem za Listopad 2026");
  await expect(page.locator("#board .card h3")).toHaveText([`${TAG} Letáky`]);
  await pick(page, "#pmon", "none");
  await expect(page.locator("#ptotL")).toHaveText("Celkem bez termínu");
  await expect(page.locator("#board .card h3")).toHaveText([`${TAG} Bez ceny`]);
  await expect(page.locator("#ptot")).toHaveText("0 Kč");
});

test("type filter prefills a new item; „+ Přidat tiskovinu“ prefills the column", async ({ page, request }) => {
  const s = await getState(request);
  const cols = columnsOf(s, "print");
  const types = [...s.printTypes].sort((a, b) => a.sortOrder - b.sortOrder);
  await open(page);
  await pick(page, "#ptype", types[2].id);
  await column(page, cols[1].title).locator(".add").click();
  const modal = page.getByTestId("print-modal");
  await expectValue(modal.locator("#fCat"), types[2].id);
  await expectValue(modal.locator("#fCol"), cols[1].id);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});

test("Typy médií: add, rename (propagates), delete with confirm (items move to the first type)", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "print");
  const first = await firstType(request);
  await open(page);
  await page.locator("#btnTypes").click();
  const modal = page.getByTestId("types-modal");
  await expect(modal.locator(".mh h2")).toHaveText("Typy médií");
  await expect(modal.locator(".meta")).toHaveText("Přejmenování se propíše do všech tiskovin.");

  await modal.locator("#tNew").fill(`${TAG} Pozvánky`);
  await modal.locator("#tNew").press("Enter");
  const row = modal.locator(".urow").last();
  await expect(row.locator("input")).toHaveValue(`${TAG} Pozvánky`);
  await expect(row.locator(".n")).toHaveText("0 položek");
  await expect(modal.locator("#tNew")).toHaveValue("");
  // duplicate name is ignored
  await modal.locator("#tNew").fill(`${TAG} Pozvánky`);
  await modal.locator("#tAdd").click();
  await expect(modal.locator(".urow input[value$='Pozvánky']")).toHaveCount(1);

  let typeId = "";
  await expect
    .poll(async () => (typeId = (await getState(request)).printTypes.find((t) => t.name === `${TAG} Pozvánky`)?.id ?? ""))
    .not.toBe("");
  await createItem(request, { columnId: cols[0].id, typeId, title: `${TAG} Pozvánka` });
  await expect(row.locator(".n")).toHaveText("1 položka", { timeout: 10_000 });
  await expect(row.getByRole("button", { name: "Smazat" })).toHaveAttribute("aria-label", `Smazat typ ${TAG} Pozvánky`);

  // rename via blur
  await row.locator("input").fill(`${TAG} Pozvánky VIP`);
  await row.locator("input").press("Enter");
  await expect(modal.locator(".urow").last().locator("input")).toHaveValue(`${TAG} Pozvánky VIP`);
  await modal.getByRole("button", { name: "Hotovo" }).click();
  await expect(card(page, `${TAG} Pozvánka`).locator(".cat")).toHaveText(`${TAG} Pozvánky VIP`);
  await expect.poll(() => optionText(page, "#ptype", typeId)).toBe(`${TAG} Pozvánky VIP (1)`);

  // delete → confirm → item moves to the first type
  await page.locator("#btnTypes").click();
  page.once("dialog", (d) => {
    expect(d.message()).toBe(`Typ „${TAG} Pozvánky VIP“ používá 1 tiskovinu. Přesunout ji pod „${first.name}“ a typ smazat?`);
    void d.accept();
  });
  await modal.locator(".urow").last().getByRole("button", { name: "Smazat" }).click();
  await expect(modal.locator(".urow input[value$='VIP']")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(card(page, `${TAG} Pozvánka`).locator(".cat")).toHaveText(first.name);
});

test("drag & drop between the fixed columns updates sums", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "print");
  const type = await firstType(request);
  const id = await createItem(request, { columnId: cols[0].id, typeId: type.id, title: `${TAG} DnD`, price: 1200 });
  await open(page, `${TAG} DnD`);
  await expect(column(page, cols[0].title).locator(".sum")).toHaveText("1 200 Kč");
  await mouseDrag(page, card(page, `${TAG} DnD`), column(page, cols[2].title).locator(".list"), { yFrac: 0.2 });
  await expect(column(page, cols[2].title).locator(".card", { hasText: `${TAG} DnD` })).toHaveCount(1);
  await expect(column(page, cols[2].title).locator(".sum")).toHaveText("1 200 Kč");
  await expect(column(page, cols[0].title).locator(".sum")).toHaveText("0 Kč");
  await expect(card(page, `${TAG} DnD`).locator(".price")).toHaveText("1 200 Kč");
  await expect.poll(async () => (await getState(request)).printItems.find((i) => i.id === id)?.columnId).toBe(cols[2].id);
});

test("archived items are hidden from the board and its counts", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "print");
  const type = await firstType(request);
  await createItem(request, { columnId: cols[0].id, typeId: type.id, title: `${TAG} Archiv`, price: 999, realizationDate: `${ARCHIVE_YEAR}-05-05` });
  await open(page, `${TAG} Archiv`);
  await expect(card(page, `${TAG} Archiv`)).toHaveCount(1);
  expect((await request.post(`/api/print/years/${ARCHIVE_YEAR}/close`)).status()).toBe(200);
  await expect(card(page, `${TAG} Archiv`)).toHaveCount(0, { timeout: 10_000 }); // realtime refetch
  await expect(page.locator("#ptot")).toHaveText("0 Kč");
  await expect.poll(async () => (await optionTexts(page, "#pmon")).filter((t) => t.startsWith(`Květen ${ARCHIVE_YEAR}`))).toEqual([]);
});

test("„Roční přehled“ opens the yearly report below the header; back / tab switch closes it", async ({ page }) => {
  await open(page);
  await expect(page.locator("#btnYear")).toHaveText("Roční přehled");
  await page.locator("#btnYear").click();
  const report = page.locator(".yv");
  await expect(report).toBeVisible();
  await expect(page.locator("#pbar")).toHaveCount(0);
  await expect(page.locator(".top")).toBeVisible();
  const top = await page.locator(".top").boundingBox();
  const yv = await report.boundingBox();
  expect(Math.round(yv!.y)).toBe(Math.round(top!.y + top!.height));

  await page.locator("#yvBack").click();
  await expect(report).toHaveCount(0);
  await expect(page.locator("#pbar")).toBeVisible();

  await page.locator("#btnYear").click();
  await expect(report).toBeVisible();
  await page.locator("#tabs button", { hasText: "Úkoly" }).click();
  await expect(report).toHaveCount(0);
  await page.locator("#tabs button", { hasText: "Tiskoviny" }).click();
  await expect(page.locator("#pbar")).toBeVisible();
  await expect(report).toHaveCount(0);
});

test("filtered empty state + a11y of the print board, item modal and „Typy médií“", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "print");
  const type = await firstType(request);
  await createItem(request, { columnId: cols[0].id, typeId: type.id, title: `${TAG} Axe`, price: 900, paidByClub: true, realizationDate: "2031-06-15" });
  await openApp(page, { view: "print", prMonth: "none" });
  await page.locator("#pq").fill(`${TAG} Axe`);
  const banner = page.locator(".board-empty");
  await expect(banner).toContainText("Filtru neodpovídá žádná tiskovina.");
  await expectNoA11yViolations(page, { include: ["#pbar", "#board", ".board-status"] });
  await banner.getByRole("button", { name: "Zrušit filtry" }).click();
  await expectValue(page.locator("#pmon"), "all");
  await expect(page.locator("#pq")).toHaveValue("");
  await page.locator("#pq").fill(`${TAG} Axe`);
  await expect(card(page, `${TAG} Axe`).locator(".price + .sr-only")).toHaveText("zaplatil FK FM");
  await expectNoA11yViolations(page, { include: ["#pbar", "#board"] });

  // keyboard open + Esc returns focus
  await card(page, `${TAG} Axe`).focus();
  await page.keyboard.press("Enter");
  const modal = page.getByTestId("print-modal");
  await expect(modal.locator("#fTitle")).toHaveValue(`${TAG} Axe`);
  await expectNoA11yViolations(page, { include: ".modal" });
  await page.keyboard.press("Escape");
  await expect(card(page, `${TAG} Axe`)).toBeFocused();

  await page.locator("#btnTypes").click();
  await expect(page.getByTestId("types-modal")).toBeVisible();
  await expect(page.locator("#tNew")).toBeFocused();
  await expectNoA11yViolations(page, { include: ".modal" });
});

test.describe("tablet", () => {
  test.use({ viewport: { width: 1024, height: 768 } });
  test("1024 px: both filter bars fit on one row", async ({ page }) => {
    await open(page);
    const p = (await page.locator("#pbar").boundingBox())!;
    expect(p.height).toBeLessThanOrEqual(64);
    for (const id of ["#pq", "#ptype", "#pmon", "#btnTypes", "#btnYear", ".ptot"]) {
      const b = (await page.locator(`#pbar ${id}`).boundingBox())!;
      expect(b.x + b.width, id).toBeLessThanOrEqual(1024);
      expect(b.y, id).toBeLessThan(p.y + 20);
    }
    await page.locator("#tabs button", { hasText: "Úkoly" }).click();
    const t = (await page.locator("#tbar").boundingBox())!;
    expect(t.height).toBeLessThanOrEqual(64);
  });
});
