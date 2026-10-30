import { describe, expect, it } from "vitest";
import { incomeVisible, printMonthOptions, sortIncomes, sumIncomes } from "@/lib/filters";
import { buildYearReport } from "@/lib/report";
import * as o from "@/lib/store/optimistic";
import { income, person, printItem, state } from "./fixtures";

const now = new Date(2026, 9, 13);
const all = { typeId: "Vše", month: "all", q: "" };

describe("print incomes", () => {
  it("visibility: month by paidDate, search, archived hidden, a specific media type hides incomes", () => {
    const i = income({ title: "Dar sponzora", description: "na plakáty", paidDate: "2026-10-05", amount: 1000 });
    expect(incomeVisible(i, all)).toBe(true);
    expect(incomeVisible(i, { ...all, month: "2026-10" })).toBe(true);
    expect(incomeVisible(i, { ...all, month: "2026-09" })).toBe(false);
    expect(incomeVisible(i, { ...all, month: "none" })).toBe(false);
    expect(incomeVisible(income({ paidDate: null }), { ...all, month: "none" })).toBe(true);
    expect(incomeVisible(i, { ...all, q: "PLAKÁTY" })).toBe(true);
    expect(incomeVisible(i, { ...all, q: "letáky" })).toBe(false);
    expect(incomeVisible(i, { ...all, typeId: "ty1" })).toBe(false);
    expect(incomeVisible({ ...i, archived: true }, all)).toBe(false);
  });

  it("sums and sorts (undated first, then paidDate DESC, then newest)", () => {
    const a = income({ id: "a", paidDate: "2026-03-01", amount: 500 });
    const b = income({ id: "b", paidDate: "2026-05-01", amount: null });
    const c = income({ id: "c", paidDate: null, amount: 250 });
    const d = income({ id: "d", paidDate: "2026-05-01", createdAt: "2026-06-01T00:00:00.000Z" });
    expect(sumIncomes([a, b, c])).toBe(750);
    expect(sortIncomes([a, b, c, d]).map((i) => i.id)).toEqual(["c", "d", "b", "a"]);
  });

  it("month options: net of incomes under „Všechny typy\", income months included", () => {
    const items = [printItem({ typeId: "ty1", price: 5000, realizationDate: "2026-10-01" })];
    const incomes = [income({ amount: 1500, paidDate: "2026-10-20" }), income({ amount: 200, paidDate: "2027-06-01" })];
    const opts = printMonthOptions(items, "Vše", now, undefined, incomes);
    expect(opts.find((m) => m.value === "2026-10")?.label).toBe("Říjen 2026 · 3 500 Kč");
    expect(opts.find((m) => m.value === "2027-06")?.value2).toBe(-200);
    const typed = printMonthOptions(items, "ty1", now, undefined, incomes);
    expect(typed.find((m) => m.value === "2026-10")?.value2).toBe(5000);
    expect(typed.some((m) => m.value === "2027-06")).toBe(false);
  });

  it("year report: incomes of the year (archived too), total and net", () => {
    const r = buildYearReport({
      items: [printItem({ price: 4000, realizationDate: "2026-03-10" })],
      incomes: [
        income({ id: "x", amount: 1000, paidDate: "2026-02-01", archived: true }),
        income({ id: "y", amount: 500, paidDate: "2026-08-01" }),
        income({ id: "z", amount: 9, paidDate: "2025-08-01" }),
        income({ amount: 7, paidDate: null }),
      ],
      types: [],
      closures: [],
      year: 2026,
      now,
    });
    expect(r.incomes.map((i) => i.id)).toEqual(["y", "x"]);
    expect(r).toMatchObject({ total: 4000, incomeTotal: 1500, net: 2500, incomeNoDateCount: 1 });
    expect(r.years).toContain(2025);
    expect(buildYearReport({ items: [], types: [], closures: [], year: 2026, now })).toMatchObject({ incomes: [], incomeTotal: 0, net: 0 });
  });

  it("optimistic: add / patch / remove, close + reopen year, person delete clears createdBy", () => {
    let s = state({ nodes: [person({ id: "me" })] });
    s = o.addPrintIncome(s, income({ id: "a", paidDate: "2026-05-01", createdBy: "me" }));
    s = o.addPrintIncome(s, income({ id: "b", paidDate: "2025-05-01" }));
    s = o.patchPrintIncome(s, "a", { amount: 300, payer: "as" });
    expect(s.printIncomes[0]).toMatchObject({ amount: 300, payer: "as" });
    const closed = o.closeYear(s, 2026, "t");
    expect(closed.printIncomes.map((i) => i.archived)).toEqual([true, false]);
    expect(o.reopenYear(closed, 2026).printIncomes.every((i) => !i.archived)).toBe(true);
    expect(o.deleteNode(s, "me").printIncomes[0].createdBy).toBeNull();
    expect(o.removePrintIncome(s, "a").printIncomes.map((i) => i.id)).toEqual(["b"]);
  });
});
