import { expect, test, type APIRequestContext, type CDPSession, type Locator, type Page } from "@playwright/test";
import { card, column, columnsOf, createPerson, deleteNode, getState, openApp } from "./boards-helpers";

/**
 * Robustness fixes: touch drag across columns (the drag survives the card moving to another column), touch cancel,
 * mobile edge autoscroll vs scroll-snap, month filter consistency, edit modals closing when the entity is deleted
 * remotely, partial saves (no lost update) and recovery after failed /api/state refetches.
 * (The org-tree counterparts live in team.spec.ts — that spec runs serially because tree layout is shared.)
 * Everything carries TAG; boards are filtered by TAG through the search box.
 */
const PASSWORD = process.env.APP_PASSWORD ?? "dev-password";
const TAG = `E2E-R${Date.now().toString(36)}`;
const DELETED = "Položka byla smazána jiným uživatelem.";
let me = "";

test.describe.configure({ mode: "serial" });

async function login(request: APIRequestContext) {
  expect((await request.post("/api/auth/login", { data: { password: PASSWORD } })).status()).toBe(200);
}

async function createTask(request: APIRequestContext, data: { columnId: string; title: string; dueDate?: string | null; description?: string }) {
  const res = await request.post("/api/tasks", { data: { category: "Celý klub", description: "", ...data } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function openTasks(page: Page, prefs: Record<string, unknown> = {}) {
  await openApp(page, { me, view: "board", ...prefs });
  await page.locator("#q").fill(TAG);
}

/** CDP touch helper (Chromium). */
async function touch(page: Page) {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const pt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
  let cur = { x: 0, y: 0 };
  return {
    async start(x: number, y: number) {
      cur = { x, y };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(x, y) });
      await page.waitForTimeout(320); // hold > 220 ms starts the drag
    },
    async moveTo(x: number, y: number, steps = 10) {
      const from = cur;
      for (let i = 1; i <= steps; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(from.x + ((x - from.x) * i) / steps, from.y + ((y - from.y) * i) / steps) });
        await page.waitForTimeout(16);
      }
      cur = { x, y };
      await page.waitForTimeout(60);
    },
    async end() {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    async cancel() {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    },
    detach: () => cdp.detach(),
  };
}

const center = async (l: Locator, yFrac = 0.5) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height * yFrac };
};

/** Titles of the cards shown in a column (the hidden drag source excluded, the placeholder included). */
const shownTitles = (col: Locator) => col.locator(".list > .card:not([data-dragsrc]) h3");

test.beforeAll(async ({ request }) => {
  await login(request);
  me = await createPerson(request, `${TAG} Já`);
});

test.beforeEach(async ({ request }) => {
  await login(request);
});

test.afterAll(async ({ request }) => {
  await login(request);
  const s = await getState(request);
  for (const t of s.tasks.filter((t) => t.title.includes(TAG))) await request.delete(`/api/tasks/${t.id}`);
  for (const i of s.printItems.filter((t) => t.title.includes(TAG))) await request.delete(`/api/print-items/${i.id}`);
  for (const n of s.nodes.filter((n) => n.name.includes(TAG))) await deleteNode(request, n.id);
});

test.describe("touch drag", () => {
  test.use({ hasTouch: true });

  test("a touch drag survives moving into other columns; the drop lands where the finger lifts", async ({ page, request }) => {
    const cols = columnsOf(await getState(request), "tasks");
    const s = await createTask(request, { columnId: cols[0].id, title: `${TAG} S` });
    await createTask(request, { columnId: cols[1].id, title: `${TAG} B1` });
    await createTask(request, { columnId: cols[1].id, title: `${TAG} B2` });
    const c1 = await createTask(request, { columnId: cols[2].id, title: `${TAG} C1` });
    await openTasks(page);
    await expect(card(page, `${TAG} C1`)).toBeVisible();
    const col1 = column(page, cols[1].title);
    const col2 = column(page, cols[2].title);

    const t = await touch(page);
    const a = await center(card(page, `${TAG} S`));
    await t.start(a.x, a.y);
    await expect(page.locator("body > .card.ghost")).toBeVisible();

    // into column 2, above B1 → the placeholder moves there (the card element used to re-mount here and the drag died)
    const b1 = await center(card(page, `${TAG} B1`), 0.2);
    await t.moveTo(b1.x, b1.y);
    await expect(col1.locator(".card.ph")).toHaveCount(1);
    await expect(shownTitles(col1)).toHaveText([`${TAG} S`, `${TAG} B1`, `${TAG} B2`]);

    // keep moving: below B2 in the same column — the drag is still alive
    const b2box = (await card(page, `${TAG} B2`).boundingBox())!;
    await t.moveTo(b1.x, b2box.y + b2box.height + 12);
    await expect(page.locator("body > .card.ghost")).toBeVisible();
    await expect(shownTitles(col1)).toHaveText([`${TAG} B1`, `${TAG} B2`, `${TAG} S`]);

    // and on into column 3, above C1
    const cc = await center(card(page, `${TAG} C1`), 0.2);
    await t.moveTo(cc.x, cc.y);
    await expect(page.locator("body > .card.ghost")).toBeVisible();
    await expect(shownTitles(col2)).toHaveText([`${TAG} S`, `${TAG} C1`]);
    await t.end();
    await t.detach();

    await expect(page.locator("body > .card.ghost")).toHaveCount(0);
    await expect(col2.locator(".card h3")).toHaveText([`${TAG} S`, `${TAG} C1`]);
    await expect
      .poll(async () => {
        const st = await getState(request);
        const x = st.tasks.find((q) => q.id === s)!;
        const y = st.tasks.find((q) => q.id === c1)!;
        return x.columnId === cols[2].id && x.sortOrder < y.sortOrder;
      })
      .toBe(true);
  });

  test("touchcancel cancels the drag and reverts (like the org tree)", async ({ page, request }) => {
    const cols = columnsOf(await getState(request), "tasks");
    const id = await createTask(request, { columnId: cols[0].id, title: `${TAG} Cancel` });
    await openTasks(page);
    const t = await touch(page);
    const a = await center(card(page, `${TAG} Cancel`));
    await t.start(a.x, a.y);
    const target = await center(column(page, cols[1].title).locator(".list"), 0.3);
    await t.moveTo(target.x, target.y);
    await expect(column(page, cols[1].title).locator(".card.ph")).toHaveCount(1);
    await t.cancel();
    await t.detach();
    await expect(page.locator("body > .card.ghost")).toHaveCount(0);
    await expect(column(page, cols[0].title).locator(".card", { hasText: `${TAG} Cancel` })).toHaveCount(1);
    await expect(column(page, cols[1].title).locator(".card", { hasText: `${TAG} Cancel` })).toHaveCount(0);
    await page.waitForTimeout(300);
    expect((await getState(request)).tasks.find((q) => q.id === id)?.columnId).toBe(cols[0].id);
  });
});

test.describe("mobile", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("edge autoscroll works during a touch drag (scroll-snap off while dragging, restored after)", async ({ page, request }) => {
    const cols = columnsOf(await getState(request), "tasks");
    await createTask(request, { columnId: cols[0].id, title: `${TAG} Mobile` });
    await openTasks(page);
    const board = page.locator("#board");
    await expect(board).toHaveCSS("scroll-snap-type", /mandatory/);
    const t = await touch(page);
    const a = await center(card(page, `${TAG} Mobile`));
    await t.start(a.x, a.y);
    await t.moveTo(385, a.y, 6); // right edge (< 60 px) → the board scrolls
    await expect(board).toHaveCSS("scroll-snap-type", "none");
    await expect.poll(() => board.evaluate((el) => el.scrollLeft), { timeout: 3000 }).toBeGreaterThan(200);
    await expect(page.locator("body > .card.ghost")).toBeVisible(); // still dragging, not scrolling
    await t.moveTo(200, a.y, 4); // away from the edge
    await t.end();
    await t.detach();
    await expect(page.locator("body > .card.ghost")).toHaveCount(0);
    await expect(board).toHaveCSS("scroll-snap-type", /mandatory/);
  });
});

test("month filter: a saved month outside the generated range stays selected and filters consistently", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  await createTask(request, { columnId: cols[0].id, title: `${TAG} Month`, dueDate: null });
  // Únor 2024: no task is due then and it is far outside −1…+11 months
  await openTasks(page, { month: "2024-02" });
  await expect(page.locator("#mon")).toHaveValue("2024-02");
  await expect(page.locator("#mon option:checked")).toHaveText("Únor 2024");
  await expect(page.locator("#board .card")).toHaveCount(0);
  await page.locator("#mon").selectOption("all");
  await expect(card(page, `${TAG} Month`)).toBeVisible();

  // Tiskoviny: same for the print month (e.g. a month of a closed year)
  await openApp(page, { me, view: "print", prMonth: "2020-02" });
  await expect(page.locator("#pmon")).toHaveValue("2020-02");
  await expect(page.locator("#pmon option:checked")).toHaveText("Únor 2020");
  await expect(page.locator("#ptotL")).toHaveText("Celkem za Únor 2020");
});

test.describe("edit modals close when the entity is deleted by someone else", () => {
  test("task", async ({ page, request }) => {
    const cols = columnsOf(await getState(request), "tasks");
    const id = await createTask(request, { columnId: cols[0].id, title: `${TAG} Gone` });
    await openTasks(page);
    await card(page, `${TAG} Gone`).click();
    await expect(page.getByTestId("task-modal")).toBeVisible();
    await request.delete(`/api/tasks/${id}`);
    await expect(page.getByTestId("task-modal")).toHaveCount(0);
    await expect(page.locator(".app-toast")).toHaveText(DELETED);
    await expect(page.locator(".mh h2")).toHaveCount(0); // did not turn into „Nový úkol"
  });

  test("print item", async ({ page, request }) => {
    const st = await getState(request);
    const res = await request.post("/api/print-items", { data: { columnId: columnsOf(st, "print")[0].id, typeId: st.printTypes[0].id, title: `${TAG} Gone print` } });
    expect(res.status()).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    await openApp(page, { me, view: "print" });
    await page.locator("#pq").fill(TAG);
    await card(page, `${TAG} Gone print`).click();
    await expect(page.getByTestId("print-modal")).toBeVisible();
    await request.delete(`/api/print-items/${id}`);
    await expect(page.getByTestId("print-modal")).toHaveCount(0);
    await expect(page.locator(".app-toast")).toHaveText(DELETED);
  });
});

test("a stale modal saves only the changed fields (no lost update)", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  const id = await createTask(request, { columnId: cols[0].id, title: `${TAG} Concurrent` });
  await openTasks(page);
  await card(page, `${TAG} Concurrent`).click();
  const modal = page.getByTestId("task-modal");
  await expect(modal).toBeVisible();
  // someone else edits the description and moves the card meanwhile
  expect((await request.patch(`/api/tasks/${id}`, { data: { description: "Důležitý popis od A" } })).ok()).toBeTruthy();
  expect((await request.patch(`/api/tasks/${id}/move`, { data: { columnId: cols[1].id } })).ok()).toBeTruthy();
  await expect(column(page, cols[1].title).locator(".card", { hasText: `${TAG} Concurrent` })).toHaveCount(1);
  // this user changes only the category
  await modal.locator("#fCat").selectOption("Merch");
  await modal.getByRole("button", { name: "Uložit" }).click();
  await expect(modal).toHaveCount(0);
  await expect
    .poll(async () => {
      const t = (await getState(request)).tasks.find((q) => q.id === id) as unknown as { category: string; description: string; columnId: string };
      return `${t.category}|${t.description}|${t.columnId === cols[1].id}`;
    })
    .toBe("Merch|Důležitý popis od A|true");
});

test("a failed refetch is retried: the client catches up and shows „Offline“ meanwhile (no raw proxy text)", async ({ page, request }) => {
  const cols = columnsOf(await getState(request), "tasks");
  await openTasks(page);
  await expect(page.locator(".app-offline")).toHaveCount(0);
  // the reverse proxy answers 502 to /api/state (e.g. during a rollout); SSE stays connected
  await page.route("**/api/state", (r) => r.fulfill({ status: 502, contentType: "text/plain", body: "Bad Gateway" }));
  await createTask(request, { columnId: cols[0].id, title: `${TAG} Late` });
  await expect(page.locator(".app-offline")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".app-toast")).toHaveCount(0); // background failures are not toasted
  await expect(page.getByText("Bad Gateway")).toHaveCount(0);
  await expect(card(page, `${TAG} Late`)).toHaveCount(0);
  await page.unroute("**/api/state");
  await expect(card(page, `${TAG} Late`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".app-offline")).toHaveCount(0);
});

test("a failed initial load is retried automatically (and offers „Zkusit znovu“)", async ({ page }) => {
  await openApp(page, { me, view: "board" });
  await page.route("**/api/state", (r) => r.fulfill({ status: 503, contentType: "text/html", body: "<html><body><h1>503 Service Unavailable</h1></body></html>" }));
  await page.reload();
  await expect(page.getByText("Nepodařilo se načíst data.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zkusit znovu" })).toBeVisible();
  await expect(page.getByText("503 Service Unavailable")).toHaveCount(0); // HTML error pages are not shown
  await page.unroute("**/api/state");
  await expect(page.locator("#board .col").first()).toBeVisible({ timeout: 20_000 });
});
