/** Shared helpers for the board e2e specs (tasks / print). Works against an empty production DB (CI) or demo data. */
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const TOKEN = process.env.APP_ACCESS_TOKEN ?? "dev-token";

export interface Prefs {
  me?: string | null;
  view?: "board" | "print" | "org";
  filter?: string;
  month?: string;
  mine?: boolean;
  prFilter?: string;
  prMonth?: string;
}

/** Log in via the magic link, store UI prefs and open the app on the requested tab. */
export async function openApp(page: Page, prefs: Prefs = {}): Promise<void> {
  await page.goto(`/k/${TOKEN}`);
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate((p) => {
    localStorage.setItem("fotbalfm.ui.v1", JSON.stringify({ view: "board", filter: "Vše", month: "all", mine: false, prFilter: "Vše", prMonth: "all", ...p }));
  }, prefs);
  await page.reload();
  if (prefs.view !== "org") await expect(page.locator("#board .col").first()).toBeVisible();
}

export async function getState(request: APIRequestContext) {
  const res = await request.get("/api/state");
  expect(res.status()).toBe(200);
  return (await res.json()) as {
    nodes: Array<{ id: string; kind: string; name: string }>;
    columns: Array<{ id: string; boardId: string; title: string; sortOrder: number }>;
    tasks: Array<{ id: string; columnId: string; title: string; category: string; sortOrder: number; leadId: string | null; ownerId: string | null }>;
    printTypes: Array<{ id: string; name: string; sortOrder: number }>;
    printItems: Array<{ id: string; columnId: string; typeId: string; title: string; price: number | null; paidByClub: boolean; sortOrder: number }>;
    attachments: Array<{ id: string; parentId: string; kind: string; name: string; url: string }>;
  };
}

export async function createPerson(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.post("/api/org-nodes", { data: { kind: "person", name } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

export async function deleteNode(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`/api/org-nodes/${id}`);
}

export function columnsOf(state: Awaited<ReturnType<typeof getState>>, board: "tasks" | "print") {
  return state.columns.filter((c) => c.boardId === board).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** `.col` section by its (visible) title. */
export function column(page: Page, title: string): Locator {
  return page.locator("#board .col").filter({ has: page.locator(".colh .t", { hasText: new RegExp(`^${escapeRe(title)}$`) }) });
}

export function card(page: Page, title: string): Locator {
  return page.locator("#board .card:not(.ghost)").filter({ has: page.locator("h3", { hasText: new RegExp(`^${escapeRe(title)}$`) }) });
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Mouse drag from the centre of `from` to the vertical position `y` (relative to `to`'s box, default: bottom area). */
export async function mouseDrag(page: Page, from: Locator, to: Locator, opts: { yFrac?: number } = {}): Promise<void> {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("drag: element not visible");
  const sx = a.x + a.width / 2;
  const sy = a.y + a.height / 2;
  const tx = b.x + b.width / 2;
  const ty = b.y + b.height * (opts.yFrac ?? 0.5);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 10, sy + 10, { steps: 3 }); // > 5 px activates the drag
  await page.mouse.move(tx, ty, { steps: 12 });
  await page.waitForTimeout(80);
  await page.mouse.move(tx, ty + 1);
  await page.mouse.up();
}

/** Touch drag via CDP: hold 300 ms (prototype: 220 ms), then move and release. Chromium only. */
export async function touchDrag(page: Page, from: Locator, to: Locator, opts: { yFrac?: number } = {}): Promise<void> {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("drag: element not visible");
  const cdp = await page.context().newCDPSession(page);
  const sx = a.x + a.width / 2;
  const sy = a.y + a.height / 2;
  const tx = b.x + b.width / 2;
  const ty = b.y + b.height * (opts.yFrac ?? 0.5);
  const pt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(sx, sy) });
  await page.waitForTimeout(320);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(sx + ((tx - sx) * i) / steps, sy + ((ty - sy) * i) / steps) });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(80);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
