import { describe, expect, it } from "vitest";
import * as typesRoute from "@/app/api/print-types/route";
import * as typeRoute from "@/app/api/print-types/[id]/route";
import * as itemsRoute from "@/app/api/print-items/route";
import * as itemRoute from "@/app/api/print-items/[id]/route";
import * as itemMove from "@/app/api/print-items/[id]/move/route";
import * as itemDup from "@/app/api/print-items/[id]/duplicate/route";
import * as closeRoute from "@/app/api/print/years/[year]/close/route";
import * as reportRoute from "@/app/api/print/years/[year]/report/route";
import * as budgetRoute from "@/app/api/budget/route";
import type { YearReport } from "@/lib/report";
import type { Budget, PrintItem, PrintType } from "@/lib/types";
import { call, getState, order, printCols, taskCols, withCleanDb } from "./helpers";

withCleanDb();

async function newItem(body: Record<string, unknown>) {
  const r = await call<PrintItem>(itemsRoute.POST, { method: "POST", body });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

describe("print types", () => {
  it("rename keeps items (FK), duplicate names conflict, delete moves items to the first remaining type, min 1", async () => {
    const s = await getState();
    const [letaky, vizitky] = s.printTypes;
    const col = printCols(s)[0].id;
    const item = await newItem({ columnId: col, typeId: vizitky.id, title: "V" });
    const ren = await call<PrintType>(typeRoute.PATCH, { method: "PATCH", params: { id: vizitky.id }, body: { name: "Navštívenky" } });
    expect(ren.body.name).toBe("Navštívenky");
    expect((await call(typeRoute.PATCH, { method: "PATCH", params: { id: vizitky.id }, body: { name: "Letáky" } })).status).toBe(409);
    expect((await call(typesRoute.POST, { method: "POST", body: { name: "Letáky" } })).status).toBe(409);
    const created = await call<PrintType>(typesRoute.POST, { method: "POST", body: { name: "Pozvánky" } });
    expect(created.status).toBe(201);
    let st = await getState();
    expect(st.printTypes.at(-1)?.name).toBe("Pozvánky");
    expect(st.printItems[0].typeId).toBe(vizitky.id);

    const del = await call(typeRoute.DELETE, { method: "DELETE", params: { id: vizitky.id } });
    expect(del.body).toMatchObject({ movedTo: letaky.id, movedCount: 1 });
    st = await getState();
    expect(st.printItems.find((i) => i.id === item.id)?.typeId).toBe(letaky.id);

    for (const t of st.printTypes.slice(1)) await call(typeRoute.DELETE, { method: "DELETE", params: { id: t.id } });
    const last = await call<{ message: string }>(typeRoute.DELETE, { method: "DELETE", params: { id: letaky.id } });
    expect(last.status).toBe(400);
    expect(last.body.message).toBe("Musí zůstat alespoň jeden typ.");
  });
});

describe("print items", () => {
  it("CRUD, money parsing, board validation, move and duplicate", async () => {
    const s = await getState();
    const [p1, p2] = printCols(s);
    const type = s.printTypes[0].id;
    const a = await newItem({ columnId: p1.id, typeId: type, title: "Letáky nábor", price: "4 500 Kč", quantity: "500", realizationDate: "2026-03-10" });
    expect(a).toMatchObject({ price: 4500, quantity: 500, paidByClub: false, archived: false });
    expect((await call(itemsRoute.POST, { method: "POST", body: { columnId: taskCols(s)[0].id, typeId: type, title: "x" } })).status).toBe(400);
    expect((await call(itemsRoute.POST, { method: "POST", body: { columnId: p1.id, typeId: crypto.randomUUID(), title: "x" } })).status).toBe(400);
    const b = await newItem({ columnId: p2.id, typeId: type, title: "B" });
    const upd = await call<PrintItem>(itemRoute.PATCH, { method: "PATCH", params: { id: a.id }, body: { paidByClub: true, price: "", quantity: null } });
    expect(upd.body).toMatchObject({ paidByClub: true, price: null, quantity: null });
    await call(itemMove.PATCH, { method: "PATCH", params: { id: a.id }, body: { columnId: p2.id, beforeId: b.id } });
    let st = await getState();
    expect(order(st.printItems.filter((i) => i.columnId === p2.id))).toEqual([a.id, b.id]);
    const d = await call<{ printItem: PrintItem }>(itemDup.POST, { method: "POST", params: { id: a.id }, body: {} });
    expect(d.body.printItem.title).toBe("Letáky nábor (kopie)");
    st = await getState();
    expect(order(st.printItems.filter((i) => i.columnId === p2.id))).toEqual([a.id, d.body.printItem.id, b.id]);
    await call(itemRoute.DELETE, { method: "DELETE", params: { id: b.id } });
    expect((await getState()).printItems).toHaveLength(2);
  });

  it("closes and reopens a year; report aggregates archived items too", async () => {
    const s = await getState();
    const col = printCols(s)[0].id;
    const [t1, t2] = s.printTypes;
    await newItem({ columnId: col, typeId: t1.id, title: "A", price: 4500, quantity: 500, paidByClub: true, realizationDate: "2026-03-10" });
    await newItem({ columnId: col, typeId: t2.id, title: "B", price: 1500, quantity: 100, realizationDate: "2026-07-01" });
    await newItem({ columnId: col, typeId: t1.id, title: "C", price: 999, realizationDate: "2025-12-31" });
    await newItem({ columnId: col, typeId: t1.id, title: "D", price: 5 });

    const close = await call<{ archivedCount: number; closure: { year: number; closedAt: string } }>(closeRoute.POST, {
      method: "POST",
      params: { year: "2026" },
    });
    expect(close.status).toBe(200);
    expect(close.body.archivedCount).toBe(2);
    expect(close.body.closure.year).toBe(2026);
    let st = await getState();
    expect(st.printItems.filter((i) => i.archived).map((i) => i.title).sort()).toEqual(["A", "B"]);
    expect(st.closures.map((c) => c.year)).toEqual([2026]);

    const rep = await call<YearReport>(reportRoute.GET, { params: { year: "2026" } });
    expect(rep.body).toMatchObject({ year: 2026, itemCount: 2, total: 6000, paid: 4500, owed: 1500, quantity: 600, paidPct: 75, owedPct: 25, noDateCount: 1 });
    expect(rep.body.closedAt).not.toBeNull();
    expect(rep.body.months[2].sum).toBe(4500);
    expect(rep.body.types.map((t) => t.name)).toEqual([t1.name, t2.name]);
    expect(rep.body.years.slice(0, 2)).toContain(2025);

    const reopen = await call<{ unarchivedCount: number }>(closeRoute.DELETE, { method: "DELETE", params: { year: "2026" } });
    expect(reopen.body.unarchivedCount).toBe(2);
    st = await getState();
    expect(st.printItems.every((i) => !i.archived)).toBe(true);
    expect(st.closures).toEqual([]);
    expect((await call(reportRoute.GET, { params: { year: "abc" } })).status).toBe(404);
  });
});

describe("budget", () => {
  it("partial updates with digit parsing; installment start auto-set and correctable", async () => {
    const r = await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { spolek: "100 000", asAmount: 20000 } });
    expect(r.body).toMatchObject({ spolek: 100000, asAmount: 20000, monthlyInstallment: 7500 });
    const set = await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { installmentFrom: "2026-03" } });
    expect(set.body.installmentFrom).toBe("2026-03-01");
    const cleared = await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { installmentFrom: null } });
    expect(cleared.body.installmentFrom).toBeNull();
    const auto = await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { monthlyInstallment: "8 000" } });
    expect(auto.body.monthlyInstallment).toBe(8000);
    expect(auto.body.installmentFrom).toMatch(/^\d{4}-\d{2}-01$/);
    expect((await call(budgetRoute.PUT, { method: "PUT", body: { installmentFrom: "březen" } })).status).toBe(400);
    expect((await call(budgetRoute.PUT, { method: "PUT", body: { other: 1 } })).status).toBe(400);
    expect((await call<Budget>(budgetRoute.GET)).body.spolek).toBe(100000);
  });
});
