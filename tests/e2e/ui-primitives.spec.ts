/** UI primitives on /ui-lab (internal style guide): keyboard, layers, touch sheets, formatting, axe. */
import { expect, test, type Page } from "@playwright/test";
import { addDays, addMonthsToDate, formatDateInput, weekStart } from "../../src/lib/dates";
import { expectNoA11yViolations, expectValue, optionText, optionTexts, pick, pickMonth, setDate } from "./ui-helpers";

const TOKEN = process.env.APP_ACCESS_TOKEN ?? "dev-token";
const NB = " ";

async function openLab(page: Page): Promise<void> {
  await page.goto(`/k/${TOKEN}`);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/ui-lab");
  await expect(page.locator("#labCat")).toBeVisible();
}

/** Today in the browser's time zone as "YYYY-MM-DD". */
const browserToday = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

const activeValue = async (page: Page, sel: string) => {
  const host = page.locator(sel);
  const id = await host.getAttribute("aria-activedescendant");
  return id ? page.locator(`[id="${id}"]`).getAttribute("data-value") : null;
};

test("/ui-lab is behind the login and not indexed", async ({ page }) => {
  await page.goto("/ui-lab");
  await expect(page).toHaveURL(/\/login$/);
  await openLab(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test.describe("desktop", () => {
  test.beforeEach(async ({ page }) => openLab(page));

  test("Select: open keys, Home/End, typeahead, Enter", async ({ page }) => {
    const t = page.locator("#labCol");
    await expect(t).toHaveAttribute("role", "combobox");
    await t.focus();
    await page.keyboard.press("ArrowDown");
    await expect(t).toHaveAttribute("aria-expanded", "true");
    expect(await activeValue(page, "#labCol")).toBe("c2"); // starts on the selected option
    await page.keyboard.press("End");
    expect(await activeValue(page, "#labCol")).toBe("c5");
    await page.keyboard.press("Home");
    expect(await activeValue(page, "#labCol")).toBe("c1");
    await page.keyboard.press("r");
    expect(await activeValue(page, "#labCol")).toBe("c3"); // Rozpracováno
    await page.waitForTimeout(600);
    await page.keyboard.press("k");
    expect(await activeValue(page, "#labCol")).toBe("c4"); // next „k…" after the active one: Ke schválení
    await page.keyboard.press("k");
    expect(await activeValue(page, "#labCol")).toBe("c2"); // repeated char cycles: K řešení
    await page.waitForTimeout(600);
    await page.keyboard.type("ke s");
    expect(await activeValue(page, "#labCol")).toBe("c4"); // multi-char (space inside the buffer does not select)
    await page.keyboard.press("Enter");
    await expect(t).toHaveAttribute("aria-expanded", "false");
    await expectValue(t, "c4");
    await expect(t).toBeFocused();
    await expect(page.locator("#out-labCol")).toHaveText("c4");
    // closed typeahead opens on the match; Alt+↑ selects
    await page.waitForTimeout(600);
    await page.keyboard.press("h");
    await expect(t).toHaveAttribute("aria-expanded", "true");
    expect(await activeValue(page, "#labCol")).toBe("c5");
    await page.keyboard.press("Alt+ArrowUp");
    await expectValue(t, "c5");
    // disabled options are skipped
    await page.locator("#labWho").focus();
    await page.keyboard.press("Enter");
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    expect(await activeValue(page, "#labWho")).toBe("p5"); // p4 is disabled
    await page.keyboard.press("Escape");
  });

  test("Select: label click, mouse pick, optgroups, helpers", async ({ page }) => {
    await page.getByText("Stav", { exact: true }).click();
    await expect(page.locator("#labCol")).toHaveAttribute("aria-expanded", "true");
    await page.locator('#labCol-listbox [role="option"]', { hasText: "Hotovo" }).click();
    await expectValue(page.locator("#labCol"), "c5");

    await page.locator("#labCat").click();
    const groups = page.locator('#labCat-listbox [role="group"]');
    await expect(groups).toHaveCount(3);
    const labels = await groups.evaluateAll((gs) => gs.map((g) => document.getElementById(g.getAttribute("aria-labelledby") ?? "")?.textContent));
    expect(labels).toEqual(["Muži", "Mládež", "Klub a služby"]);
    await expect(page.locator('#labCat-listbox [role="option"][aria-selected="true"]')).toHaveText("Celý klub");
    await page.keyboard.press("Escape");

    await pick(page, "#labCat", "Dorost U17");
    await expect(page.locator("#out-labCat")).toHaveText("Dorost U17");
    expect(await optionText(page, "#labMon", "all")).toBe("Všechny měsíce");
    const texts = await optionTexts(page, "#labCol");
    expect(texts).toEqual(["Nápady", "K řešení", "Rozpracováno", "Ke schválení", "Hotovo"]);
  });

  test("Select: search (diacritics-insensitive), PgDn/PgUp, Home/End, empty state", async ({ page }) => {
    const t = page.locator("#labCat");
    await t.focus();
    await page.keyboard.press("Enter");
    const search = page.getByRole("textbox", { name: "Hledat" });
    await expect(search).toBeFocused();
    await page.keyboard.type("dor");
    const opts = page.locator('#labCat-listbox [role="option"]');
    await expect(opts).toHaveCount(4);
    await expect(opts.first()).toHaveText("Dorost U16");
    await expect(page.locator("#labCat-listbox .fm-select__kicker")).toHaveText(["Mládež"]);
    await search.fill("xyz");
    await expect(page.getByRole("status").filter({ hasText: "Nic nenalezeno" })).toBeVisible();
    await search.fill("zakyne mladsi");
    await expect(opts).toHaveText(["Žákyně Mladší"]);
    await page.keyboard.press("Enter");
    await expectValue(t, "Žákyně Mladší");
    await expect(t).toBeFocused();

    // printable char on the closed trigger opens with the char in the search field
    await page.keyboard.press("w");
    await expect(search).toHaveValue("w");
    await page.keyboard.press("Escape");

    // PgDn / PgUp / Home / End in a long list (empty search)
    const m = page.locator("#labMon");
    await m.click();
    const values = await page.locator('#labMon-listbox [role="option"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-value")));
    const searchM = page.getByRole("textbox", { name: "Hledat" });
    const act = async () => {
      const id = await searchM.getAttribute("aria-activedescendant");
      return page.locator(`[id="${id}"]`).getAttribute("data-value");
    };
    expect(await act()).toBe("all");
    await page.keyboard.press("PageDown");
    expect(await act()).toBe(values[10]);
    await page.keyboard.press("PageDown");
    expect(await act()).toBe(values[values.length - 1]);
    await page.keyboard.press("PageUp");
    expect(await act()).toBe(values[values.length - 11]);
    await page.keyboard.press("Home");
    expect(await act()).toBe(values[0]);
    await page.keyboard.press("End");
    expect(await act()).toBe("none");
    await page.keyboard.press("Escape");
    await expect(m).toHaveAttribute("aria-expanded", "false");
    await expect(m).toBeFocused();
  });

  test("Select: Tab selects the active option and moves focus on", async ({ page }) => {
    const col = page.locator("#labCol");
    await col.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    await expectValue(col, "c3");
    await expect(col).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#labWho")).toBeFocused();

    // from the search field (focus inside the body-portalled popup)
    const cat = page.locator("#labCat");
    await cat.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("web");
    await page.keyboard.press("Tab");
    await expectValue(cat, "Web");
    await expect(col).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cat).toBeFocused();
  });

  test("Select popup flips above the trigger near the bottom edge", async ({ page }) => {
    const col = page.locator("#labCol");
    await col.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await col.click();
    let pop = page.locator(".fm-pop");
    let tb = (await col.boundingBox())!;
    let pb = (await pop.boundingBox())!;
    expect(pb.y).toBeGreaterThanOrEqual(tb.y + tb.height - 1); // room below → below
    await page.keyboard.press("Escape");

    const flip = page.locator("#labFlip");
    await flip.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await page.evaluate(() => window.scrollBy(0, -8));
    await flip.click();
    pop = page.locator(".fm-pop");
    tb = (await flip.boundingBox())!;
    pb = (await pop.boundingBox())!;
    expect(pb.y + pb.height).toBeLessThanOrEqual(tb.y + 1);
    const vh = page.viewportSize()!.height;
    expect(pb.y).toBeGreaterThanOrEqual(0);
    expect(tb.y + tb.height).toBeLessThanOrEqual(vh);
    // outside click closes
    await page.mouse.click(5, 5);
    await expect(flip).toHaveAttribute("aria-expanded", "false");
  });

  test("Modal: initial focus, Esc layering, focus trap + restore, Ctrl+Enter", async ({ page }) => {
    const opener = page.locator("#labOpenModal");
    await opener.click();
    const modal = page.getByTestId("lab-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute("aria-labelledby", /.+/);
    await expect(page.getByRole("dialog", { name: "Ukázkový formulář" })).toBeVisible();
    await expect(page.locator("#mTitle")).toBeFocused();

    // Esc inside an open Select closes only the popup …
    await page.locator("#mSel").click();
    await expect(page.locator("#mSel")).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator("#mSel")).toHaveAttribute("aria-expanded", "false");
    await expect(modal).toBeVisible();
    await expect(page.locator("#mSel")).toBeFocused();
    // … and the same for the calendar
    await page.locator("#mDue ~ .fm-date__btn").click();
    await expect(page.getByRole("dialog", { name: "Vybrat datum" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Vybrat datum" })).toBeHidden();
    await expect(modal).toBeVisible();
    await expect(page.locator("#mDue")).toBeFocused();
    // a click on the overlay while a popup is open closes only the popup
    await page.locator("#mCol").click();
    await page.mouse.click(5, 5);
    await expect(page.locator("#mCol")).toHaveAttribute("aria-expanded", "false");
    await expect(modal).toBeVisible();

    // second Esc closes the modal and focus returns to the opener
    await page.locator("#mTitle").focus();
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator("#out-modal")).toHaveText("zavřeno");

    // focus trap
    await opener.click();
    await expect(page.locator("#mTitle")).toBeFocused();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="lab-modal"]'))).toBe(true);
    }
    await modal.locator(".close").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(modal.getByRole("button", { name: "Uložit" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(modal.locator(".close")).toBeFocused();
    // focus moved outside programmatically is pulled back
    await opener.evaluate((el) => (el as HTMLElement).focus());
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="lab-modal"]'))).toBe(true);

    // Ctrl/Cmd+Enter submits
    await page.locator("#mTitle").focus();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(modal).toBeHidden();
    await expect(page.locator("#out-modal")).toHaveText("odesláno");
  });

  test("DateInput: Czech parsing, blur formatting, invalid revert, relative hint", async ({ page }) => {
    const input = page.locator("#labDate");
    const out = page.locator("#out-labDate");
    const today = await browserToday(page);
    await expect(input).toHaveValue("út 3. 11. 2026");
    await expect(input).toHaveAttribute("aria-describedby", /labDate-rel/);

    for (const [text, iso] of [
      ["1.2.2027", "2027-02-01"],
      ["1. 2. 2027", "2027-02-01"],
      ["15/3/2027", "2027-03-15"],
      ["24.12.27", "2027-12-24"],
      ["2027-06-30", "2027-06-30"],
      ["5. června 2027", "2027-06-05"],
      ["dnes", today],
      ["zítra", addDays(today, 1)],
      ["+3", addDays(today, 3)],
    ] as const) {
      await input.fill(text);
      await expect(out, text).toHaveText(iso); // committed while typing
      await expectValue(input, iso);
    }
    await setDate(input, "3.11.2026");
    await expect(input).toHaveValue("út 3. 11. 2026");
    await expect(out).toHaveText("2026-11-03");

    await setDate(input, "31. 2. 2026");
    await expect(input).toHaveValue("út 3. 11. 2026"); // reverted
    await expect(out).toHaveText("2026-11-03");
    await expect(page.locator("#labDate-rel")).toHaveText("Datum nerozpoznáno");

    await setDate(input, "dnes");
    await expect(page.locator("#labDate-rel")).toHaveText("dnes");
    await setDate(input, "");
    await expect(out).toHaveText("∅");
  });

  test("DateInput: calendar keyboard, quick picks, min", async ({ page }) => {
    const input = page.locator("#labDate");
    const out = page.locator("#out-labDate");
    const today = await browserToday(page);
    await input.focus();
    await page.keyboard.press("Alt+ArrowDown");
    const dlg = page.getByRole("dialog", { name: "Vybrat datum" });
    await expect(dlg).toBeVisible();
    await expect(dlg.locator(".fm-cal__title")).toHaveText("Listopad 2026");
    await expect(dlg.getByRole("columnheader")).toHaveText(["po", "út", "st", "čt", "pá", "so", "ne"]);
    const focused = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.iso ?? null);
    expect(await focused()).toBe("2026-11-03");
    await expect(dlg.locator('[aria-selected="true"] button')).toHaveAttribute("aria-label", "úterý 3. listopadu 2026");
    let cur = "2026-11-03";
    const steps: Array<[string, (d: string) => string]> = [
      ["ArrowRight", (d) => addDays(d, 1)],
      ["ArrowDown", (d) => addDays(d, 7)],
      ["ArrowLeft", (d) => addDays(d, -1)],
      ["ArrowUp", (d) => addDays(d, -7)],
      ["End", (d) => addDays(weekStart(d), 6)],
      ["Home", (d) => weekStart(d)],
      ["PageDown", (d) => addMonthsToDate(d, 1)],
      ["PageUp", (d) => addMonthsToDate(d, -1)],
      ["Shift+PageUp", (d) => addMonthsToDate(d, -12)],
      ["Shift+PageDown", (d) => addMonthsToDate(d, 12)],
      ["PageDown", (d) => addMonthsToDate(d, 1)],
    ];
    for (const [key, f] of steps) {
      await page.keyboard.press(key);
      cur = f(cur);
      expect(await focused(), key).toBe(cur);
    }
    await expect(dlg.locator(".fm-cal__title")).toHaveText("Prosinec 2026");
    await page.keyboard.press("Enter");
    await expect(dlg).toBeHidden();
    await expect(out).toHaveText(cur);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(formatDateInput(cur, { weekday: true }));

    // Tab stays inside the calendar dialog
    await page.locator("#labDate ~ .fm-date__btn").click();
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await dlg.getByRole("button", { name: "Zítra" }).click();
    await expect(out).toHaveText(addDays(today, 1));
    await page.locator("#labDate ~ .fm-date__btn").click();
    await dlg.getByRole("button", { name: "Za týden" }).click();
    await expect(out).toHaveText(addDays(today, 7));
    await page.locator("#labDate ~ .fm-date__btn").click();
    await dlg.getByRole("button", { name: "Vymazat" }).click();
    await expect(out).toHaveText("∅");
    await expect(input).toHaveValue("");

    // min = today: earlier days disabled, earlier typed dates rejected
    await page.locator("#labDate2 ~ .fm-date__btn").click();
    await expect(dlg.locator(`button[data-iso="${addDays(today, -1)}"]`)).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await setDate(page.locator("#labDate2"), formatDateInput(addDays(today, -1)));
    await expect(page.locator("#out-labDate2")).toHaveText("∅");
    await setDate(page.locator("#labDate2"), formatDateInput(addDays(today, 2)));
    await expect(page.locator("#out-labDate2")).toHaveText(addDays(today, 2));
  });

  test("MonthInput: typing commits only full months, blur accepts a bare name, picker", async ({ page }) => {
    const input = page.locator("#labMonth");
    const out = page.locator("#out-labMonth");
    await expect(input).toHaveValue("Říjen 2026");
    await input.fill("2027-03");
    await expect(out).toHaveText("2027-03");
    await input.press("Tab");
    await expect(input).toHaveValue("Březen 2027");
    await input.fill("11/2026");
    await expect(out).toHaveText("2026-11");
    await input.fill("rijen 202"); // half-typed year: nothing committed
    await expect(out).toHaveText("2026-11");
    await input.fill("prosinec");
    await expect(out).toHaveText("2026-11"); // bare name only on blur
    await input.press("Tab");
    const year = (await browserToday(page)).slice(0, 4);
    await expect(out).toHaveText(`${year}-12`);
    await expect(input).toHaveValue(`Prosinec ${year}`);
    await input.fill("blbost");
    await input.press("Tab");
    await expect(out).toHaveText(`${year}-12`);
    await expect(page.locator("#labMonth-err")).toHaveText("Měsíc nerozpoznán");

    await pickMonth(page, "#labMonth", "2025-02");
    await expect(input).toHaveValue("Únor 2025");
    // keyboard in the month grid
    await input.focus();
    await page.keyboard.press("Alt+ArrowDown");
    const dlg = page.getByRole("dialog", { name: "Vybrat měsíc" });
    await expect(dlg).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("PageDown");
    await page.keyboard.press("Enter");
    await expect(out).toHaveText("2026-06");
    await expect(input).toBeFocused();
    await page.locator("#labMonth ~ .fm-date__btn").click();
    await dlg.getByRole("button", { name: "Vymazat" }).click();
    await expect(out).toHaveText("∅");
  });

  test("MoneyInput: raw while typing, NBSP thousands on blur, zeroAsEmpty", async ({ page }) => {
    const price = page.locator("#labPrice");
    await expect(price).toHaveValue(`4${NB}500`);
    await price.fill("12345");
    await expect(page.locator("#out-labPrice")).toHaveText("12345");
    await expect(price).toHaveValue("12345");
    await price.press("Tab");
    await expect(price).toHaveValue(`12${NB}345`);
    await price.fill("4 500,50 Kč");
    await price.press("Tab");
    await expect(page.locator("#out-labPrice")).toHaveText("4500");
    await expect(price).toHaveValue(`4${NB}500`);
    await price.fill("");
    await price.press("Tab");
    await expect(page.locator("#out-labPrice")).toHaveText("∅");
    await expect(page.locator(".fm-money:has(#labPrice) .fm-money__sfx")).toHaveText("Kč");

    const bud = page.locator("#labBud");
    await expect(bud).toHaveValue("");
    await expect(bud).toHaveAttribute("placeholder", "0");
    await bud.fill("0");
    await bud.press("Tab");
    await expect(bud).toHaveValue("");
    await bud.fill("25000");
    await bud.press("Tab");
    await expect(bud).toHaveValue(`25${NB}000`);
  });

  test("Field error + Button busy", async ({ page }) => {
    await page.locator("#labValidate").click();
    const title = page.locator("#labTitle");
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(title).toHaveAttribute("aria-required", "true");
    await expect(title).toHaveAttribute("aria-describedby", "labTitle-err");
    await expect(page.locator("#labTitle-err")).toHaveText("Vyplňte název úkolu");
    await expect(page.locator("#labTitle-err")).toHaveAttribute("role", "alert");
    await expect(title).toHaveCSS("border-top-color", "rgb(179, 38, 30)");
    await title.focus();
    await expect(title).toHaveCSS("border-top-color", "rgb(179, 38, 30)");

    const busy = page.locator("#labBusy");
    await busy.click();
    await expect(busy).toHaveAttribute("aria-busy", "true");
    await expect(busy).toBeDisabled();
    await expect(busy).toHaveText("Uložit (busy)");
  });

  test("axe: no serious/critical violations (page, open Select, open calendar, modal)", async ({ page }) => {
    await expectNoA11yViolations(page);
    await page.locator("#labCat").click();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
    await page.locator("#labDate ~ .fm-date__btn").click();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
    await page.locator("#labMonth ~ .fm-date__btn").click();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
    await page.locator("#labOpenModal").click();
    await expectNoA11yViolations(page);
  });
});

test.describe("touch 390px", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test.beforeEach(async ({ page }) => openLab(page));

  test("Select opens a bottom sheet with 48px rows", async ({ page }) => {
    await page.locator("#labCol").tap();
    const sheet = page.getByRole("dialog", { name: "Stav" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveClass(/fm-sheet/);
    const sb = (await sheet.boundingBox())!;
    expect(sb.x).toBe(0);
    expect(sb.width).toBe(390);
    expect(Math.round(sb.y + sb.height)).toBe(844);
    const row = sheet.locator('[role="option"]').first();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await sheet.locator('[role="option"]', { hasText: "Hotovo" }).tap();
    await expect(sheet).toBeHidden();
    await expectValue(page.locator("#labCol"), "c5");

    // searchable sheet: the search field is there but not focused (no keyboard pop-up)
    await page.locator("#labCat").tap();
    const cat = page.getByRole("dialog", { name: "Kategorie" });
    await expect(cat).toBeVisible();
    const search = cat.getByRole("textbox", { name: "Hledat" });
    await expect(search).toBeVisible();
    await expect(search).not.toBeFocused();
    await expect(search).toHaveCSS("font-size", "16px");
    await search.tap();
    await search.fill("foto");
    await cat.locator('[role="option"]', { hasText: "Foto" }).tap();
    await expectValue(page.locator("#labCat"), "Foto");
    // × closes
    await page.locator("#labWho").tap();
    await page.locator(".fm-sheet").getByRole("button", { name: "Zavřít" }).tap();
    await expect(page.locator(".fm-sheet")).toHaveCount(0);
    await expect(page.locator("#labWho")).toHaveAttribute("aria-expanded", "false");
  });

  test("DateInput / MonthInput use sheets on touch", async ({ page }) => {
    const input = page.locator("#labDate");
    await expect(input).toHaveAttribute("readonly", "");
    await input.tap();
    const sheet = page.getByRole("dialog", { name: "Vybrat datum" });
    await expect(sheet).toBeVisible();
    const typeField = sheet.getByLabel("Napsat datum");
    await expect(typeField).not.toBeFocused();
    const day = sheet.locator('button[data-iso="2026-11-18"]');
    expect((await day.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await day.tap();
    await expect(sheet).toBeHidden();
    await expect(page.locator("#out-labDate")).toHaveText("2026-11-18");
    await input.tap();
    await sheet.getByLabel("Napsat datum").fill("24.12.2026");
    await expect(page.locator("#out-labDate")).toHaveText("2026-12-24");
    await sheet.getByRole("button", { name: "Zavřít" }).tap();
    await expect(input).toHaveValue("čt 24. 12. 2026");

    await page.locator("#labMonth").tap();
    const ms = page.getByRole("dialog", { name: "Vybrat měsíc" });
    await expect(ms).toBeVisible();
    await ms.locator('button[data-ym="2026-05"]').tap();
    await expect(page.locator("#out-labMonth")).toHaveText("2026-05");
  });

  test("Modal is full-screen, footer visible, no input autofocus", async ({ page }) => {
    await page.locator("#labOpenModal").tap();
    const modal = page.getByTestId("lab-modal");
    await expect(modal).toBeVisible();
    await expect(page.locator("#mTitle")).not.toBeFocused();
    const mb = (await modal.boundingBox())!;
    expect(mb.width).toBe(390);
    expect(Math.round(mb.height)).toBe(844);
    const save = modal.getByRole("button", { name: "Uložit" });
    const sb = (await save.boundingBox())!;
    expect(sb.y + sb.height).toBeLessThanOrEqual(844);
    expect(sb.height).toBeGreaterThanOrEqual(44);
    await page.locator("#mSel").tap();
    await expect(page.getByRole("dialog", { name: "Kategorie" })).toBeVisible();
  });

  test("axe on touch (page + sheet)", async ({ page }) => {
    await expectNoA11yViolations(page);
    await page.locator("#labCat").tap();
    await expectNoA11yViolations(page);
  });
});
