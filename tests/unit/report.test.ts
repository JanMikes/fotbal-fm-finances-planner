import { describe, expect, it } from "vitest";
import { buildYearReport } from "@/lib/report";
import { printItem } from "./fixtures";

const types = [
  { id: "ty1", name: "Letáky", sortOrder: 1 },
  { id: "ty2", name: "Vizitky", sortOrder: 2 },
];

describe("buildYearReport", () => {
  const items = [
    printItem({ typeId: "ty1", price: 4500, quantity: 500, paidByClub: true, realizationDate: "2026-03-10", sortOrder: 1 }),
    printItem({ typeId: "ty1", price: 1500, quantity: 100, paidByClub: false, realizationDate: "2026-03-20", sortOrder: 2, archived: true }),
    printItem({ typeId: "ty2", price: 2000, quantity: 200, paidByClub: false, realizationDate: "2026-07-01", sortOrder: 3 }),
    printItem({ typeId: "gone", price: 1000, quantity: null, realizationDate: "2026-07-02", sortOrder: 4 }),
    printItem({ typeId: "ty1", price: 999, realizationDate: "2025-12-31" }),
    printItem({ typeId: "ty1", price: 5, realizationDate: null }),
    printItem({ typeId: "ty1", price: 5, realizationDate: null, archived: true }),
  ];
  const r = buildYearReport({ items, types, closures: [{ year: 2026, closedAt: "2026-12-31T10:00:00.000Z" }], year: 2026, now: new Date(2026, 9, 13) });

  it("totals and percentages", () => {
    expect(r.itemCount).toBe(4);
    expect(r.total).toBe(9000);
    expect(r.paid).toBe(4500);
    expect(r.owed).toBe(4500);
    expect(r.quantity).toBe(800);
    expect(r.paidPct).toBe(50);
    expect(r.owedPct).toBe(50);
    expect(r.closedAt).toBe("2026-12-31T10:00:00.000Z");
    expect(r.years).toEqual([2026, 2025]);
    expect(r.noDateCount).toBe(1);
  });

  it("months, average and top month", () => {
    expect(r.months).toHaveLength(12);
    expect(r.months[2]).toMatchObject({ name: "Březen", abbr: "Bře", sum: 6000, paid: 4500, owed: 1500 });
    expect(r.months[2].items).toHaveLength(2);
    expect(r.months[5].abbr).toBe("Čvn");
    expect(r.months[6]).toMatchObject({ abbr: "Čvc", sum: 3000, owed: 3000 });
    expect(r.maxMonth).toBe(6000);
    expect(r.activeMonths).toBe(2);
    expect(r.avgPerActiveMonth).toBe(4500);
    expect(r.topMonth).toEqual({ name: "Březen", sum: 6000 });
  });

  it("types sorted by sum desc with unknown type as —", () => {
    expect(r.types.map((t) => [t.name, t.sum, t.count, t.quantity])).toEqual([
      ["Letáky", 6000, 2, 600],
      ["Vizitky", 2000, 1, 200],
      ["—", 1000, 1, 0],
    ]);
    expect(r.maxType).toBe(6000);
  });

  it("empty year", () => {
    const e = buildYearReport({ items: [], types, closures: [], year: 2030, now: new Date(2026, 0, 1) });
    expect(e).toMatchObject({ total: 0, paidPct: 0, owedPct: 0, maxMonth: 1, activeMonths: 0, avgPerActiveMonth: 0, topMonth: null, maxType: 1, closedAt: null });
    expect(e.years).toEqual([2026]);
  });
});
