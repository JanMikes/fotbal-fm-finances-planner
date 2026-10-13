/**
 * Concurrency (sort-order races) + partial PATCH semantics + date ranges + budget defaults.
 * The race tests fire parallel requests through the route handlers (each in its own pooled connection) and
 * assert that sort orders within every container stay unique.
 */
import { describe, expect, it } from "vitest";
import * as columnsRoute from "@/app/api/columns/route";
import * as columnRoute from "@/app/api/columns/[id]/route";
import * as tasksRoute from "@/app/api/tasks/route";
import * as taskRoute from "@/app/api/tasks/[id]/route";
import * as taskMove from "@/app/api/tasks/[id]/move/route";
import * as taskDup from "@/app/api/tasks/[id]/duplicate/route";
import * as typesRoute from "@/app/api/print-types/route";
import * as typeRoute from "@/app/api/print-types/[id]/route";
import * as itemsRoute from "@/app/api/print-items/route";
import * as itemRoute from "@/app/api/print-items/[id]/route";
import * as itemMove from "@/app/api/print-items/[id]/move/route";
import * as itemDup from "@/app/api/print-items/[id]/duplicate/route";
import * as nodesRoute from "@/app/api/org-nodes/route";
import * as nodeRoute from "@/app/api/org-nodes/[id]/route";
import * as closeRoute from "@/app/api/print/years/[year]/close/route";
import * as budgetRoute from "@/app/api/budget/route";
import type { AppState, BoardColumn, Budget, OrgNode, PrintItem, PrintType, Task } from "@/lib/types";
import { currentMonthStart } from "@/server/time";
import { adminPool, call, getState, printCols, taskCols, withCleanDb } from "./helpers";

withCleanDb();

const ROUNDS = 8;

function dupes<T extends { sortOrder: number }>(items: T[]): number {
  const so = items.map((i) => i.sortOrder);
  return so.length - new Set(so).size;
}

function assertUniqueSortOrders(s: AppState) {
  expect(dupes(s.columns.filter((c) => c.boardId === "tasks")), "task columns").toBe(0);
  for (const c of s.columns) {
    expect(dupes(s.tasks.filter((t) => t.columnId === c.id)), `tasks in ${c.title}`).toBe(0);
    expect(dupes(s.printItems.filter((t) => t.columnId === c.id)), `print items in ${c.title}`).toBe(0);
  }
  expect(dupes(s.printTypes), "print types").toBe(0);
  const parents = new Set(s.nodes.map((n) => n.parentId));
  for (const p of parents) expect(dupes(s.nodes.filter((n) => n.parentId === p)), `org siblings of ${p}`).toBe(0);
}

async function newTask(columnId: string, title: string): Promise<Task> {
  const r = await call<Task>(tasksRoute.POST, { method: "POST", body: { columnId, category: "Web", title } });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

async function newItem(body: Record<string, unknown>): Promise<PrintItem> {
  const r = await call<PrintItem>(itemsRoute.POST, { method: "POST", body });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

describe("sort-order races (parallel requests)", () => {
  it("parallel column creates get distinct sort orders", async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const rs = await Promise.all(
        ["A", "B", "C"].map((x) => call<BoardColumn>(columnsRoute.POST, { method: "POST", body: { boardId: "tasks", title: `${x}${i}` } })),
      );
      for (const r of rs) expect(r.status).toBe(201);
    }
    assertUniqueSortOrders(await getState());
  });

  it("parallel print type creates get distinct sort orders", async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const rs = await Promise.all(["A", "B", "C"].map((x) => call<PrintType>(typesRoute.POST, { method: "POST", body: { name: `T${x}${i}` } })));
      for (const r of rs) expect(r.status).toBe(201);
    }
    assertUniqueSortOrders(await getState());
  });

  it("column delete (tasks → first column) racing a move into the first column", async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const s0 = await getState();
      const cols = taskCols(s0);
      const x = (await call<BoardColumn>(columnsRoute.POST, { method: "POST", body: { boardId: "tasks", title: `X${i}` } })).body;
      await newTask(x.id, `in X ${i}`);
      await newTask(x.id, `in X2 ${i}`);
      const mover = await newTask(cols[1].id, `mover ${i}`);
      const [del, mv] = await Promise.all([
        call(columnRoute.DELETE, { method: "DELETE", params: { id: x.id } }),
        call(taskMove.PATCH, { method: "PATCH", params: { id: mover.id }, body: { columnId: cols[0].id, beforeId: null } }),
      ]);
      expect(del.status).toBe(200);
      expect(mv.status).toBe(200);
      assertUniqueSortOrders(await getState());
    }
  });

  it("parallel task creates, moves and duplicates in one column", async () => {
    const s = await getState();
    const [a, b] = taskCols(s);
    const seeds = await Promise.all([1, 2, 3].map((n) => newTask(b.id, `seed ${n}`)));
    for (let i = 0; i < ROUNDS; i++) {
      const rs = await Promise.all([
        call(tasksRoute.POST, { method: "POST", body: { columnId: a.id, category: "Web", title: `c1 ${i}` } }),
        call(tasksRoute.POST, { method: "POST", body: { columnId: a.id, category: "Web", title: `c2 ${i}` } }),
        call(taskMove.PATCH, { method: "PATCH", params: { id: seeds[i % 3].id }, body: { columnId: a.id } }),
        call(taskDup.POST, { method: "POST", params: { id: seeds[(i + 1) % 3].id }, body: {} }),
        call(taskRoute.PATCH, { method: "PATCH", params: { id: seeds[(i + 2) % 3].id }, body: { columnId: i % 2 ? a.id : b.id } }),
      ]);
      for (const r of rs) expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    }
    assertUniqueSortOrders(await getState());
  });

  it("parallel print item creates / moves / duplicates", async () => {
    const s = await getState();
    const [p0, p1] = printCols(s);
    const typeId = s.printTypes[0].id;
    const seeds = await Promise.all([1, 2].map((n) => newItem({ columnId: p1.id, typeId, title: `seed ${n}` })));
    for (let i = 0; i < ROUNDS; i++) {
      const rs = await Promise.all([
        call(itemsRoute.POST, { method: "POST", body: { columnId: p0.id, typeId, title: `n1 ${i}` } }),
        call(itemsRoute.POST, { method: "POST", body: { columnId: p0.id, typeId, title: `n2 ${i}` } }),
        call(itemMove.PATCH, { method: "PATCH", params: { id: seeds[i % 2].id }, body: { columnId: p0.id } }),
        call(itemDup.POST, { method: "POST", params: { id: seeds[(i + 1) % 2].id }, body: {} }),
      ]);
      for (const r of rs) expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    }
    assertUniqueSortOrders(await getState());
  });

  it("parallel org node creates under the same parent", async () => {
    const root = (await call<OrgNode>(nodesRoute.POST, { method: "POST", body: { kind: "unit", name: "Root" } })).body;
    for (let i = 0; i < ROUNDS; i++) {
      const rs = await Promise.all(
        [1, 2, 3].map((n) => call(nodesRoute.POST, { method: "POST", body: { kind: "person", name: `P${i}-${n}`, parentId: root.id } })),
      );
      for (const r of rs) expect(r.status).toBe(201);
    }
    assertUniqueSortOrders(await getState());
  });
});

describe("PATCH = partial update (only provided fields change)", () => {
  it("tasks", async () => {
    const s = await getState();
    const t = (
      await call<Task>(tasksRoute.POST, {
        method: "POST",
        body: { columnId: taskCols(s)[0].id, category: "Web", title: "Orig", description: "Popis A", dueDate: "2026-11-01" },
      })
    ).body;
    const r = await call<Task>(taskRoute.PATCH, { method: "PATCH", params: { id: t.id }, body: { category: "Eventy" } });
    expect(r.body).toMatchObject({ title: "Orig", description: "Popis A", dueDate: "2026-11-01", category: "Eventy", columnId: t.columnId, sortOrder: t.sortOrder });
    const empty = await call<Task>(taskRoute.PATCH, { method: "PATCH", params: { id: t.id }, body: {} });
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ title: "Orig", description: "Popis A", category: "Eventy" });
    const cleared = await call<Task>(taskRoute.PATCH, { method: "PATCH", params: { id: t.id }, body: { dueDate: null } });
    expect(cleared.body).toMatchObject({ dueDate: null, title: "Orig", description: "Popis A" });
  });

  it("print items", async () => {
    const s = await getState();
    const i = await newItem({ columnId: printCols(s)[0].id, typeId: s.printTypes[0].id, title: "Leták", price: 1200, quantity: 500, paidByClub: true, description: "d" });
    const r = await call<PrintItem>(itemRoute.PATCH, { method: "PATCH", params: { id: i.id }, body: { title: "Leták 2" } });
    expect(r.body).toMatchObject({ title: "Leták 2", price: 1200, quantity: 500, paidByClub: true, description: "d", typeId: i.typeId, columnId: i.columnId });
  });

  it("org nodes", async () => {
    const p = (
      await call<OrgNode>(nodesRoute.POST, {
        method: "POST",
        body: { kind: "person", name: "Jana", role: "Grafik", info: "i", budget: 5000, budgetColor: "green", areas: ["Web"] },
      })
    ).body;
    const r = await call<OrgNode>(nodeRoute.PATCH, { method: "PATCH", params: { id: p.id }, body: { role: "Kameraman" } });
    expect(r.body).toMatchObject({ name: "Jana", role: "Kameraman", info: "i", budget: 5000, budgetColor: "green", areas: ["Web"], parentId: null, sortOrder: p.sortOrder });
  });

  it("budget", async () => {
    await call(budgetRoute.PUT, { method: "PUT", body: { spolek: 1000, asAmount: 2000 } });
    const r = await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { asAmount: 3000 } });
    expect(r.body).toMatchObject({ spolek: 1000, asAmount: 3000, monthlyInstallment: 7500, installmentFrom: null });
  });
});

describe("budget installment default", () => {
  it("fresh install deducts nothing; the month is set when a non-zero installment is saved", async () => {
    const b0 = (await call<Budget>(budgetRoute.GET)).body;
    expect(b0).toMatchObject({ spolek: 0, asAmount: 0, monthlyInstallment: 7500, installmentFrom: null });
    // saving other fields never starts the deduction
    expect((await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { spolek: 50000 } })).body.installmentFrom).toBeNull();
    // saving 0 does not either
    expect((await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { monthlyInstallment: 0 } })).body.installmentFrom).toBeNull();
    const set = await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { monthlyInstallment: "7 500" } });
    expect(set.body).toMatchObject({ monthlyInstallment: 7500, installmentFrom: currentMonthStart() });
    // an explicit month is preserved on later installment saves
    await call(budgetRoute.PUT, { method: "PUT", body: { installmentFrom: "2026-03" } });
    expect((await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { monthlyInstallment: 9000 } })).body.installmentFrom).toBe("2026-03-01");
    // explicit value in the same request wins
    await call(budgetRoute.PUT, { method: "PUT", body: { installmentFrom: null } });
    expect((await call<Budget>(budgetRoute.PUT, { method: "PUT", body: { monthlyInstallment: 8000, installmentFrom: "2025-01" } })).body.installmentFrom).toBe("2025-01-01");
    expect((await call(budgetRoute.PUT, { method: "PUT", body: { installmentFrom: "1999-12" } })).status).toBe(400);
  });

  it("the 0002 migration clears the seeded month only on an untouched budget", async () => {
    const pool = adminPool();
    await pool.query("update budget set installment_from = '2026-10-01' where id = 1");
    const sql = (await import("node:fs")).readFileSync(new URL("../../drizzle/0002_budget_installment_from_null.sql", import.meta.url), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) await pool.query(stmt);
    expect((await call<Budget>(budgetRoute.GET)).body.installmentFrom).toBeNull();
    await pool.query("update budget set installment_from = '2026-10-01', spolek = 10 where id = 1");
    for (const stmt of sql.split("--> statement-breakpoint")) await pool.query(stmt);
    expect((await call<Budget>(budgetRoute.GET)).body.installmentFrom).toBe("2026-10-01");
  });
});

describe("date range validation", () => {
  it("rejects years outside 2000–2100 with a Czech message", async () => {
    const s = await getState();
    const col = taskCols(s)[0].id;
    for (const dueDate of ["0026-10-13", "1999-12-31", "2101-01-01"]) {
      const r = await call<{ error: string; message: string }>(tasksRoute.POST, { method: "POST", body: { columnId: col, category: "Web", title: "x", dueDate } });
      expect(r.status, dueDate).toBe(400);
      expect(r.body.message).toBe("Datum musí být mezi roky 2000 a 2100.");
    }
    expect((await call(tasksRoute.POST, { method: "POST", body: { columnId: col, category: "Web", title: "x", dueDate: "2100-12-31" } })).status).toBe(201);
    const pc = printCols(s)[0].id;
    expect(
      (await call(itemsRoute.POST, { method: "POST", body: { columnId: pc, typeId: s.printTypes[0].id, title: "x", realizationDate: "0026-01-01" } })).status,
    ).toBe(400);
    expect((await call(closeRoute.POST, { method: "POST", params: { year: "1999" } })).status).toBe(404);
  });
});

describe("JSON bodies", () => {
  it("non-JSON content types are refused (415); empty bodies are fine", async () => {
    const s = await getState();
    const res = await tasksRoute.POST(
      new Request("http://127.0.0.1:3000/api/tasks", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ columnId: taskCols(s)[0].id, category: "Web", title: "csrf" }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(415);
    expect((await res.json()).message).toMatch(/JSON/);
    // POST …/close without any body (as the client sends it)
    const close = await closeRoute.POST(new Request("http://127.0.0.1:3000/api/print/years/2026/close", { method: "POST" }), {
      params: Promise.resolve({ year: "2026" }),
    });
    expect(close.status).toBe(200);
    // type rename still works with a charset parameter
    const t = s.printTypes[0];
    const renamed = await typeRoute.PATCH(
      new Request(`http://127.0.0.1:3000/api/print-types/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ name: "Letáky A5" }),
      }),
      { params: Promise.resolve({ id: t.id }) },
    );
    expect(renamed.status).toBe(200);
  });
});
