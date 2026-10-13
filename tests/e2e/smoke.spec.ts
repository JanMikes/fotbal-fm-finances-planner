import { expect, test, type Page } from "@playwright/test";
import { createPerson, deleteNode } from "./boards-helpers";
import { expectNoA11yViolations, expectValue, pick } from "./ui-helpers";

const PASSWORD = process.env.APP_PASSWORD ?? "dev-password";
const TOKEN = process.env.APP_ACCESS_TOKEN ?? "dev-token";

test("health endpoint answers without auth", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});

test("API requires the session cookie", async ({ request }) => {
  const res = await request.get("/api/state");
  expect(res.status()).toBe(401);
});

test("unauthenticated visit redirects to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Heslo týmu")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vstoupit" })).toBeVisible();
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Heslo týmu").fill("definitely-wrong");
  await page.getByRole("button", { name: "Vstoupit" }).click();
  await expect(page.locator(".login-err")).toHaveText("Nesprávné heslo");
  // one error style: the field is invalid and described by the message
  const pw = page.getByLabel("Heslo týmu");
  await expect(pw).toHaveAttribute("aria-invalid", "true");
  await expect(pw).toHaveAccessibleDescription("Nesprávné heslo");
  await expect(page.locator(".login-err")).toHaveCSS("color", "rgb(179, 38, 30)");
  await expectNoA11yViolations(page);
});

test("login page: club subtitle, no axe violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(".login-sub")).toHaveText("FK Frýdek-Místek · marketing");
  await expect(page.getByLabel("Heslo týmu")).not.toHaveAttribute("aria-invalid", "true");
  await expectNoA11yViolations(page);
});

test("login with the team password opens the app", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Heslo týmu").fill(PASSWORD);
  await page.getByRole("button", { name: "Vstoupit" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Marketingový plán úkolů" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Úkoly" })).toBeVisible();
  // the client store loaded /api/state
  await expect(page.locator("[data-phase1-placeholder], .board, .org").first()).toBeVisible();
  const state = await page.request.get("/api/state");
  expect(state.status()).toBe(200);
});

test("magic link logs in and strips the token from the URL", async ({ page, context }) => {
  await page.goto(`/k/${TOKEN}`);
  await expect(page).toHaveURL(/\/$/);
  expect(page.url()).not.toContain(TOKEN);
  await expect(page.getByRole("heading", { name: "Marketingový plán úkolů" })).toBeVisible();
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "fmp_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
});

test("invalid magic link goes to the login page", async ({ page }) => {
  await page.goto("/k/not-the-token");
  await expect(page).toHaveURL(/\/login$/);
});

/* ------------------------------------------------------------------ shell (header, status layer, first load) */

async function openShell(page: Page) {
  await page.goto(`/k/${TOKEN}`);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#board .col, .org").first()).toBeVisible();
}

test.describe("shell", () => {
  test("header: tabs with aria-current, identity Select by keyboard (persisted), axe", async ({ page }) => {
    await openShell(page);
    // self-contained: on a fresh database (CI) there may be fewer than two members at this point
    const k = Date.now().toString(36);
    const own = [await createPerson(page.request, `Hlavička A ${k}`), await createPerson(page.request, `Hlavička B ${k}`)];
    await page.reload();
    await expect(page.locator("#board .col, .org").first()).toBeVisible();
    try {
      const tabs = page.locator("#tabs button");
      await page.getByRole("button", { name: "Úkoly", exact: true }).click();
      await expect(page.getByRole("button", { name: "Úkoly", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(tabs.filter({ hasText: "Tiskoviny" })).not.toHaveAttribute("aria-current", /.*/);
      await expect(page.locator("#btnNew")).toBeEnabled();
      await expect(page.locator("#btnNew")).toHaveText("+ Nový úkol");

      const me = page.getByRole("combobox", { name: "Přihlášen" });
      await expect(me).toHaveAttribute("id", "me");
      const before = await me.getAttribute("data-value");
      expect(before).toBeTruthy();
      // keyboard: Enter opens the list, End + Enter picks the last member
      await me.focus();
      await page.keyboard.press("Enter");
      await expect(me).toHaveAttribute("aria-expanded", "true");
      const lb = page.locator("#me-listbox");
      await expect(lb).toBeVisible();
      await expectNoA11yViolations(page, { include: [".top", "#me-listbox"] });
      const opts = lb.getByRole("option");
      expect(await opts.count()).toBeGreaterThan(1);
      const last = (await opts.last().getAttribute("data-value"))!;
      const lastName = (await opts.last().locator(".fm-select__label").textContent())!.trim();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await expect(me).toHaveAttribute("aria-expanded", "false");
      await expectValue(me, last);
      await expect(me).toContainText(lastName);
      await expect(me).toBeFocused();
      // the identity is remembered per browser
      await page.reload();
      await expectValue(page.locator("#me"), last);
      // and the mouse path still works
      await pick(page, "#me", before!);
      await expectValue(page.locator("#me"), before!);

      await expectNoA11yViolations(page, { include: ".top" });
    } finally {
      for (const id of own) await deleteNode(page.request, id);
    }
  });

  test("header height and tab labels at 1440 / 1024 / 390 px", async ({ page }) => {
    await openShell(page);
    const measure = () =>
      page.evaluate(() => {
        // distinct line tops of the *visible* label text (visually hidden long labels are skipped)
        const lines = (el: Element) => {
          const tops = new Set<number>();
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            const p = n.parentElement!;
            if (!n.textContent!.trim() || !p.checkVisibility() || p.getBoundingClientRect().width <= 1) continue;
            const r = document.createRange();
            r.selectNodeContents(n);
            for (const x of r.getClientRects()) if (x.width > 1) tops.add(Math.round(x.top));
          }
          return tops.size;
        };
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const [h1, tabs, tools] = [box(".top h1"), box("#tabs"), box(".top .tools")];
        const sameRow = Math.abs(tabs.top - tools.top) < 20;
        return {
          overlap: sameRow && (h1.right > tabs.left + 1 || tabs.right > tools.left + 1),
          h: document.querySelector(".top")!.getBoundingClientRect().height,
          tabLines: [...document.querySelectorAll("#tabs button")].map(lines),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
    for (const [width, height, max] of [
      [1440, 900, 72],
      [1181, 800, 72],
      [1024, 768, 120],
      [390, 844, 104],
    ]) {
      await page.setViewportSize({ width, height });
      const m = await measure();
      expect(m.h, `header height at ${width}px`).toBeLessThanOrEqual(max);
      expect(m.overlap, `title, tabs and tools do not overlap at ${width}px`).toBe(false);
      expect(m.tabLines, `tab labels on one line at ${width}px`).toEqual([1, 1, 1]);
      expect(m.overflow, `no horizontal page scroll at ${width}px`).toBeLessThanOrEqual(0);
    }
    // 390px: short labels, unchanged accessible names
    const team = page.getByRole("button", { name: "Struktura týmu" });
    await expect(team).toBeVisible();
    await expect(team.locator(".tab-short")).toHaveText("Tým");
    await expect(team.locator(".tab-short")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Marketingový plán úkolů" })).toBeAttached();
    await expect(page.getByRole("button", { name: "+ Nový úkol" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Přihlášen" })).toBeVisible();
    await expectNoA11yViolations(page, { include: ".top" });
  });

  test("first load: skeleton, identity and „+ Nový“ disabled until the data is there", async ({ page }) => {
    await openShell(page);
    await page.route("**/api/state", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue().catch(() => {});
    });
    await page.reload();
    await expect(page.locator(".app-skel")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Načítám data…" })).toBeAttached();
    await expect(page.locator("#btnNew")).toBeDisabled();
    await expect(page.locator("#me")).toBeDisabled();
    await expect(page.locator("#me")).toContainText("Načítám…");
    await expect(page.locator("#board .col").first()).toBeVisible();
    await expect(page.locator(".app-skel")).toHaveCount(0);
    await expect(page.locator("#btnNew")).toBeEnabled();
    await page.unroute("**/api/state");
  });

  test("failed first load: centred error card, „Zkusit znovu“ reloads", async ({ page }) => {
    await openShell(page);
    await page.route("**/api/state", (r) => r.fulfill({ status: 503, contentType: "text/html", body: "<html><body>503</body></html>" }));
    await page.reload();
    const card = page.locator(".app-err__card");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "Nepodařilo se načíst data." })).toBeVisible();
    await expect(card).toHaveAttribute("role", "alert");
    await expectNoA11yViolations(page, { include: [".top", ".app-err"] });
    await page.unroute("**/api/state");
    await card.getByRole("button", { name: "Zkusit znovu" }).click();
    await expect(page.locator("#board .col").first()).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test("error toast: icon, message, × „Zavřít“", async ({ page }) => {
    await page.clock.install(); // time flows normally; runFor() below skips the 8 s auto-hide wait
    await openShell(page);
    await page.getByRole("button", { name: "Úkoly", exact: true }).click();
    // every write fails (fulfilled here, the server is never touched) → the store rolls back and toasts
    await page.route("**/api/**", (r) =>
      r.request().method() === "GET" ? r.continue() : r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "x" }) }),
    );
    await page.locator("#board .card").first().click();
    await page.locator("#fTitle").fill(`Smoke toast ${Date.now()}`);
    await page.getByRole("button", { name: "Uložit" }).click();
    const toast = page.locator(".app-toast");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute("role", "alert");
    const text = (await toast.textContent())!.trim();
    expect(text.length).toBeGreaterThan(0);
    await expectNoA11yViolations(page, { include: ".app-toast" });
    // the 8 s auto-hide is paused while the pointer is over the toast
    await toast.hover();
    await page.clock.runFor(8500);
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Zavřít" }).click();
    await expect(toast).toHaveCount(0);
    await page.unroute("**/api/**");
  });
});
