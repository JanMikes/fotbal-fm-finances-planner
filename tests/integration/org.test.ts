import { describe, expect, it } from "vitest";
import * as nodesRoute from "@/app/api/org-nodes/route";
import * as nodeRoute from "@/app/api/org-nodes/[id]/route";
import * as dupRoute from "@/app/api/org-nodes/[id]/duplicate/route";
import * as moveRoute from "@/app/api/org/move/route";
import * as tasksRoute from "@/app/api/tasks/route";
import type { OrgNode, Task } from "@/lib/types";
import { call, getState, order, taskCols, withCleanDb } from "./helpers";

withCleanDb();

async function create(body: Record<string, unknown>) {
  const r = await call<OrgNode>(nodesRoute.POST, { method: "POST", body });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

describe("org nodes", () => {
  it("creates persons and units, appending in sibling order; unit ignores person fields", async () => {
    const boss = await create({ kind: "person", name: "  Petra Horáková ", role: "Vedoucí", budget: "25 000 Kč", budgetColor: "green", areas: ["Muži"] });
    expect(boss).toMatchObject({ name: "Petra Horáková", budget: 25000, budgetColor: "green", areas: ["Muži"], parentId: null });
    const a = await create({ kind: "person", name: "A", parentId: boss.id });
    const u = await create({ kind: "unit", name: "Mládež", color: "#C4C8CE", parentId: boss.id, role: "ignored", budget: 5 });
    expect(u).toMatchObject({ kind: "unit", color: "#c4c8ce", role: null, budget: null, budgetColor: "blue" });
    const s = await getState();
    expect(order(s.nodes.filter((n) => n.parentId === boss.id))).toEqual([a.id, u.id]);
  });

  it("validates input", async () => {
    expect((await call(nodesRoute.POST, { method: "POST", body: { kind: "person", name: "  " } })).status).toBe(400);
    expect((await call(nodesRoute.POST, { method: "POST", body: { kind: "robot", name: "x" } })).status).toBe(400);
    expect((await call(nodesRoute.POST, { method: "POST", body: { kind: "person", name: "x", parentId: crypto.randomUUID() } })).status).toBe(400);
    expect((await call(nodesRoute.POST, { method: "POST", body: { kind: "person", name: "x", avatarColor: "blue" } })).status).toBe(400);
  });

  it("updates fields and appends when the parent changes; rejects cycles", async () => {
    const boss = await create({ kind: "person", name: "Boss" });
    const a = await create({ kind: "person", name: "A", parentId: boss.id });
    const b = await create({ kind: "person", name: "B", parentId: a.id });
    const r = await call<OrgNode>(nodeRoute.PATCH, { method: "PATCH", params: { id: a.id }, body: { role: "Grafika", info: "", budget: null } });
    expect(r.body).toMatchObject({ role: "Grafika", info: null, budget: null });
    const cyc = await call(nodeRoute.PATCH, { method: "PATCH", params: { id: a.id }, body: { parentId: b.id } });
    expect(cyc.status).toBe(400);
    const self = await call(nodeRoute.PATCH, { method: "PATCH", params: { id: a.id }, body: { parentId: a.id } });
    expect(self.status).toBe(400);
    const moved = await call<OrgNode>(nodeRoute.PATCH, { method: "PATCH", params: { id: b.id }, body: { parentId: boss.id } });
    expect(moved.body.parentId).toBe(boss.id);
    const s = await getState();
    expect(order(s.nodes.filter((n) => n.parentId === boss.id))).toEqual([a.id, b.id]);
    expect((await call(nodeRoute.PATCH, { method: "PATCH", params: { id: crypto.randomUUID() }, body: { name: "x" } })).status).toBe(404);
  });

  it("moves with before/after, to top level, accepts snake_case, prevents cycles", async () => {
    const boss = await create({ kind: "person", name: "Boss" });
    const a = await create({ kind: "person", name: "A", parentId: boss.id });
    const b = await create({ kind: "person", name: "B", parentId: boss.id });
    const c = await create({ kind: "person", name: "C", parentId: a.id });

    await call(moveRoute.PATCH, { method: "PATCH", body: { id: b.id, parent_id: boss.id, before_id: a.id } });
    let s = await getState();
    expect(order(s.nodes.filter((n) => n.parentId === boss.id))).toEqual([b.id, a.id]);

    await call(moveRoute.PATCH, { method: "PATCH", body: { id: c.id, parentId: boss.id, afterId: b.id } });
    s = await getState();
    expect(order(s.nodes.filter((n) => n.parentId === boss.id))).toEqual([b.id, c.id, a.id]);

    const r = await call<OrgNode>(moveRoute.PATCH, { method: "PATCH", body: { id: a.id, parentId: null } });
    expect(r.status).toBe(200);
    s = await getState();
    expect(order(s.nodes.filter((n) => n.parentId === null))).toEqual([boss.id, a.id]);

    expect((await call(moveRoute.PATCH, { method: "PATCH", body: { id: boss.id, parentId: c.id } })).status).toBe(400);
    expect((await call(moveRoute.PATCH, { method: "PATCH", body: { id: boss.id, parentId: boss.id } })).status).toBe(400);
    expect((await call(moveRoute.PATCH, { method: "PATCH", body: { id: c.id, parentId: boss.id, beforeId: a.id } })).status).toBe(400);
  });

  it("moves a subtree together", async () => {
    const r1 = await create({ kind: "person", name: "R1" });
    const r2 = await create({ kind: "person", name: "R2" });
    const a = await create({ kind: "person", name: "A", parentId: r1.id });
    const a1 = await create({ kind: "person", name: "A1", parentId: a.id });
    await call(moveRoute.PATCH, { method: "PATCH", body: { id: a.id, parentId: r2.id } });
    const s = await getState();
    expect(s.nodes.find((n) => n.id === a.id)?.parentId).toBe(r2.id);
    expect(s.nodes.find((n) => n.id === a1.id)?.parentId).toBe(a.id);
  });

  it("inserts a category between a person and its person children (adoptChildren)", async () => {
    const boss = await create({ kind: "person", name: "Boss" });
    const p1 = await create({ kind: "person", name: "P1", parentId: boss.id });
    const p2 = await create({ kind: "person", name: "P2", parentId: boss.id });
    const subUnit = await create({ kind: "unit", name: "Sub", parentId: boss.id });
    const u = await create({ kind: "unit", name: "Web" });
    await call(moveRoute.PATCH, { method: "PATCH", body: { id: u.id, parentId: boss.id, adoptChildren: true } });
    const s = await getState();
    const parentOf = (id: string) => s.nodes.find((n) => n.id === id)?.parentId;
    expect(parentOf(u.id)).toBe(boss.id);
    expect(parentOf(p1.id)).toBe(u.id);
    expect(parentOf(p2.id)).toBe(u.id);
    expect(parentOf(subUnit.id)).toBe(boss.id);
  });

  it("deleting a person: children take its place under its parent, task refs are cleared", async () => {
    const boss = await create({ kind: "person", name: "Boss" });
    const a = await create({ kind: "person", name: "A", parentId: boss.id });
    const m = await create({ kind: "person", name: "M", parentId: boss.id });
    const z = await create({ kind: "person", name: "Z", parentId: boss.id });
    const k1 = await create({ kind: "person", name: "K1", parentId: m.id });
    const k2 = await create({ kind: "unit", name: "K2", parentId: m.id });
    const s0 = await getState();
    const t = await call<Task>(tasksRoute.POST, {
      method: "POST",
      body: { columnId: taskCols(s0)[0].id, category: "Web", title: "T", leadId: m.id, ownerId: m.id, createdBy: m.id },
    });
    expect(t.status).toBe(201);
    expect((await call(nodeRoute.DELETE, { method: "DELETE", params: { id: m.id } })).status).toBe(200);
    const s = await getState();
    expect(s.nodes.some((n) => n.id === m.id)).toBe(false);
    expect(order(s.nodes.filter((n) => n.parentId === boss.id))).toEqual([a.id, k1.id, k2.id, z.id]);
    expect(s.tasks[0]).toMatchObject({ leadId: null, ownerId: null, createdBy: null });
  });

  it("deleting a top-level unit moves its children to the top level", async () => {
    const u = await create({ kind: "unit", name: "U" });
    const p = await create({ kind: "person", name: "P", parentId: u.id });
    await call(nodeRoute.DELETE, { method: "DELETE", params: { id: u.id } });
    const s = await getState();
    expect(s.nodes.find((n) => n.id === p.id)?.parentId).toBeNull();
  });

  it("rejects tasks referencing a unit as a person", async () => {
    const u = await create({ kind: "unit", name: "U" });
    const s = await getState();
    const r = await call(tasksRoute.POST, { method: "POST", body: { columnId: taskCols(s)[0].id, category: "Web", title: "T", leadId: u.id } });
    expect(r.status).toBe(400);
  });

  it("duplicates a person right after the original (with a client id) and units recursively without people", async () => {
    const boss = await create({ kind: "person", name: "Boss" });
    const a = await create({ kind: "person", name: "Jana", parentId: boss.id, budget: 100, areas: ["Web"] });
    const b = await create({ kind: "person", name: "B", parentId: boss.id });
    const newId = crypto.randomUUID();
    const d = await call<{ nodes: OrgNode[] }>(dupRoute.POST, { method: "POST", params: { id: a.id }, body: { id: newId } });
    expect(d.status).toBe(201);
    expect(d.body.nodes[0]).toMatchObject({ id: newId, name: "Jana (kopie)", budget: 100, areas: ["Web"], parentId: boss.id });
    let s = await getState();
    expect(order(s.nodes.filter((n) => n.parentId === boss.id))).toEqual([a.id, newId, b.id]);

    const u = await create({ kind: "unit", name: "Mládež" });
    const sub = await create({ kind: "unit", name: "Dorost", parentId: u.id });
    await create({ kind: "unit", name: "U19", parentId: sub.id });
    await create({ kind: "person", name: "Trenér", parentId: sub.id });
    const du = await call<{ nodes: OrgNode[] }>(dupRoute.POST, { method: "POST", params: { id: u.id }, body: {} });
    expect(du.body.nodes.map((n) => n.name)).toEqual(["Mládež (kopie)", "Dorost", "U19"]);
    s = await getState();
    const top = du.body.nodes[0];
    expect(order(s.nodes.filter((n) => n.parentId === null))).toEqual([boss.id, u.id, top.id]);
    expect(s.nodes.filter((n) => n.kind === "person" && n.name === "Trenér")).toHaveLength(1);
  });
});
