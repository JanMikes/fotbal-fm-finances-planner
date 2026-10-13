import { describe, expect, it } from "vitest";
import * as columnsRoute from "@/app/api/columns/route";
import * as columnRoute from "@/app/api/columns/[id]/route";
import * as tasksRoute from "@/app/api/tasks/route";
import * as taskRoute from "@/app/api/tasks/[id]/route";
import * as taskMove from "@/app/api/tasks/[id]/move/route";
import * as taskDup from "@/app/api/tasks/[id]/duplicate/route";
import * as attRoute from "@/app/api/attachments/route";
import type { Attachment, BoardColumn, Task } from "@/lib/types";
import { call, getState, order, printCols, taskCols, withCleanDb } from "./helpers";

withCleanDb();

async function newTask(columnId: string, title: string, extra: Record<string, unknown> = {}) {
  const r = await call<Task>(tasksRoute.POST, { method: "POST", body: { columnId, category: "Muži A", title, ...extra } });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

describe("state", () => {
  it("returns the structural defaults on an empty database", async () => {
    const s = await getState();
    expect(taskCols(s).map((c) => c.title)).toEqual(["Nápady", "K řešení", "Probíhá", "Ke kontrole", "Hotovo"]);
    expect(printCols(s).map((c) => c.title)).toEqual(["Poptávka", "Ve výrobě", "Hotovo"]);
    expect(s.printTypes.map((t) => t.name)).toEqual(["Letáky", "Vizitky", "Plakáty", "Bannery", "Roll-upy", "Samolepky", "Brožury"]);
    expect(s.budget).toMatchObject({ spolek: 0, asAmount: 0, monthlyInstallment: 7500 });
    expect(s.budget.installmentFrom).toMatch(/^\d{4}-\d{2}-01$/);
    expect(s.nodes).toEqual([]);
    expect(s.tasks).toEqual([]);
  });
});

describe("columns", () => {
  it("creates, renames and validates task columns; print columns are immutable", async () => {
    const s = await getState();
    const r = await call<BoardColumn>(columnsRoute.POST, { method: "POST", body: { boardId: "tasks", title: " Archiv " } });
    expect(r.status).toBe(201);
    expect(r.body.title).toBe("Archiv");
    expect(order((await getState()).columns.filter((c) => c.boardId === "tasks")).at(-1)).toBe(r.body.id);
    expect((await call(columnsRoute.POST, { method: "POST", body: { boardId: "tasks", title: "   " } })).status).toBe(400);
    expect((await call(columnsRoute.POST, { method: "POST", body: { boardId: "print", title: "X" } })).status).toBe(400);
    const pc = printCols(s)[0];
    expect((await call(columnRoute.PATCH, { method: "PATCH", params: { id: pc.id }, body: { title: "X" } })).status).toBe(400);
    expect((await call(columnRoute.DELETE, { method: "DELETE", params: { id: pc.id } })).status).toBe(400);
    const ren = await call<BoardColumn>(columnRoute.PATCH, { method: "PATCH", params: { id: r.body.id }, body: { title: "Hotové" } });
    expect(ren.body.title).toBe("Hotové");
    const list = await call<BoardColumn[]>(columnsRoute.GET, { path: "/api/columns?board=print" });
    expect(list.body.map((c) => c.title)).toEqual(["Poptávka", "Ve výrobě", "Hotovo"]);
  });

  it("deleting a column moves its tasks to the end of the first column; at least one must remain", async () => {
    const s = await getState();
    const [c1, c2, ...rest] = taskCols(s);
    const x = await newTask(c1.id, "x");
    const a = await newTask(c2.id, "a");
    const b = await newTask(c2.id, "b");
    // delete the FIRST column → tasks go to the new first column (c2)
    const del = await call(columnRoute.DELETE, { method: "DELETE", params: { id: c1.id } });
    expect(del.body).toMatchObject({ ok: true, movedTo: c2.id, movedCount: 1 });
    let st = await getState();
    expect(order(st.tasks.filter((t) => t.columnId === c2.id))).toEqual([a.id, b.id, x.id]);
    for (const c of rest) await call(columnRoute.DELETE, { method: "DELETE", params: { id: c.id } });
    const last = await call<{ message: string }>(columnRoute.DELETE, { method: "DELETE", params: { id: c2.id } });
    expect(last.status).toBe(400);
    expect(last.body.message).toBe("Musí zůstat alespoň jeden sloupec.");
    st = await getState();
    expect(taskCols(st)).toHaveLength(1);
  });
});

describe("tasks", () => {
  it("creates (append), validates, updates and appends on column change", async () => {
    const s = await getState();
    const [c1, c2] = taskCols(s);
    const a = await newTask(c1.id, " A ", { description: "  popis ", dueDate: "2026-10-20" });
    expect(a).toMatchObject({ title: "A", description: "popis", dueDate: "2026-10-20", leadId: null });
    const b = await newTask(c1.id, "B");
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
    expect((await call(tasksRoute.POST, { method: "POST", body: { columnId: c1.id, category: "Web", title: "" } })).status).toBe(400);
    expect((await call(tasksRoute.POST, { method: "POST", body: { columnId: c1.id, category: "Web", title: "x", dueDate: "13.10.2026" } })).status).toBe(400);
    expect((await call(tasksRoute.POST, { method: "POST", body: { columnId: printCols(s)[0].id, category: "Web", title: "x" } })).status).toBe(400);
    await newTask(c2.id, "C");
    const u = await call<Task>(taskRoute.PATCH, { method: "PATCH", params: { id: a.id }, body: { columnId: c2.id, dueDate: null, title: "A2" } });
    expect(u.body).toMatchObject({ columnId: c2.id, dueDate: null, title: "A2" });
    const st = await getState();
    expect(order(st.tasks.filter((t) => t.columnId === c2.id)).at(-1)).toBe(a.id);
    expect((await call(taskRoute.PATCH, { method: "PATCH", params: { id: a.id }, body: { bogus: 1 } })).status).toBe(400);
    expect((await call(taskRoute.PATCH, { method: "PATCH", params: { id: "not-a-uuid" }, body: {} })).status).toBe(404);
  });

  it("moves before a card or to the end, across columns", async () => {
    const s = await getState();
    const [c1, c2] = taskCols(s);
    const a = await newTask(c1.id, "a");
    const b = await newTask(c2.id, "b");
    const c = await newTask(c2.id, "c");
    await call(taskMove.PATCH, { method: "PATCH", params: { id: a.id }, body: { columnId: c2.id, beforeId: c.id } });
    let st = await getState();
    expect(order(st.tasks.filter((t) => t.columnId === c2.id))).toEqual([b.id, a.id, c.id]);
    await call(taskMove.PATCH, { method: "PATCH", params: { id: b.id }, body: { column_id: c2.id, before_id: null } });
    st = await getState();
    expect(order(st.tasks.filter((t) => t.columnId === c2.id))).toEqual([a.id, c.id, b.id]);
    await call(taskMove.PATCH, { method: "PATCH", params: { id: b.id }, body: { columnId: c2.id, beforeId: a.id } });
    st = await getState();
    expect(order(st.tasks.filter((t) => t.columnId === c2.id))).toEqual([b.id, a.id, c.id]);
    const bad = await call(taskMove.PATCH, { method: "PATCH", params: { id: a.id }, body: { columnId: c1.id, beforeId: c.id } });
    expect(bad.status).toBe(400);
  });

  it("many midpoint moves keep a consistent order (renumbering)", async () => {
    const s = await getState();
    const [c1] = taskCols(s);
    const first = await newTask(c1.id, "first");
    const last = await newTask(c1.id, "last");
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const t = await newTask(c1.id, `n${i}`);
      await call(taskMove.PATCH, { method: "PATCH", params: { id: t.id }, body: { columnId: c1.id, beforeId: last.id } });
      ids.push(t.id);
    }
    const st = await getState();
    expect(order(st.tasks.filter((t) => t.columnId === c1.id))).toEqual([first.id, ...ids, last.id]);
  });

  it("duplicates right after the original with attachments, then deletes cleanly", async () => {
    const s = await getState();
    const [c1] = taskCols(s);
    const a = await newTask(c1.id, "Plakát");
    const b = await newTask(c1.id, "Další");
    const fd = new FormData();
    fd.set("parentKind", "task");
    fd.set("parentId", a.id);
    fd.set("file", new File([new Uint8Array([1, 2, 3])], "plakat.pdf", { type: "application/pdf" }));
    expect((await call(attRoute.POST, { method: "POST", body: fd })).status).toBe(201);
    await call(attRoute.POST, { method: "POST", body: { kind: "link", parentKind: "task", parentId: a.id, url: "fotbalfm.cz", name: "Web" } });
    const d = await call<{ task: Task; attachments: Attachment[] }>(taskDup.POST, { method: "POST", params: { id: a.id }, body: {} });
    expect(d.status).toBe(201);
    expect(d.body.task.title).toBe("Plakát (kopie)");
    expect(d.body.attachments.map((x) => x.kind).sort()).toEqual(["file", "link"]);
    let st = await getState();
    expect(order(st.tasks.filter((t) => t.columnId === c1.id))).toEqual([a.id, d.body.task.id, b.id]);
    expect(st.attachments).toHaveLength(4);
    await call(taskRoute.DELETE, { method: "DELETE", params: { id: a.id } });
    st = await getState();
    expect(st.tasks.map((t) => t.id).sort()).toEqual([d.body.task.id, b.id].sort());
    expect(st.attachments.every((x) => x.parentId === d.body.task.id)).toBe(true);
    expect((await call(taskRoute.DELETE, { method: "DELETE", params: { id: a.id } })).status).toBe(404);
  });
});
