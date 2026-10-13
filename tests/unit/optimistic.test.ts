import { describe, expect, it } from "vitest";
import * as o from "@/lib/store/optimistic";
import { person, printItem, state, task, unit } from "./fixtures";

describe("optimistic transitions", () => {
  it("moves tasks between columns respecting beforeId", () => {
    const s = state({ tasks: [task({ id: "a", columnId: "c1", sortOrder: 1 }), task({ id: "b", columnId: "c2", sortOrder: 1 }), task({ id: "c", columnId: "c2", sortOrder: 2 })] });
    const m = o.moveTask(s, "a", "c2", "c");
    const order = m.tasks.filter((t) => t.columnId === "c2").sort((x, y) => x.sortOrder - y.sortOrder).map((t) => t.id);
    expect(order).toEqual(["b", "a", "c"]);
    const end = o.moveTask(s, "a", "c2", null);
    expect(end.tasks.find((t) => t.id === "a")?.sortOrder).toBe(3);
  });

  it("duplicate lands right after the original", () => {
    const s = state({ tasks: [task({ id: "a", sortOrder: 1, title: "X" }), task({ id: "b", sortOrder: 2 })] });
    const d = o.duplicateTask(s, "a", { id: "copy" });
    const order = [...d.tasks].sort((x, y) => x.sortOrder - y.sortOrder).map((t) => t.id);
    expect(order).toEqual(["a", "copy", "b"]);
    expect(d.tasks.find((t) => t.id === "copy")?.title).toBe("X (kopie)");
  });

  it("deleting a column moves its tasks to the end of the first remaining column", () => {
    const s = state({ tasks: [task({ id: "x", columnId: "c1", sortOrder: 1 }), task({ id: "y", columnId: "c2", sortOrder: 1 })] });
    const d = o.deleteColumn(s, "c1");
    expect(d.columns.some((c) => c.id === "c1")).toBe(false);
    expect(d.tasks.find((t) => t.id === "x")).toMatchObject({ columnId: "c2", sortOrder: 2 });
  });

  it("deleting a print type moves items to the first remaining type", () => {
    const s = state({ printItems: [printItem({ id: "i", typeId: "ty1" })] });
    const d = o.deletePrintType(s, "ty1");
    expect(d.printItems[0].typeId).toBe("ty2");
    expect(o.deletePrintType(o.deletePrintType(s, "ty1"), "ty2").printTypes).toHaveLength(1);
  });

  it("close / reopen year", () => {
    const s = state({ printItems: [printItem({ id: "i", realizationDate: "2026-05-01" }), printItem({ id: "j", realizationDate: "2025-05-01" })] });
    const c = o.closeYear(s, 2026, "t");
    expect(c.printItems.map((i) => i.archived)).toEqual([true, false]);
    expect(c.closures).toEqual([{ year: 2026, closedAt: "t" }]);
    const r = o.reopenYear(c, 2026);
    expect(r.printItems.every((i) => !i.archived)).toBe(true);
    expect(r.closures).toEqual([]);
  });

  it("deleting a person reparents children in place and clears task refs", () => {
    const s = state({
      nodes: [
        person({ id: "boss", sortOrder: 1 }),
        person({ id: "a", parentId: "boss", sortOrder: 1 }),
        person({ id: "m", parentId: "boss", sortOrder: 2 }),
        person({ id: "z", parentId: "boss", sortOrder: 3 }),
        person({ id: "k1", parentId: "m", sortOrder: 1 }),
        person({ id: "k2", parentId: "m", sortOrder: 2 }),
      ],
      tasks: [task({ id: "t", leadId: "m", ownerId: "m", createdBy: "m" })],
    });
    const d = o.deleteNode(s, "m");
    const kids = d.nodes.filter((n) => n.parentId === "boss").sort((x, y) => x.sortOrder - y.sortOrder).map((n) => n.id);
    expect(kids).toEqual(["a", "k1", "k2", "z"]);
    expect(d.tasks[0]).toMatchObject({ leadId: null, ownerId: null, createdBy: null });
  });

  it("moveNode refuses cycles and supports adoptChildren", () => {
    const s = state({
      nodes: [person({ id: "boss" }), person({ id: "a", parentId: "boss" }), person({ id: "b", parentId: "boss", sortOrder: 2 }), unit({ id: "u", sortOrder: 2 })],
    });
    expect(o.moveNode(s, { id: "boss", parentId: "a" })).toBe(s);
    const m = o.moveNode(s, { id: "u", parentId: "boss", adoptChildren: true });
    expect(m.nodes.find((n) => n.id === "u")?.parentId).toBe("boss");
    expect(m.nodes.filter((n) => n.parentId === "u").map((n) => n.id).sort()).toEqual(["a", "b"]);
    const sib = o.moveNode(s, { id: "u", parentId: "boss", beforeId: "a" });
    const order = sib.nodes.filter((n) => n.parentId === "boss").sort((x, y) => x.sortOrder - y.sortOrder).map((n) => n.id);
    expect(order).toEqual(["u", "a", "b"]);
  });

  it("duplicatePerson + budget + attachments", () => {
    const s = state({ nodes: [person({ id: "a", name: "Jana", sortOrder: 1 }), person({ id: "b", sortOrder: 2 })] });
    const d = o.duplicatePerson(s, "a", "a2");
    expect([...d.nodes].sort((x, y) => x.sortOrder - y.sortOrder).map((n) => n.id)).toEqual(["a", "a2", "b"]);
    expect(d.nodes.find((n) => n.id === "a2")?.name).toBe("Jana (kopie)");
    expect(o.setBudget(s, { spolek: 5 }).budget.spolek).toBe(5);
    const att = { id: "x", parentKind: "task" as const, parentId: "t", kind: "link" as const, name: "", url: "https://a", sizeBytes: null, mime: null, createdAt: "" };
    expect(o.removeAttachment({ ...s, attachments: [att] }, "x").attachments).toEqual([]);
  });
});
