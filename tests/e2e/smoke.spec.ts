import { expect, test } from "@playwright/test";

const PASSWORD = process.env.APP_PASSWORD ?? "dev-password";
const TOKEN = process.env.APP_ACCESS_TOKEN ?? "dev-token";

test("health endpoint answers without auth", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
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
