/**
 * Struktura týmu (prototype §10): member / unit forms, tree drag & drop, delete rules, budget box, realtime.
 * Every test creates its own uniquely named nodes through the API and removes them afterwards.
 */
import { expect, test, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";
import { expectNoA11yViolations, expectValue, optionTexts, pick, pickMonth } from "./ui-helpers";

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
    await expect(page.locator("#mName")).toHaveAttribute("aria-invalid", "true");
    await expect(modal.locator("#mName-err")).toHaveText("Vyplňte jméno");
    await expect(page.locator("#mBoss")).toHaveText("— nikdo (vedení týmu) —");
    await expectValue(page.locator("#mBoss"), "");
    await page.locator("#mName").fill(name);
    await page.locator("#mRole").fill("Specialista puzzli");
    await page.locator("#mInfo").fill("Testovací info");
    await page.locator("#mBud").fill("5 000 Kč");
    await page.locator("#mBud").blur();
    await expect(page.locator("#mBud")).toHaveValue("5\u00a0000"); // formatted on blur, „Kč" is the suffix
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
    await expect(page.locator("#mBud")).toHaveValue("5\u00a0000");
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
    await expect(u.locator(".st")).toHaveText("0 členů"); // name matches no task category → no task count

    // hover + → new member under the unit
    await u.hover();
    await u.locator(".plus").click();
    await expect(modal.locator("h2")).toHaveText("Nový člen");
    await expect(page.locator("#mBoss")).toHaveText(name);
    await expectValue(page.locator("#mBoss"), (await state(page.request)).nodes.find((n) => n.name === name)!.id);
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
    await expect(modal.locator(".meta")).toHaveText("1 přiřazený úkol");
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
    await expectValue(page.locator("#cbFrom"), from);

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
    await expectValue(page.locator("#cbFrom"), "");
    await page.locator("#cbPay").fill("7500");
    await page.locator("#cbSpolek").focus();
    await expectValue(page.locator("#cbFrom"), month);
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

  test("keyboard: the card name opens the form, radios / swatches / checkboxes work without a mouse", async ({ page }) => {
    const k = sfx();
    const p = await createNode(page.request, { kind: "person", name: `Kbd ${k}`, info: "Kontakt" });
    await openTeam(page);
    const c = card(page, `Kbd ${k}`);
    const nameBtn = c.getByRole("button", { name: `Kbd ${k}`, exact: true });
    await nameBtn.focus();
    await page.keyboard.press("Shift+Tab"); // arrive by keyboard → :focus-visible
    await page.keyboard.press("Tab");
    await expect(nameBtn).toBeFocused();
    await expect(c).toHaveCSS("outline-style", "solid"); // the whole card shows the focus ring
    await page.keyboard.press("Enter");
    const modal = page.getByTestId("member-modal");
    await expect(modal.locator("h2")).toHaveText("Člen týmu");
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(nameBtn).toBeFocused(); // focus back on the opener
    await page.keyboard.press("Space");
    await expect(modal.locator("h2")).toHaveText("Člen týmu");

    // Stav budgetu: radios move with the arrow keys and show a focus ring on the chip
    await modal.locator("input[name=budc][value=blue]").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(modal.locator("input[name=budc][value=green]")).toBeChecked();
    await expect(modal.locator(".budc label", { hasText: "V budgetu" })).toHaveCSS("outline-style", "solid");
    // colour swatches have Czech accessible names
    await modal.getByRole("radio", { name: "Červená", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(modal.getByRole("radio", { name: "Červená", exact: true })).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(modal.getByRole("radio", { name: "Oranžová", exact: true })).toBeChecked();
    // Oblasti: checkboxes toggle with Space
    await modal.getByRole("checkbox", { name: "Web", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(modal.locator(".chkgrid input[value=Web]")).toBeChecked();
    // Ctrl+Enter saves
    await page.keyboard.press("Control+Enter");
    await expect(modal).toHaveCount(0);
    await expect.poll(async () => (await nodeOf(page.request, p.id))?.budgetColor).toBe("green");
    const saved = (await state(page.request)).nodes.find((n) => n.id === p.id) as unknown as { avatarColor: string; areas: string[] };
    expect(saved).toMatchObject({ avatarColor: "#d98a00", areas: ["Web"] });
    // light avatar colour → navy initials (contrast)
    await expect(c.locator(".av")).toHaveCSS("color", "rgb(27, 35, 65)");
    // the small „+" / „i" buttons have 44 px hit areas
    for (const sel of [".plus", ".info"]) {
      const hit = await c.locator(sel).evaluate((el) => {
        const cs = getComputedStyle(el, "::after");
        return Math.min(parseFloat(cs.width), parseFloat(cs.height));
      });
      expect(hit, sel).toBeGreaterThanOrEqual(44);
    }
    await cleanup(page.request, [p.id]);
  });

  test("Nadřízený select: groups, own subtree excluded, picking saves the parent", async ({ page }) => {
    const req = page.request;
    const k = sfx();
    const boss = await createNode(req, { kind: "person", name: `Šéf ${k}`, role: `Role ${k}` });
    const kid = await createNode(req, { kind: "person", name: `Dítě ${k}`, parentId: boss.id });
    const other = await createNode(req, { kind: "person", name: `Jiný ${k}` });
    const u = await createNode(req, { kind: "unit", name: `Kat ${k}` });
    await openTeam(page);
    await card(page, `Šéf ${k}`).locator(".nm").click();
    const modal = page.getByTestId("member-modal");
    await expect(page.locator("#mBoss")).toHaveText("— nikdo (vedení týmu) —");
    const texts = await optionTexts(page, "#mBoss");
    expect(texts[0]).toBe("— nikdo (vedení týmu) —");
    expect(texts).toContain(`Kat ${k}`);
    expect(texts).toContain(`Jiný ${k}`);
    expect(texts.some((t) => t.startsWith(`Šéf ${k}`) || t.startsWith(`Dítě ${k}`))).toBe(false); // itself + descendants
    // options are grouped „Kategorie" / „Členové"; persons show their role
    await page.locator("#mBoss").click();
    const lb = page.locator("#mBoss-listbox");
    await expect(lb.getByRole("group", { name: "Kategorie" }).getByRole("option", { name: `Kat ${k}` })).toHaveCount(1);
    await expect(lb.getByRole("group", { name: "Členové" }).getByRole("option", { name: new RegExp(`^Jiný ${k}`) })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible(); // Esc closed only the list
    await pick(page, "#mBoss", u.id);
    await expect(page.locator("#mBoss")).toHaveText(`Kat ${k}`);
    await modal.getByRole("button", { name: "Uložit" }).click();
    await expect.poll(async () => (await nodeOf(req, boss.id))?.parentId).toBe(u.id);
    // the child's form offers the boss's role as meta
    await card(page, `Dítě ${k}`).locator(".nm").click();
    expect(await optionTexts(page, "#mBoss")).toContain(`Šéf ${k} Role ${k}`);
    await page.keyboard.press("Escape");
    await cleanup(req, [u.id, boss.id, kid.id, other.id]);
  });

  test("info bubble: toggles, Esc closes it and returns focus", async ({ page }) => {
    const k = sfx();
    const p = await createNode(page.request, { kind: "person", name: `Info ${k}`, info: `Telefon ${k}` });
    await openTeam(page);
    const c = card(page, `Info ${k}`);
    await c.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const i = c.locator(".info");
    await expect(i).toHaveAttribute("aria-expanded", "false");
    await i.click();
    await expect(page.locator("#infoPop")).toContainText(`Telefon ${k}`);
    await expect(i).toHaveAttribute("aria-expanded", "true");
    await expect(i).toHaveAttribute("aria-controls", "infoPop");
    await page.keyboard.press("Escape");
    await expect(page.locator("#infoPop")).toHaveCount(0);
    await expect(i).toBeFocused();
    await expect(i).toHaveAttribute("aria-expanded", "false");
    await i.click();
    await expect(page.locator("#infoPop")).toBeVisible();
    await i.click(); // second click closes
    await expect(page.locator("#infoPop")).toHaveCount(0);
    await expect(page.getByTestId("member-modal")).toHaveCount(0); // the „i" never opens the form
    await cleanup(page.request, [p.id]);
  });

  test("budget box: Kč fields, month picker, plain colours; ≥ 1200 px it is the right-hand column", async ({ page }) => {
    const req = page.request;
    const before = (await state(req)).budget;
    expect((await req.put("/api/budget", { data: { monthlyInstallment: 5000, installmentFrom: "2026-03" } })).ok()).toBeTruthy();
    await page.addInitScript(() => {
      const key = "fotbalfm.ui.v1";
      const cur = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...cur, curBudOpen: true }));
    });
    await openTeam(page);
    await expect(page.locator("#cbBody")).toBeVisible();
    for (const id of ["cbSpolek", "cbAS", "cbPay"]) await expect(page.locator(`#${id} + .fm-money__sfx`)).toHaveText("Kč");
    await expect(page.locator("#cbPay")).toHaveCSS("color", "rgb(27, 35, 65)"); // not red: a plain amount
    await expect(page.locator("#cbGreen")).toHaveCSS("color", "rgb(27, 35, 65)");
    await expect(page.locator("#cbFrom")).toHaveValue("Březen 2026");
    await pickMonth(page, "#cbFrom", "2026-05");
    await expect(page.locator("#cbFrom")).toHaveValue("Květen 2026");
    await expect.poll(async () => (await state(req)).budget.installmentFrom).toBe("2026-05-01");
    // typing commits only a complete month
    await page.locator("#cbFrom").fill("4/2026");
    await expect.poll(async () => (await state(req)).budget.installmentFrom).toBe("2026-04-01");
    await page.locator("#cbSpolek").focus();
    await expect(page.locator("#cbFrom")).toHaveValue("Duben 2026");

    // layout: the box sits to the right of the tree, which starts right under the header
    const bb = (await page.locator("#curBud").boundingBox())!;
    const tb = (await page.locator("#tree").boundingBox())!;
    const hb = (await page.locator("#org .orgh").boundingBox())!;
    expect(bb.x).toBeGreaterThanOrEqual(tb.x + tb.width);
    expect(tb.y - (hb.y + hb.height)).toBeLessThan(48);
    // ≤ 1199 px it goes back above the tree
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(async () => {
      const b = (await page.locator("#curBud").boundingBox())!;
      const t = (await page.locator("#tree").boundingBox())!;
      return b.y + b.height <= t.y;
    }).toBe(true);
    await req.put("/api/budget", { data: before });
  });

  test("a11y: org view, member and unit forms have no serious axe violations", async ({ page }) => {
    const k = sfx();
    const p = await createNode(page.request, { kind: "person", name: `Axe ${k}`, info: "Info", budget: 1000, budgetColor: "green" });
    const units = [];
    for (const color of ["#0099cf", "#1f8a4c", "#d98a00", "#63666b", "#c4c8ce"]) units.push(await createNode(page.request, { kind: "unit", name: `Axe ${color} ${k}`, color, parentId: p.id }));
    await page.addInitScript(() => {
      const key = "fotbalfm.ui.v1";
      const cur = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...cur, curBudOpen: true }));
    });
    await openTeam(page);
    await expect(card(page, `Axe ${k}`)).toBeVisible();
    await expectNoA11yViolations(page, { include: "#org" });
    // info bubble open
    await card(page, `Axe ${k}`).scrollIntoViewIfNeeded();
    await card(page, `Axe ${k}`).locator(".info").click();
    await expect(page.locator("#infoPop")).toBeVisible();
    await expectNoA11yViolations(page, { include: ["#org", "#infoPop"] });
    await page.keyboard.press("Escape");
    // member form: new with the name error, then the open Nadřízený list
    await page.getByRole("button", { name: "+ Přidat člena" }).click();
    const modal = page.getByTestId("member-modal");
    await modal.getByRole("button", { name: "Přidat člena" }).click();
    await expect(modal.locator("#mName-err")).toBeVisible();
    await expectNoA11yViolations(page, { include: "[data-testid=member-modal]" });
    await page.locator("#mBoss").click();
    await expect(page.locator("#mBoss-listbox")).toBeVisible();
    await expectNoA11yViolations(page, { include: ["[data-testid=member-modal]", "#mBoss-listbox"] });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    // existing unit form
    await card(page, `Axe #d98a00 ${k}`).locator(".un").click();
    await expect(page.getByTestId("unit-modal")).toBeVisible();
    await expectNoA11yViolations(page, { include: "[data-testid=unit-modal]" });
    await page.keyboard.press("Escape");
    // month picker
    await page.locator("#cbFrom").locator("xpath=following-sibling::button[1]").click();
    const dlg = page.locator('[role="dialog"][aria-label="Vybrat měsíc"]');
    await expect(dlg).toBeVisible();
    await expectNoA11yViolations(page, { include: ["#curBud", '[role="dialog"][aria-label="Vybrat měsíc"]'] });
    await page.keyboard.press("Escape");
    await cleanup(page.request, [p.id, ...units.map((u) => u.id)]);
  });

  test.describe("mobile", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("16 px gutters, sheet pickers and no serious axe violations on a phone", async ({ page }) => {
      const k = sfx();
      const p = await createNode(page.request, { kind: "person", name: `Mob ${k}`, info: "Info" });
      await openTeam(page);
      const c = card(page, `Mob ${k}`);
      await c.scrollIntoViewIfNeeded();
      const b = (await c.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(16);
      expect(b.x + b.width).toBeLessThanOrEqual(390 - 16);
      await expectNoA11yViolations(page, { include: "#org" });
      // Nadřízený opens as a bottom sheet
      await c.locator(".nm").click();
      await page.locator("#mBoss").click();
      await expect(page.locator(".fm-sheet")).toBeVisible();
      await page.locator(".fm-sheet").getByRole("option", { name: "— nikdo (vedení týmu) —" }).click();
      await expect(page.locator(".fm-sheet")).toHaveCount(0);
      await expectNoA11yViolations(page, { include: "[data-testid=member-modal]" });
      await page.getByTestId("member-modal").getByRole("button", { name: "Zrušit" }).click();
      await cleanup(page.request, [p.id]);
    });

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
