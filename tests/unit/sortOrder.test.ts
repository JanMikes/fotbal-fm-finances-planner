import { describe, expect, it } from "vitest";
import { appendOrder, between, MIN_GAP, planInsert } from "@/lib/sortOrder";

const sibs = [
  { id: "a", sortOrder: 1 },
  { id: "b", sortOrder: 2 },
  { id: "c", sortOrder: 3 },
];

describe("sortOrder", () => {
  it("between", () => {
    expect(between(null, null)).toBe(1);
    expect(between(null, 5)).toBe(4);
    expect(between(5, null)).toBe(6);
    expect(between(1, 2)).toBe(1.5);
  });

  it("planInsert before / after / append / unknown", () => {
    expect(planInsert(sibs, "x", { beforeId: "b" })).toEqual({ sortOrder: 1.5, updates: [{ id: "x", sortOrder: 1.5 }], renumbered: false });
    expect(planInsert(sibs, "x", { beforeId: "a" }).sortOrder).toBe(0);
    expect(planInsert(sibs, "x", { afterId: "c" }).sortOrder).toBe(4);
    expect(planInsert(sibs, "x", { afterId: "a" }).sortOrder).toBe(1.5);
    expect(planInsert(sibs, "x").sortOrder).toBe(4);
    expect(planInsert(sibs, "x", { beforeId: "nope" }).sortOrder).toBe(4);
    expect(planInsert([], "x").sortOrder).toBe(1);
  });

  it("moving an item within its own group ignores itself", () => {
    expect(planInsert(sibs, "c", { beforeId: "a" }).sortOrder).toBe(0);
    expect(planInsert(sibs, "a", {}).sortOrder).toBe(4);
  });

  it("renumbers when the gap gets too small", () => {
    const tight = [
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 1 + MIN_GAP / 2 },
      { id: "c", sortOrder: 2 },
    ];
    const plan = planInsert(tight, "x", { beforeId: "b" });
    expect(plan.renumbered).toBe(true);
    expect(plan.updates).toEqual([
      { id: "a", sortOrder: 1 },
      { id: "x", sortOrder: 2 },
      { id: "b", sortOrder: 3 },
      { id: "c", sortOrder: 4 },
    ]);
    expect(plan.sortOrder).toBe(2);
  });

  it("repeated midpoint inserts eventually renumber", () => {
    let list = [
      { id: "a", sortOrder: 1 },
      { id: "z", sortOrder: 2 },
    ];
    let renumbered = false;
    for (let i = 0; i < 60; i++) {
      const id = `n${i}`;
      const plan = planInsert(list, id, { beforeId: "z" });
      const upd = new Map(plan.updates.map((u) => [u.id, u.sortOrder]));
      list = [...list.map((s) => ({ ...s, sortOrder: upd.get(s.id) ?? s.sortOrder })), { id, sortOrder: plan.sortOrder }];
      renumbered ||= plan.renumbered;
    }
    expect(renumbered).toBe(true);
    const sorted = [...list].sort((x, y) => x.sortOrder - y.sortOrder).map((s) => s.id);
    expect(sorted[0]).toBe("a");
    expect(sorted[sorted.length - 1]).toBe("z");
    expect(new Set(list.map((s) => s.sortOrder)).size).toBe(list.length);
  });

  it("appendOrder", () => {
    expect(appendOrder([])).toBe(1);
    expect(appendOrder(sibs)).toBe(4);
  });
});
