import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { expectNoA11yViolations, expectValue, optionText, optionTexts, pick } from "./ui-helpers";

/**
 * Yearly print report („Roční přehled tiskovin"): KPIs, close / reopen year, print emulation.
 * Uses its own year (2019) so it does not interfere with other data; seeded and cleaned up through the API.
 * REPORT_E2E_PATH can point to a page that opens the report directly; otherwise the test opens it from the
 * Tiskoviny tab („Roční přehled", #btnYear).
 */
const PASSWORD = process.env.APP_PASSWORD ?? "dev-password";
const YEAR = 2019;
const TAG = `E2E report ${Date.now()}`;

interface Seed {
  title: string;
  type: string;
  quantity: number | null;
  price: number | null;
  paidByClub: boolean;
  realizationDate: string;
}
const SEED: Seed[] = [
  { title: `${TAG} letáky`, type: "Letáky", quantity: 1000, price: 4500, paidByClub: true, realizationDate: `${YEAR}-03-05` },
  { title: `${TAG} plakáty`, type: "Plakáty", quantity: 50, price: 1000, paidByClub: false, realizationDate: `${YEAR}-03-20` },
  { title: `${TAG} vizitky`, type: "Vizitky", quantity: 200, price: 2000, paidByClub: false, realizationDate: `${YEAR}-07-01` },
  { title: `${TAG} banner`, type: "Bannery", quantity: 1, price: null, paidByClub: false, realizationDate: `${YEAR}-07-10` },
];
const ids: string[] = [];

async function login(request: APIRequestContext) {
  const res = await request.post("/api/auth/login", { data: { password: PASSWORD } });
  expect(res.status()).toBe(200);
}

async function seededItems(request: APIRequestContext) {
  const state = await (await request.get("/api/state")).json();
  return {
    items: (state.printItems as Array<{ id: string; archived: boolean }>).filter((i) => ids.includes(i.id)),
    closed: (state.closures as Array<{ year: number }>).some((c) => c.year === YEAR),
  };
}

async function openReport(page: Page) {
  const direct = process.env.REPORT_E2E_PATH;
  await page.goto(direct ?? "/");
  const report = page.locator("#yv");
  if (!direct) {
    await page.getByRole("button", { name: "Tiskoviny", exact: true }).click();
    await page.locator("#btnYear").click();
  }
  await expect(report).toBeVisible();
  await pick(page, "#yrSel", String(YEAR));
  await expect(page.locator(".yv-t")).toHaveText("Roční přehled tiskovin");
}

test.describe.serial("yearly print report", () => {
  test.beforeAll(async ({ request }) => {
    await login(request);
    const state = await (await request.get("/api/state")).json();
    const col = state.columns.filter((c: { boardId: string }) => c.boardId === "print").sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder)[2];
    const typeId = (name: string) => state.printTypes.find((t: { name: string }) => t.name === name).id;
    // start from an open year
    await request.delete(`/api/print/years/${YEAR}/close`);
    for (const s of SEED) {
      const res = await request.post("/api/print-items", {
        data: { columnId: col.id, typeId: typeId(s.type), title: s.title, quantity: s.quantity, price: s.price, paidByClub: s.paidByClub, realizationDate: s.realizationDate },
      });
      expect(res.status()).toBe(201);
      ids.push((await res.json()).id);
    }
  });

  test.afterAll(async ({ request }) => {
    await login(request);
    await request.delete(`/api/print/years/${YEAR}/close`);
    for (const id of ids) await request.delete(`/api/print-items/${id}`);
  });

  test.beforeEach(async ({ page }) => {
    await login(page.request);
  });

  test("KPIs, chart, types and list match the seeded data", async ({ page }) => {
    await openReport(page);
    const kpis = page.locator(".yv-kpi .kp");
    await expect(kpis.nth(0)).toContainText("Celkem utraceno");
    await expect(kpis.nth(0).locator("b")).toHaveText("7 500 Kč");
    await expect(kpis.nth(0).locator("i")).toHaveText("4 položky · 1 251 ks");
    await expect(kpis.nth(1).locator("b")).toHaveText("4 500 Kč");
    await expect(kpis.nth(1).locator("i")).toHaveText("60 % z celku");
    await expect(kpis.nth(2).locator("b")).toHaveText("3 000 Kč");
    await expect(kpis.nth(2).locator("i")).toHaveText("40 % z celku");
    await expect(kpis.nth(3).locator("b")).toHaveText("3 750 Kč");
    await expect(kpis.nth(3).locator("i")).toHaveText("Nejvíc: březen · 5 500 Kč");

    // 12 months, unique abbreviations (DECISIONS #7)
    await expect(page.locator(".cols .mc .l")).toHaveText(["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"]);
    await expect(page.locator(".cols .mc").nth(2).locator(".v")).toHaveText("5,5 tis.");

    await expect(page.locator(".yv-types .tr .tn b")).toHaveText(["Letáky", "Vizitky", "Plakáty", "Bannery"]);
    await expect(page.locator(".yv-types .tr").first().locator(".tv")).toHaveText("4 500 Kč");

    const months = page.locator(".yv-list .yv-m");
    await expect(months).toHaveCount(2);
    await expect(months.nth(0).locator(".yv-mh b")).toHaveText("Březen");
    await expect(months.nth(0).locator(".yv-mh .o")).toHaveText("dluh 1 000 Kč");
    await expect(months.nth(0).locator(".yv-r")).toHaveCount(2);
    await expect(months.nth(0).locator(".yv-r .pr.ok")).toHaveText("4 500 Kč");
    await expect(page.locator("#yrClose")).toHaveText(`Uzavřít rok ${YEAR}`);

    // chart: gridlines with round values; every month has a screen-reader summary (values are hidden on mobile)
    await expect(page.locator(".cols .yv-gl").first()).toBeAttached();
    await expect(page.locator(".cols .mc").nth(2).locator(".sr-only")).toHaveText(
      "Březen: 5\u00a0500\u00a0Kč (zaplatil FK FM 4\u00a0500\u00a0Kč · dluží FK FM 1\u00a0000\u00a0Kč)",
    );
    await expectNoA11yViolations(page, { include: "#yv" });
  });

  test("year Select: keyboard, Escape closes only the list, a second Escape the report", async ({ page }) => {
    await openReport(page);
    const sel = page.locator("#yrSel");
    await expectValue(sel, String(YEAR));
    await expect(sel).toHaveAccessibleName("Rok");
    await expect.poll(() => optionTexts(page, "#yrSel")).toContain(String(YEAR));
    const current = String(new Date().getFullYear());
    // keyboard: open, Home (the newest year — years are DESC), Enter
    await sel.focus();
    await page.keyboard.press("Enter");
    await expect(sel).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await expectValue(sel, current);
    await expect(sel).toBeFocused();
    // Escape contract: the open list swallows the first Escape
    await page.keyboard.press("ArrowDown");
    await expect(sel).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(sel).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#yv")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#yv")).toHaveCount(0);
  });

  test("closing archives the year's items, reopening reverts it", async ({ page }) => {
    await openReport(page);
    let dialogText = "";
    page.once("dialog", (d) => {
      dialogText = d.message();
      void d.accept();
    });
    await page.locator("#yrClose").click();
    expect(dialogText).toBe(`Uzavřít rok ${YEAR}? 4 položky za 7\u00a0500\u00a0Kč se přesunou do archivu.`); // amounts use non-breaking spaces
    await expect(page.locator(".yv-st")).toContainText("Uzavřeno");
    // the year list marks closed years
    await expect.poll(() => optionText(page, "#yrSel", String(YEAR))).toBe(`${YEAR} uzavřeno`);
    await expect(page.locator("#yrOpen")).toHaveText("Znovu otevřít");
    // the report still shows the (now archived) items
    await expect(page.locator(".yv-kpi .kp").first().locator("b")).toHaveText("7 500 Kč");
    await expect
      .poll(async () => {
        const s = await seededItems(page.request);
        return s.closed && s.items.length === 4 && s.items.every((i) => i.archived);
      })
      .toBe(true);

    // print emulation: controls hidden, title + status printed
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#yrPrint")).toBeHidden();
    await expect(page.locator("#yrSel")).toBeHidden();
    await expect(page.locator(".yv-more")).toBeHidden();
    await expect(page.locator("#yvBack")).toBeHidden();
    await expect(page.locator(".yv-yr-print")).toHaveText(String(YEAR)); // the year is printed next to the title
    await expect(page.locator(".yv-yr-print")).toBeVisible();
    await expect(page.locator(".yv-st")).toBeVisible();
    await expect(page.locator(".top")).toBeHidden();
    await page.screenshot({ path: test.info().outputPath("report-print.png"), fullPage: true });
    await page.emulateMedia({ media: "screen" });

    // back on the board, archived items are not shown
    await page.locator("#yvBack").click();
    await expect(page.locator("#yv")).toHaveCount(0);
    await expect(page.locator(".card", { hasText: TAG })).toHaveCount(0);

    // reopen (no confirm in the prototype)
    await openReport(page);
    await page.locator("#yrOpen").click();
    await expect(page.locator("#yrClose")).toBeVisible();
    await expect(page.locator(".yv-st")).toHaveCount(0);
    await expect
      .poll(async () => {
        const s = await seededItems(page.request);
        return !s.closed && s.items.length === 4 && s.items.every((i) => !i.archived);
      })
      .toBe(true);
  });

  test("Escape closes the report", async ({ page }) => {
    await openReport(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#yv")).toHaveCount(0);
  });

  test("mobile: one-row bar (←, title, year, ⋯) and the „Další akce“ menu", async ({ page }) => {
    await openReport(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const back = page.locator("#yvBack");
    await expect(back).toHaveAccessibleName("Zpět na tiskoviny");
    await expect(page.locator("#yrPrint")).toBeHidden();
    await expect(page.locator("#yrClose")).toBeHidden();
    const more = page.getByRole("button", { name: "Další akce" });
    await expect(more).toBeVisible();
    const mid = async (sel: string) => {
      const b = (await page.locator(sel).boundingBox())!;
      return b.y + b.height / 2;
    };
    const row = await mid("#yvBack");
    for (const sel of [".yv-t", "#yrSel", ".yv-more"]) expect(Math.abs((await mid(sel)) - row)).toBeLessThan(4);
    const bar = (await page.locator(".yv-bar").boundingBox())!;
    expect(bar.height).toBeLessThanOrEqual(64);

    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("dialog", { name: "Další akce" });
    await expect(menu.getByRole("button", { name: "Tisk / PDF" })).toBeVisible();
    await expect(menu.getByRole("button", { name: `Uzavřít rok ${YEAR}` })).toBeEnabled();
    await expect(menu.getByRole("button", { name: "Tisk / PDF" })).toBeFocused();
    await expectNoA11yViolations(page, { include: ["#yv", "#yvMore"] });
    // Escape closes only the menu
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(page.locator("#yv")).toBeVisible();

    // close the year from the menu (same confirm as the desktop button), then reopen it
    page.once("dialog", (d) => void d.accept());
    await more.click();
    await menu.getByRole("button", { name: `Uzavřít rok ${YEAR}` }).click();
    await expect(page.locator(".yv-st")).toContainText("Uzavřeno");
    await more.click();
    await menu.getByRole("button", { name: `Znovu otevřít rok ${YEAR}` }).click();
    await expect(page.locator(".yv-st")).toHaveCount(0);
    await expect
      .poll(async () => {
        const s = await seededItems(page.request);
        return !s.closed && s.items.every((i) => !i.archived);
      })
      .toBe(true);
  });
});
