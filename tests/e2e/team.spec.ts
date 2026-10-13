/**
 * Struktura týmu (prototype §10): member / unit forms, tree drag & drop, delete rules, budget box, realtime.
 * Every test creates its own uniquely named nodes through the API and removes them afterwards.
 */
import { expect, test, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";

const PASSWORD = process.env.APP_PASSWORD ?? "dev-password";
/** Override for running against a page other than the shell (e.g. while the shell is being built). */
const TEAM_PATH = process.env.TEAM_PATH ?? "/";

type Node = { id: string; kind: "person" | "unit"; name: string; parentId: string | null; sortOrder: number; budget: number | null; budgetColor: string };
type State = { nodes: Node[]; columns: Array<{ id: string; boardId: string; sortOrder: number }>; tasks: Array<{ id: string; title: string; leadId: string | null; ownerId: string | null }>; budget: Record<string, unknown> };

/** Every name created by these tests contains „e2e" + random chars; afterEach removes them even when a test fails. */
const sfx = () => "e2e" + Math.random().toString(36).slice(2, 7);

async function login(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: { password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
}

async function openTeam(page: Page) {
  await page.addInitScript(() => {
    try {
      const k = "fotbalfm.ui.v1";
      const p = JSON.parse(localStorage.getItem(k) || "{}");
      if (!sessionStorage.getItem("e2e-init")) {
        localStorage.setItem(k, JSON.stringify({ ...p, view: "org" }));
        sessionStorage.setItem("e2e-init", "1");
      }
    } catch {}
  });
  await page.goto(TEAM_PATH);
  const tab = page.getByRole("button", { name: "Struktura týmu" });
  if (TEAM_PATH === "/" && (await tab.count())) await tab.click();
  await expect(page.locator("#org .orgh h2")).toHaveText("Struktura týmu");
}

async function state(req: APIRequestContext): Promise<State> {
  const r = await req.get("/api/state");
  expect(r.ok()).toBeTruthy();
  return r.json();
}

async function createNode(req: APIRequestContext, body: Record<string, unknown>): Promise<Node> {
  const r = await req.post("/api/org-nodes", { data: body });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}

async function cleanup(req: APIRequestContext, ids: string[]) {
  for (const id of [...ids].reverse()) await req.delete(`/api/org-nodes/${id}`);
}

const card = (page: Page, name: string): Locator => page.locator(`#tree .onode[data-uid]`, { has: page.locator(".nm, .un", { hasText: new RegExp(`^${name}$`) }) });

async function nodeOf(req: APIRequestContext, id: string): Promise<Node | undefined> {
  return (await state(req)).nodes.find((n) => n.id === id);
}

/** Mouse drag from the centre of `from` to a fraction (fx, fy) of `to`'s box. */
async function drag(page: Page, from: Locator, to: Locator, fx = 0.5, fy = 0.5) {
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + 30, { steps: 3 });
  await expect(page.locator("body")).toHaveClass(/odrag/);
  const b = (await to.boundingBox())!;
  await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 8 });
  return {
    tip: page.locator("#oTip"),
    drop: async () => {
      await page.mouse.up();
      // let the optimistic move, the API call and the reconciling refetch settle before measuring again
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(250);
    },
  };
}

test.describe("Struktura týmu", () => {
  // the tests share one database and the tree layout; realtime would shift cards under a parallel run
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 1600, height: 1000 } });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    const s = await state(page.request);
    for (const t of s.tasks) if (t.title.includes(" e2e")) await page.request.delete(`/api/tasks/${t.id}`);
    for (const n of s.nodes) if (/ e2e[a-z0-9]{5}/.test(n.name)) await page.request.delete(`/api/org-nodes/${n.id}`);
  });

  test("add a member through the form, then edit it", async ({ page }) => {
    await openTeam(page);
    const name = `E2E Člen ${sfx()}`;
    await page.getByRole("button", { name: "+ Přidat člena" }).click();
    const modal = page.locator(".modal");
    await expect(modal.locator("h2")).toHaveText("Nový člen");
    await expect(page.locator("#mName")).toBeFocused();
    // name required
    await modal.getByRole("button", { name: "Přidat člena" }).click();
    await expect(modal).toBeVisible();
    await expect(modal.locator("input[name=budc][value=blue]")).toBeChecked(); // default Budoucnost
    await expect(page.locator("#mBoss option:checked")).toHaveText("— nikdo (vedení týmu) —");
    await page.locator("#mName").fill(name);
    await page.locator("#mRole").fill("Specialista puzzli");
    await page.locator("#mInfo").fill("Testovací info");
    await page.locator("#mBud").fill("5 000 Kč");
    await modal.locator(".budc label", { hasText: "V budgetu" }).click();
    await modal.locator('.avpick label[title="#c62f28"]').click();
    await modal.locator(".chkgrid label", { hasText: "Mládež" }).click();
    await modal.getByRole("button", { name: "Přidat člena" }).click();
    await expect(modal).toHaveCount(0);

    const c = card(page, name);
    await expect(c).toBeVisible();
    await expect(c).toHaveClass(/root/); // top level → dark root card
    await expect(c.locator(".rl")).toHaveText("Specialista puzzli");
    await expect(c.locator(".ar span")).toHaveText(["Mládež"]);
    await expect(c.locator(".bud.green")).toHaveText("5 000 Kč");
    await expect(c.locator(".av")).toHaveText(/^E/);
    await expect(c.locator(".info.has")).toBeVisible();
    // info bubble (read-only); scroll first — scrolling the tab closes the bubble (prototype)
    await c.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await c.locator(".info").click();
    await expect(page.locator("#infoPop")).toContainText("Testovací info");
    await page.mouse.click(5, 990);
    await expect(page.locator("#infoPop")).toHaveCount(0);

    await expect.poll(async () => (await state(page.request)).nodes.some((n) => n.name === name)).toBe(true);
    const created = (await state(page.request)).nodes.find((n) => n.name === name)!;
    expect(created).toMatchObject({ budget: 5000, budgetColor: "green", parentId: null });

    // edit
    await c.locator(".nm").click();
    await expect(modal.locator("h2")).toHaveText("Člen týmu");
    await expect(modal.locator(".meta")).toHaveText("0 přiřazených úkolů");
    await page.locator("#mRole").fill("Grafik");
    await modal.locator(".budc label", { hasText: "Na dluh" }).click();
    await modal.getByRole("button", { name: "Uložit" }).click();
    await expect(c.locator(".rl")).toHaveText("Grafik");
    await expect(c.locator(".bud.red")).toBeVisible();
    // Esc closes without saving
    await c.locator(".nm").click();
    await page.locator("#mRole").fill("Nic");
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(c.locator(".rl")).toHaveText("Grafik");

    await cleanup(page.request, [created.id]);
  });

  test("add a unit; + under a card creates a child member", async ({ page }) => {
    await openTeam(page);
    const name = `E2E Kat ${sfx()}`;
    await page.getByRole("button", { name: "+ Kategorie" }).click();
    const modal = page.locator(".modal");
    await expect(modal.locator("h2")).toHaveText("Nová kategorie");
    await expect(page.locator("#uSug option")).toHaveCount(13);
    await page.locator("#uName").fill(name);
    await modal.locator('.avpick label[title="#c4c8ce"]').click();
    await modal.getByRole("button", { name: "Přidat kategorii" }).click();
    const u = card(page, name);
    await expect(u).toHaveClass(/unit/);
    await expect(u).toHaveClass(/\blt\b/); // light colour → dark text
    await expect(u.locator(".st")).toHaveText("0pod ní"); // name matches no task category → no task count

    // hover + → new member under the unit
    await u.hover();
    await u.locator(".plus").click();
    await expect(modal.locator("h2")).toHaveText("Nový člen");
    await expect(page.locator("#mBoss option:checked")).toHaveText(name);
    const child = `E2E Pod ${sfx()}`;
    await page.locator("#mName").fill(child);
    await modal.getByRole("button", { name: "Přidat člena" }).click();
    await expect(card(page, child)).toBeVisible();
    await expect(u.locator(".st b").first()).toHaveText("1");
    await expect.poll(async () => (await state(page.request)).nodes.some((n) => n.name === child)).toBe(true);
    const s = await state(page.request);
    const unitNode = s.nodes.find((n) => n.name === name)!;
    const childNode = s.nodes.find((n) => n.name === child)!;
    expect(childNode.parentId).toBe(unitNode.id);
    await cleanup(page.request, [unitNode.id, childNode.id]);
  });

  test("drag & drop: under, sibling, top level, unit to top level, unit inserted between", async ({ page }) => {
    const req = page.request;
    const k = sfx();
    const r = await createNode(req, { kind: "person", name: `R ${k}` });
    const a = await createNode(req, { kind: "person", name: `A ${k}`, parentId: r.id });
    const b = await createNode(req, { kind: "person", name: `B ${k}`, parentId: r.id });
    const u = await createNode(req, { kind: "unit", name: `U ${k}`, parentId: r.id });
    const ids = [r.id, a.id, b.id, u.id];
    await openTeam(page);

    // under: B onto the centre of A
    let d = await drag(page, card(page, `B ${k}`), card(page, `A ${k}`));
    await expect(page.locator("body")).toHaveClass(/odrag/);
    await expect(card(page, `B ${k}`)).toHaveClass(/\bph\b/);
    await expect(page.locator(".onode.ghost")).toHaveCount(1);
    await expect(d.tip).toHaveText(`Pod A ${k}`);
    await expect(card(page, `A ${k}`)).toHaveClass(/\bdrop\b/);
    await expect(page.locator("#rootZone")).toBeVisible();
    await d.drop();
    await expect(page.locator(".onode.ghost")).toHaveCount(0);
    await expect.poll(async () => (await nodeOf(req, b.id))?.parentId).toBe(a.id);

    // cannot drop into own descendant: A onto B (its child) → no target
    d = await drag(page, card(page, `A ${k}`), card(page, `B ${k}`));
    await expect(d.tip).toBeHidden();
    await d.drop();
    await page.waitForTimeout(300);
    expect((await nodeOf(req, a.id))?.parentId).toBe(r.id);

    // sibling: B onto the left third of A → before A under R
    d = await drag(page, card(page, `B ${k}`), card(page, `A ${k}`), 0.1, 0.5);
    await expect(d.tip).toHaveText(`Vlevo vedle A ${k}`);
    await expect(card(page, `A ${k}`)).toHaveClass(/drop-before/);
    await d.drop();
    await expect.poll(async () => (await nodeOf(req, b.id))?.parentId).toBe(r.id);
    let s = await state(req);
    const sibs = s.nodes.filter((n) => n.parentId === r.id).sort((x, y) => x.sortOrder - y.sortOrder).map((n) => n.id);
    expect(sibs.indexOf(b.id)).toBe(sibs.indexOf(a.id) - 1);

    // right third
    d = await drag(page, card(page, `B ${k}`), card(page, `A ${k}`), 0.9, 0.5);
    await expect(d.tip).toHaveText(`Vpravo vedle A ${k}`);
    await d.drop();
    await expect
      .poll(async () => {
        const st = await state(req);
        const ord = st.nodes.filter((n) => n.parentId === r.id).sort((x, y) => x.sortOrder - y.sortOrder).map((n) => n.id);
        return ord.indexOf(b.id) - ord.indexOf(a.id);
      })
      .toBe(1);

    // top level via the root zone
    await page.locator("#org").evaluate((el) => (el.scrollTop = 0));
    d = await drag(page, card(page, `B ${k}`), page.locator("#rootZone"));
    await expect(page.locator("#rootZone")).toHaveClass(/drop/);
    await d.drop();
    await expect.poll(async () => (await nodeOf(req, b.id))?.parentId ?? null).toBeNull();
    await expect(card(page, `B ${k}`)).toHaveClass(/root/);

    // a UNIT dropped on the root zone works (prototype crash fixed) and asks nothing
    let dialogs = 0;
    const onDialog = (dlg: { accept: () => Promise<void> }) => {
      dialogs++;
      void dlg.accept();
    };
    page.on("dialog", onDialog);
    await page.locator("#org").evaluate((el) => (el.scrollTop = 0));
    d = await drag(page, card(page, `U ${k}`), page.locator("#rootZone"));
    await d.drop();
    await expect.poll(async () => (await nodeOf(req, u.id))?.parentId ?? null).toBeNull();
    expect(dialogs).toBe(0);
    page.off("dialog", onDialog);

    // unit dropped on a person with person children → prototype confirm → insert between
    page.once("dialog", async (dlg) => {
      expect(dlg.type()).toBe("confirm");
      expect(dlg.message()).toBe(`Vložit kategorii „U ${k}“ mezi R ${k} a jeho podřízené?\n\nOK = A ${k} se přesunou pod kategorii.\nZrušit = kategorie se jen přidá vedle nich.`);
      await dlg.accept();
    });
    d = await drag(page, card(page, `U ${k}`), card(page, `R ${k}`));
    await expect(d.tip).toHaveText(`Pod R ${k}`);
    await d.drop();
    await expect.poll(async () => (await nodeOf(req, a.id))?.parentId).toBe(u.id);
    s = await state(req);
    expect(s.nodes.find((n) => n.id === u.id)?.parentId).toBe(r.id);

    // whole subtree moves: R (with U → A) under B
    d = await drag(page, card(page, `R ${k}`), card(page, `B ${k}`));
    await d.drop();
    await expect.poll(async () => (await nodeOf(req, r.id))?.parentId).toBe(b.id);
    s = await state(req);
    expect(s.nodes.find((n) => n.id === a.id)?.parentId).toBe(u.id);

    await cleanup(req, [b.id, ...ids.filter((x) => x !== b.id)]);
  });

  test("removing a member reparents its children and clears task assignment", async ({ page }) => {
    const req = page.request;
    const k = sfx();
    const boss = await createNode(req, { kind: "person", name: `Boss ${k}` });
    const m = await createNode(req, { kind: "person", name: `Mid ${k}`, parentId: boss.id });
    const c = await createNode(req, { kind: "person", name: `Kid ${k}`, parentId: m.id });
    const s0 = await state(req);
    const col = s0.columns.filter((x) => x.boardId === "tasks").sort((x, y) => x.sortOrder - y.sortOrder)[0];
    const tr = await req.post("/api/tasks", { data: { columnId: col.id, category: "Web", title: `Task ${k}`, leadId: m.id, ownerId: m.id } });
    expect(tr.status()).toBe(201);
    const task = await tr.json();
    await openTeam(page);

    await expect(card(page, `Mid ${k}`).locator(".st b")).toHaveText(["1", "1"]); // řeší 1, vede 1
    await card(page, `Mid ${k}`).locator(".nm").click();
    const modal = page.locator(".modal");
    await expect(modal.locator(".meta")).toHaveText("1 přiřazených úkolů");
    page.once("dialog", async (dlg) => {
      expect(dlg.message()).toBe(`Odebrat Mid ${k}? Jeho úkoly zůstanou bez přiřazení a podřízení přejdou pod jeho nadřízeného.`);
      await dlg.accept();
    });
    await modal.getByRole("button", { name: "Odebrat" }).click();
    await expect(card(page, `Mid ${k}`)).toHaveCount(0);
    await expect.poll(async () => (await nodeOf(req, c.id))?.parentId).toBe(boss.id);
    const s = await state(req);
    const t = s.tasks.find((x) => x.id === task.id)!;
    expect(t.leadId).toBeNull();
    expect(t.ownerId).toBeNull();

    await req.delete(`/api/tasks/${task.id}`);
    await cleanup(req, [boss.id, c.id]);
  });

  test("Odebrat is hidden for the current identity; Duplikovat opens the copy", async ({ page }) => {
    const k = sfx();
    const p = await createNode(page.request, { kind: "person", name: `Me ${k}` });
    await page.addInitScript((id) => {
      const key = "fotbalfm.ui.v1";
      const cur = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...cur, me: id }));
    }, p.id);
    await openTeam(page);
    await card(page, `Me ${k}`).locator(".nm").click();
    const modal = page.locator(".modal");
    await expect(modal.getByRole("button", { name: "Odebrat" })).toHaveCount(0);
    await modal.getByRole("button", { name: "Duplikovat" }).click();
    await expect(page.locator("#mName")).toHaveValue(`Me ${k} (kopie)`);
    await expect(modal.getByRole("button", { name: "Odebrat" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await state(page.request)).nodes.some((n) => n.name === `Me ${k} (kopie)`)).toBe(true);
    const copy = (await state(page.request)).nodes.find((n) => n.name === `Me ${k} (kopie)`)!;
    await cleanup(page.request, [p.id, copy.id]);
  });

  test("budget box: computation, digits-only inputs, remembered open state", async ({ page }) => {
    const req = page.request;
    const before = (await state(req)).budget;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const from = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    expect((await req.put("/api/budget", { data: { spolek: 100000, asAmount: 20000, monthlyInstallment: 5000, installmentFrom: from } })).ok()).toBeTruthy();
    const green = (await state(req)).nodes.filter((n) => n.kind === "person" && n.budgetColor === "green").reduce((s, n) => s + (n.budget ?? 0), 0);
    const fmt = (n: number) => (n < 0 ? "−" : "") + (Math.abs(n) ? Math.abs(n).toLocaleString("cs-CZ").replace(/\s/g, " ") : "0") + " Kč";

    await page.addInitScript(() => {
      const key = "fotbalfm.ui.v1";
      if (sessionStorage.getItem("bud-init")) return;
      sessionStorage.setItem("bud-init", "1");
      const cur = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...cur, curBudOpen: false }));
    });
    await openTeam(page);
    const left = 120000 - green - 5000 * 3;
    await expect(page.locator("#cbTot")).toHaveText(fmt(left));
    await expect(page.locator("#cbBody")).toBeHidden();
    await page.locator("#cbToggle").click();
    await expect(page.locator("#cbToggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#cbSum")).toHaveText("120 000 Kč");
    await expect(page.locator("#cbGreen")).toHaveText("− " + fmt(green));
    await expect(page.locator("#cbLeft")).toHaveText(fmt(left));
    await expect(page.locator("#cbPay")).toHaveValue("5\u00a0000"); // non-breaking thousands separator
    await expect(page.locator("#cbFrom")).toHaveValue(from);

    // any text accepted, digits stored; formatted on blur
    await page.locator("#cbSpolek").fill("abc 50 000 Kč");
    await expect(page.locator("#cbSum")).toHaveText("70 000 Kč");
    await page.locator("#cbAS").focus();
    await expect(page.locator("#cbSpolek")).toHaveValue("50\u00a0000");
    await expect.poll(async () => (await state(req)).budget.spolek).toBe(50000);

    // overspent → red with minus
    await page.locator("#cbSpolek").fill("0");
    await page.locator("#cbAS").fill("");
    await page.locator("#cbPay").focus();
    await expect(page.locator("#cbLeft")).toHaveClass(/cb-neg/);
    await expect(page.locator("#cbTot")).toHaveClass(/cb-neg/);
    await expect(page.locator("#cbLeft")).toHaveText(fmt(-green - 15000));

    // first non-zero installment sets installmentFrom to the current month
    await req.put("/api/budget", { data: { monthlyInstallment: 0, installmentFrom: null } });
    await page.reload();
    await expect(page.locator("#cbBody")).toBeVisible(); // open state remembered
    await expect(page.locator("#cbFrom")).toHaveValue("");
    await page.locator("#cbPay").fill("7500");
    await page.locator("#cbSpolek").focus();
    await expect(page.locator("#cbFrom")).toHaveValue(month);
    await expect.poll(async () => (await state(req)).budget.installmentFrom).toBe(`${month}-01`);
    // editable month
    await page.locator("#cbFrom").fill(from);
    await expect.poll(async () => (await state(req)).budget.installmentFrom).toBe(`${from}-01`);

    await req.put("/api/budget", { data: before });
  });

  test("realtime: a change in one browser appears in another", async ({ page, browser }: { page: Page; browser: Browser }) => {
    const other = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "cs-CZ" });
    const p2 = await other.newPage();
    await login(p2);
    await openTeam(p2);
    await openTeam(page);
    const name = `RT ${sfx()}`;
    await page.getByRole("button", { name: "+ Přidat člena" }).click();
    await page.locator("#mName").fill(name);
    await page.locator(".modal").getByRole("button", { name: "Přidat člena" }).click();
    await expect(card(p2, name)).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await state(page.request)).nodes.some((x) => x.name === name)).toBe(true);
    const n = (await state(page.request)).nodes.find((x) => x.name === name)!;
    await page.request.patch(`/api/org-nodes/${n.id}`, { data: { role: "Realtime role" } });
    await expect(card(p2, name).locator(".rl")).toHaveText("Realtime role", { timeout: 10_000 });
    await cleanup(page.request, [n.id]);
    await expect(card(p2, name)).toHaveCount(0, { timeout: 10_000 });
    await other.close();
  });

  test("member / unit modal closes when the node is deleted by someone else", async ({ page }) => {
    const req = page.request;
    const m = await createNode(req, { kind: "person", name: `Gone ${sfx()}` });
    const u = await createNode(req, { kind: "unit", name: `Gone ${sfx()}` });
    await openTeam(page);
    await page.locator(`#tree .onode[data-uid="${m.id}"]`).click();
    await expect(page.getByTestId("member-modal")).toBeVisible();
    await req.delete(`/api/org-nodes/${m.id}`);
    await expect(page.getByTestId("member-modal")).toHaveCount(0);
    await expect(page.locator(".app-toast")).toHaveText("Položka byla smazána jiným uživatelem.");
    await expect(page.locator(".mh h2")).toHaveCount(0); // did not turn into „Nový člen"
    await page.locator(`#tree .onode[data-uid="${u.id}"]`).click();
    await expect(page.getByTestId("unit-modal")).toBeVisible();
    await req.delete(`/api/org-nodes/${u.id}`);
    await expect(page.getByTestId("unit-modal")).toHaveCount(0);
    await expect(page.locator(".mh h2")).toHaveCount(0); // did not turn into „Nová kategorie"
  });

  test.describe("mobile", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("tree autoscrolls at the bottom edge during a touch drag; touchcancel reverts", async ({ page }) => {
      const ids: string[] = [];
      for (let i = 0; i < 8; i++) ids.push((await createNode(page.request, { kind: "person", name: `Org ${i} ${sfx()}` })).id);
      await openTeam(page);
      const org = page.locator("#org");
      const first = page.locator(`#tree .onode[data-uid="${ids[0]}"]`);
      await first.scrollIntoViewIfNeeded();
      const start = await org.evaluate((el) => el.scrollTop);
      const b = (await first.boundingBox())!;
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      const cdp = await page.context().newCDPSession(page);
      const pt = (py: number) => [{ x, y: py, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(y) });
      await page.waitForTimeout(320);
      await expect(page.locator(".onode.ghost")).toHaveCount(1);
      for (let i = 1; i <= 8; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(y + ((844 - 20 - y) * i) / 8) });
        await page.waitForTimeout(16);
      }
      await expect.poll(() => org.evaluate((el) => el.scrollTop), { timeout: 3000 }).toBeGreaterThan(start + 100);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await cdp.detach();
      await expect(page.locator(".onode.ghost")).toHaveCount(0);
      const s = await state(page.request);
      expect(ids.map((id) => s.nodes.find((n) => n.id === id)?.parentId ?? null)).toEqual(ids.map(() => null)); // nothing moved
    });
  });
});
