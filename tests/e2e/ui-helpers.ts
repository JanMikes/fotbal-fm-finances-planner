/**
 * Helpers for the custom UI primitives (src/components/ui): Select, DateInput, MonthInput + axe.
 * Triggers are passed as a CSS selector (usually "#id") or a Locator.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

type Target = string | Locator;

const loc = (page: Page, t: Target): Locator => (typeof t === "string" ? page.locator(t) : t);

/** The open listbox of a Select trigger (`aria-controls`). */
export async function listboxOf(page: Page, trigger: Target): Promise<Locator> {
  const id = await loc(page, trigger).getAttribute("aria-controls");
  if (!id) throw new Error("listboxOf: trigger has no aria-controls (not a Select?)");
  return page.locator(`[id="${id}"]`);
}

async function openSelect(page: Page, trigger: Target): Promise<Locator> {
  const t = loc(page, trigger);
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await expect(t).toHaveAttribute("aria-expanded", "true");
  const lb = await listboxOf(page, t);
  await expect(lb).toBeVisible();
  return lb;
}

async function closeSelect(page: Page, trigger: Target): Promise<void> {
  const t = loc(page, trigger);
  if ((await t.getAttribute("aria-expanded")) === "true") await page.keyboard.press("Escape");
  await expect(t).toHaveAttribute("aria-expanded", "false");
}

/**
 * Opens the Select and clicks the option with `data-value=value`. Retried: other spec files change the data in
 * parallel, and a realtime refetch can re-render the option list (e.g. month options with counts) between locating
 * the option and the click.
 */
export async function pick(page: Page, trigger: Target, value: string): Promise<void> {
  const t = loc(page, trigger);
  await expect(async () => {
    if ((await t.getAttribute("data-value")) === value && (await t.getAttribute("aria-expanded")) !== "true") return;
    const lb = await openSelect(page, t);
    const opt = lb.locator(`[role="option"][data-value="${value.replace(/"/g, '\\"')}"]`);
    if ((await opt.count()) === 0) throw new Error(`pick: no option with value "${value}"`);
    await opt.click({ timeout: 3000 });
    await expect(t).toHaveAttribute("data-value", value, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** Opens the Select and clicks the first option whose text matches. */
export async function pickByText(page: Page, trigger: Target, text: string | RegExp): Promise<void> {
  const lb = await openSelect(page, trigger);
  await lb.locator('[role="option"]').filter({ hasText: text }).first().click();
  await expect(loc(page, trigger)).toHaveAttribute("aria-expanded", "false");
}

/** Asserts the Select's committed value (its trigger's `data-value`; also works for DateInput / MonthInput inputs). */
export async function expectValue(trigger: Locator, value: string): Promise<void> {
  await expect(trigger).toHaveAttribute("data-value", value);
}

/** Texts of all options (label, plus the meta column after a space when present). Opens and closes the Select. */
export async function optionTexts(page: Page, trigger: Target): Promise<string[]> {
  const lb = await openSelect(page, trigger);
  const texts = await lb.locator('[role="option"]').evaluateAll((els) =>
    els.map((el) =>
      [el.querySelector(".fm-select__label")?.textContent ?? el.textContent ?? "", el.querySelector(".fm-select__meta")?.textContent ?? ""]
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" "),
    ),
  );
  await closeSelect(page, trigger);
  return texts;
}

/** Text of the option with `data-value=value` (see optionTexts). */
export async function optionText(page: Page, trigger: Target, value: string): Promise<string> {
  const lb = await openSelect(page, trigger);
  const opt = lb.locator(`[role="option"][data-value="${value.replace(/"/g, '\\"')}"]`);
  const text = await opt.evaluate((el) =>
    [el.querySelector(".fm-select__label")?.textContent ?? el.textContent ?? "", el.querySelector(".fm-select__meta")?.textContent ?? ""]
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" "),
  );
  await closeSelect(page, trigger);
  return text;
}

/** Types a date into a DateInput (any Czech format) and leaves the field (Tab), which normalises the text. */
export async function setDate(input: Locator, text: string): Promise<void> {
  await input.fill(text);
  await input.press("Tab");
}

/** Picks a month ("YYYY-MM") in a MonthInput through its popup (year arrows + month grid). */
export async function pickMonth(page: Page, trigger: Target, ym: string): Promise<void> {
  const input = loc(page, trigger);
  const btn = input.locator("xpath=following-sibling::button[1]");
  await btn.click();
  const dlg = page.locator('[role="dialog"][aria-label="Vybrat měsíc"]');
  await expect(dlg).toBeVisible();
  const year = Number(ym.slice(0, 4));
  for (let i = 0; i < 50; i++) {
    const shown = Number(await dlg.locator(".fm-cal__title").innerText());
    if (shown === year) break;
    await dlg.getByRole("button", { name: shown > year ? "Předchozí rok" : "Další rok" }).click();
  }
  await dlg.locator(`button[data-ym="${ym}"]`).click();
  await expect(dlg).toBeHidden();
  await expectValue(input, ym);
}

/**
 * axe-core scan; fails on serious/critical violations (WCAG 2.x A/AA + best practices).
 * The documented brand trade-off — white text on `--fm-blue` (#0099cf, 3.25:1: `.btn.primary`, `.price`) — is
 * allowlisted unless `allowBrandBlue: false`.
 */
export async function expectNoA11yViolations(
  page: Page,
  o: { include?: string | string[]; exclude?: string | string[]; disableRules?: string[]; allowBrandBlue?: boolean } = {},
): Promise<void> {
  // let fade-ins finish, otherwise axe measures half-transparent colours
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  let b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]);
  for (const s of ([] as string[]).concat(o.include ?? [])) b = b.include(s);
  for (const s of ([] as string[]).concat(o.exclude ?? [])) b = b.exclude(s);
  if (o.disableRules?.length) b = b.disableRules(o.disableRules);
  const res = await b.analyze();
  const brandBlue = (n: (typeof res.violations)[number]["nodes"][number]) =>
    n.any.some((c) => {
      const d = c.data as { fgColor?: string; bgColor?: string } | null;
      return d?.fgColor === "#ffffff" && d?.bgColor === "#0099cf";
    });
  const bad = res.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => (v.id === "color-contrast" && o.allowBrandBlue !== false ? { ...v, nodes: v.nodes.filter((n) => !brandBlue(n)) } : v))
    .filter((v) => v.nodes.length > 0);
  const report = bad.map((v) => `${v.impact} ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).slice(0, 8).join("\n  ")}`).join("\n");
  expect(bad, report).toEqual([]);
}
