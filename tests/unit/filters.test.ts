import { describe, expect, it } from "vitest";
import {
  columnsOf,
  defaultTaskCategory,
  groupCounts,
  inGroup,
  itemsInColumn,
  lastColumnId,
  printMonthOptions,
  printTotalLabel,
  printTypeOptions,
  printVisible,
  sumPrices,
  taskMonthOptions,
  taskVisible,
} from "@/lib/filters";
import { columns, printItem, task } from "./fixtures";

const now = new Date(2026, 9, 13);

describe("groups", () => {
  it("inGroup", () => {
    expect(inGroup("Muži A", "Muži")).toBe(true);
    expect(inGroup("Přípravka U9", "Mládež")).toBe(true);
    expect(inGroup("Celý klub", "Muži")).toBe(false);
    expect(inGroup("Celý klub", "Vše")).toBe(true);
    expect(inGroup("Merch", "Merch")).toBe(true);
    expect(inGroup("X", "Neexistuje")).toBe(false);
  });

  it("group counts ignore other filters and include Vše", () => {
    const tasks = [task({ category: "Muži A" }), task({ category: "Muži B" }), task({ category: "Celý klub" }), task({ category: "Školička" })];
    const counts = groupCounts(tasks);
    expect(counts[0]).toEqual({ group: "Vše", count: 4, label: "Vše (4)" });
    expect(counts.find((c) => c.group === "Muži")?.label).toBe("Muži (2)");
    expect(counts.find((c) => c.group === "Mládež")?.count).toBe(1);
    expect(counts.find((c) => c.group === "Foto")?.label).toBe("Foto (0)");
    expect(counts.map((c) => c.group)).toEqual(["Vše", "Muži", "Mládež", "Merch", "Aplikace", "Web", "Ticketing", "Eventy", "Foto"]);
  });

  it("default category for new task follows the group filter", () => {
    expect(defaultTaskCategory("Vše")).toBe("Celý klub");
    expect(defaultTaskCategory("Mládež")).toBe("Dorost U16");
    expect(defaultTaskCategory("Web")).toBe("Web");
  });
});

describe("taskVisible", () => {
  const base = { filter: "Vše", month: "all", mine: false, me: "me", q: "" };
  it("filters by group, month, mine, search", () => {
    const t = task({ category: "Muži A", dueDate: "2026-10-20", title: "Plakát", description: "A3 verze", leadId: "me" });
    expect(taskVisible(t, base)).toBe(true);
    expect(taskVisible(t, { ...base, filter: "Mládež" })).toBe(false);
    expect(taskVisible(t, { ...base, month: "2026-10" })).toBe(true);
    expect(taskVisible(t, { ...base, month: "2026-11" })).toBe(false);
    expect(taskVisible(t, { ...base, month: "none" })).toBe(false);
    expect(taskVisible(task({ dueDate: null }), { ...base, month: "none" })).toBe(true);
    expect(taskVisible(t, { ...base, mine: true })).toBe(true);
    expect(taskVisible(t, { ...base, mine: true, me: "other" })).toBe(false);
    // no identity (no members yet): nothing is „mine", not even unassigned tasks
    expect(taskVisible(task({ leadId: null, ownerId: null }), { ...base, mine: true, me: null })).toBe(false);
    expect(taskVisible(task({ leadId: null, ownerId: null }), { ...base, mine: false, me: null })).toBe(true);
    expect(taskVisible(t, { ...base, q: "a3" })).toBe(true);
    expect(taskVisible(t, { ...base, q: "muži a" })).toBe(true);
    expect(taskVisible(t, { ...base, q: "xyz" })).toBe(false);
  });
});

describe("month options", () => {
  it("tasks: -1..+11 months + due months, sorted, counts respect group only", () => {
    const tasks = [
      task({ category: "Muži A", dueDate: "2026-10-01" }),
      task({ category: "Muži B", dueDate: "2026-10-30" }),
      task({ category: "Web", dueDate: "2026-10-05" }),
      task({ category: "Muži A", dueDate: "2025-03-01" }),
    ];
    const opts = taskMonthOptions(tasks, "Muži", now);
    expect(opts[0]).toEqual({ value: "all", label: "Všechny měsíce" });
    expect(opts[opts.length - 1]).toEqual({ value: "none", label: "Bez termínu" });
    const months = opts.slice(1, -1).map((o) => o.value);
    expect(months[0]).toBe("2025-03");
    expect(months).toContain("2026-09");
    expect(months).toContain("2027-09");
    expect(months).not.toContain("2027-10");
    expect(months.length).toBe(14);
    expect(opts.find((o) => o.value === "2026-10")?.label).toBe("Říjen 2026 (2)");
    expect(opts.find((o) => o.value === "2026-11")?.label).toBe("Listopad 2026");
  });

  it("print: -2..+5 months, sums in label, archived excluded", () => {
    const items = [
      printItem({ typeId: "ty1", price: 4500, realizationDate: "2026-10-02" }),
      printItem({ typeId: "ty2", price: 1000, realizationDate: "2026-10-03" }),
      printItem({ typeId: "ty1", price: 9999, realizationDate: "2026-10-04", archived: true }),
      printItem({ typeId: "ty1", price: 100, realizationDate: "2024-01-01", archived: true }),
    ];
    const opts = printMonthOptions(items, "ty1", now);
    const months = opts.slice(1, -1).map((o) => o.value);
    expect(months).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
    expect(opts.find((o) => o.value === "2026-10")?.label).toBe("Říjen 2026 · 4\u00a0500\u00a0Kč");
    expect(printMonthOptions(items, "Vše", now).find((o) => o.value === "2026-10")?.label).toBe("Říjen 2026 · 5\u00a0500\u00a0Kč");
  });

  it("always offers the selected month, so the select label matches the filtering", () => {
    // a persisted month that dropped out of the generated range (no task due then / its items archived)
    const t = taskMonthOptions([], "Vše", now, "2025-01");
    expect(t.map((o) => o.value)).toContain("2025-01");
    expect(t.find((o) => o.value === "2025-01")?.label).toBe("Leden 2025");
    const p = printMonthOptions([printItem({ realizationDate: "2025-12-01", archived: true })], "Vše", now, "2025-12");
    expect(p.map((o) => o.value)).toContain("2025-12");
    // "all" / "none" are never duplicated
    expect(taskMonthOptions([], "Vše", now, "none").filter((o) => o.value === "none")).toHaveLength(1);
    expect(taskMonthOptions([], "Vše", now, "all").filter((o) => o.value === "all")).toHaveLength(1);
  });
});

describe("print board", () => {
  it("visibility excludes archived, filters by type id/month/search", () => {
    const i = printItem({ typeId: "ty1", title: "Letáky nábor", realizationDate: "2026-10-02" });
    const f = { typeId: "Vše", month: "all", q: "" };
    expect(printVisible(i, "Letáky", f)).toBe(true);
    expect(printVisible({ ...i, archived: true }, "Letáky", f)).toBe(false);
    expect(printVisible(i, "Letáky", { ...f, typeId: "ty2" })).toBe(false);
    expect(printVisible(i, "Letáky", { ...f, month: "2026-10" })).toBe(true);
    expect(printVisible(i, "Letáky", { ...f, q: "letáky" })).toBe(true);
    expect(printVisible(i, "Letáky", { ...f, q: "vizit" })).toBe(false);
  });

  it("type options count non-archived items", () => {
    const items = [printItem({ typeId: "ty1" }), printItem({ typeId: "ty1", archived: true }), printItem({ typeId: "ty2" })];
    const opts = printTypeOptions(items, [
      { id: "ty2", name: "Vizitky", sortOrder: 2 },
      { id: "ty1", name: "Letáky", sortOrder: 1 },
    ]);
    expect(opts.map((o) => o.label)).toEqual(["Všechny typy (2)", "Letáky (1)", "Vizitky (1)"]);
  });

  it("sums and total label", () => {
    expect(sumPrices([printItem({ price: 100 }), printItem({ price: null }), printItem({ price: 50 })])).toBe(150);
    expect(printTotalLabel("all")).toBe("Celkem");
    expect(printTotalLabel("none")).toBe("Celkem bez termínu");
    expect(printTotalLabel("2026-10")).toBe("Celkem za Říjen 2026");
  });
});

describe("columns", () => {
  it("columnsOf / lastColumnId / itemsInColumn", () => {
    expect(columnsOf(columns, "tasks").map((c) => c.id)).toEqual(["c1", "c2", "c5"]);
    expect(lastColumnId(columns, "tasks")).toBe("c5");
    expect(lastColumnId(columns, "print")).toBe("p3");
    expect(lastColumnId([], "print")).toBeNull();
    const ts = [task({ columnId: "c1", sortOrder: 3 }), task({ columnId: "c2", sortOrder: 1 }), task({ columnId: "c1", sortOrder: 1.5 })];
    expect(itemsInColumn(ts, "c1").map((t) => t.sortOrder)).toEqual([1.5, 3]);
  });
});
