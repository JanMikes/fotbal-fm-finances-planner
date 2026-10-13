import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { card, columnsOf, getState, openApp } from "./boards-helpers";
import { expectNoA11yViolations, pick } from "./ui-helpers";

/**
 * Accessibility overview: one axe scan (whole page, WCAG 2.x A/AA + best practices, serious/critical fail) per main
 * screen and layer, on desktop and on a phone. Feature specs keep their own scoped scans of special states
 * (validation errors, info bubble, month picker, filtered empty state…); this spec is the single map of the app.
 * The only allowlisted finding is the documented brand trade-off (white on --fm-blue, DECISIONS #15).
 */
const PASSWORD = process.env.APP_PASSWORD ?? "dev-password";
const TAG = `E2E-A11Y${Date.now().toString(36)}`;
const REPORT_YEAR = 2018; // a year no other spec uses
const seed = { person: "", unit: "", task: "", item: "" };

test.describe.configure({ mode: "serial" });

async function login(request: APIRequestContext) {
  expect((await request.post("/api/auth/login", { data: { password: PASSWORD } })).status()).toBe(200);
}

async function post(request: APIRequestContext, url: string, data: Record<string, unknown>): Promise<string> {
  const res = await request.post(url, { data });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test.beforeAll(async ({ request }) => {
  await login(request);
  const s = await getState(request);
  const type = [...s.printTypes].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  seed.person = await post(request, "/api/org-nodes", { kind: "person", name: `${TAG} Alena Nová`, role: "Grafik", info: "Info", budget: 1000, budgetColor: "green" });
  seed.unit = await post(request, "/api/org-nodes", { kind: "unit", name: `${TAG} Grafika`, color: "#0099cf", parentId: seed.person });
  seed.task = await post(request, "/api/tasks", {
    columnId: columnsOf(s, "tasks")[0].id,
    category: "Celý klub",
    description: "Popis",
    title: `${TAG} Úkol`,
    dueDate: "2031-06-15",
    leadId: seed.person,
  });
  seed.item = await post(request, "/api/print-items", {
    columnId: columnsOf(s, "print")[0].id,
    typeId: type.id,
    title: `${TAG} Letáky`,
    quantity: 500,
    price: 1200,
    paidByClub: true,
    realizationDate: `${REPORT_YEAR}-05-10`,
  });
});

test.afterAll(async ({ request }) => {
  await login(request);
  if (seed.task) await request.delete(`/api/tasks/${seed.task}`);
  if (seed.item) await request.delete(`/api/print-items/${seed.item}`);
  if (seed.unit) await request.delete(`/api/org-nodes/${seed.unit}`);
  if (seed.person) await request.delete(`/api/org-nodes/${seed.person}`);
});

const modal = (page: Page): Locator => page.locator(".ov .modal");

async function closeModal(page: Page) {
  await page.keyboard.press("Escape");
  await expect(modal(page)).toHaveCount(0);
}

/** On a phone the filter selects and bar buttons live behind the „Filtry" toggle. */
async function revealFilters(page: Page, bar: string) {
  const toggle = page.locator(`${bar} .fbar-toggle`);
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

async function openFilterSelect(page: Page, bar: string, id: string) {
  await revealFilters(page, bar);
  await page.locator(id).click();
  await expect(page.locator(`${id}-listbox`)).toBeVisible();
}

for (const device of [
  { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  { name: "mobile", use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
] as const) {
  test.describe(device.name, () => {
    test.use(device.use);

    test("login page", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByLabel("Heslo týmu")).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test("Úkoly: board, open Select, task modal (new + existing), calendar", async ({ page }) => {
      await openApp(page, { me: seed.person, view: "board" });
      await page.locator("#q").fill(TAG);
      await expect(card(page, `${TAG} Úkol`)).toBeVisible();
      await expectNoA11yViolations(page);

      await openFilterSelect(page, "#tbar", "#grp");
      await expectNoA11yViolations(page);
      await page.keyboard.press("Escape");
      await expect(page.locator("#grp-listbox")).toBeHidden();

      await page.getByRole("button", { name: "+ Nový úkol" }).click();
      await expect(modal(page).locator(".mh h2")).toHaveText("Nový úkol");
      await expectNoA11yViolations(page);
      await closeModal(page);

      await card(page, `${TAG} Úkol`).click();
      await expect(modal(page).locator("#fTitle")).toHaveValue(`${TAG} Úkol`);
      await expectNoA11yViolations(page);
      await modal(page).locator(".fm-date__btn").click();
      const cal = page.locator('[role="dialog"][aria-label="Vybrat datum"]');
      await expect(cal).toBeVisible();
      await expectNoA11yViolations(page);
      await page.keyboard.press("Escape");
      await expect(cal).toBeHidden();
      await closeModal(page);
    });

    test("Tiskoviny: board, item modal, „Typy médií“, yearly report", async ({ page }) => {
      await openApp(page, { view: "print" });
      await page.locator("#pq").fill(TAG);
      await expect(card(page, `${TAG} Letáky`)).toBeVisible();
      await expectNoA11yViolations(page);

      await card(page, `${TAG} Letáky`).click();
      await expect(modal(page).locator("#fTitle")).toHaveValue(`${TAG} Letáky`);
      await expectNoA11yViolations(page);
      await closeModal(page);

      await revealFilters(page, "#pbar");
      await page.locator("#btnTypes").click();
      await expect(page.getByTestId("types-modal")).toBeVisible();
      await expectNoA11yViolations(page);
      await closeModal(page);

      await page.locator("#btnYear").click();
      await expect(page.locator("#yv")).toBeVisible();
      await pick(page, "#yrSel", String(REPORT_YEAR));
      await expect(page.locator("#yv")).toContainText(`${TAG} Letáky`);
      await expectNoA11yViolations(page);
    });

    test("Struktura týmu: org chart, member form (new + existing), unit form", async ({ page }) => {
      await openApp(page, { view: "org" });
      const node = (name: string) => page.locator("#tree .onode[data-uid]", { has: page.locator(".nm, .un", { hasText: name }) });
      await expect(node(`${TAG} Alena Nová`)).toBeVisible();
      await expectNoA11yViolations(page);

      await page.getByRole("button", { name: "+ Přidat člena" }).click();
      await expect(page.getByTestId("member-modal")).toBeVisible();
      await expectNoA11yViolations(page);
      await closeModal(page);

      await node(`${TAG} Alena Nová`).locator(".nm").click();
      await expect(page.getByTestId("member-modal").locator("#mName")).toHaveValue(`${TAG} Alena Nová`);
      await expectNoA11yViolations(page);
      await closeModal(page);

      await node(`${TAG} Grafika`).locator(".un").click();
      await expect(page.getByTestId("unit-modal")).toBeVisible();
      await expectNoA11yViolations(page);
      await closeModal(page);
    });
  });
}
