/** Columns, tasks and print items (shared board mechanics). */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { appendOrder, between, type Sortable } from "@/lib/sortOrder";
import type { BoardColumn, BoardId, PrintItem, Task } from "@/lib/types";
import { getDb, type DbOrTx, type Tx } from "../db/client";
import { boardColumns, orgNodes, printItems, printTypes, tasks } from "../db/schema";
import { badRequest, notFound, zId, zIsoDate, zMoney, zRequiredText, zTrimmed, type Ctx } from "../http";
import { notify } from "../notify";
import { copyAttachments, deleteAttachmentsOf, withFileRollback } from "./attachments";
import { mapColumn, mapPrintItem, mapTask } from "./mappers";
import { applyPlacement, lockContainers } from "./ordering";

// ---------------------------------------------------------------- columns

export const createColumnSchema = z.object({
  id: zId.optional(),
  boardId: z.enum(["tasks", "print"]),
  title: zRequiredText(100),
});
export const updateColumnSchema = z.object({ title: zRequiredText(100) }).strict();

async function getColumnOr404(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(boardColumns).where(eq(boardColumns.id, id));
  if (!row) throw notFound("Sloupec nenalezen.");
  return row;
}

async function columnsOfBoard(tx: DbOrTx, boardId: BoardId) {
  return tx.select().from(boardColumns).where(eq(boardColumns.boardId, boardId)).orderBy(asc(boardColumns.sortOrder));
}

const PRINT_COLUMNS_FIXED = "Sloupce tiskovin jsou pevné — nelze je přidávat, přejmenovat ani mazat.";

export async function createColumn(input: z.infer<typeof createColumnSchema>, ctx: Ctx): Promise<BoardColumn> {
  if (input.boardId !== "tasks") throw badRequest(PRINT_COLUMNS_FIXED);
  return getDb().transaction(async (tx) => {
    await lockContainers(tx, ["board:tasks"]);
    const cols = await columnsOfBoard(tx, "tasks");
    const [row] = await tx
      .insert(boardColumns)
      .values({
        ...(input.id && { id: input.id }),
        boardId: "tasks",
        title: input.title,
        sortOrder: appendOrder(cols.map((c) => ({ id: c.id, sortOrder: Number(c.sortOrder) }))),
      })
      .returning();
    await notify(tx, ctx, "column", "insert", row.id);
    return mapColumn(row);
  });
}

export async function updateColumn(id: string, input: z.infer<typeof updateColumnSchema>, ctx: Ctx): Promise<BoardColumn> {
  return getDb().transaction(async (tx) => {
    const col = await getColumnOr404(tx, id);
    if (col.boardId !== "tasks") throw badRequest(PRINT_COLUMNS_FIXED);
    const [row] = await tx.update(boardColumns).set({ title: input.title }).where(eq(boardColumns.id, id)).returning();
    await notify(tx, ctx, "column", "update", id);
    return mapColumn(row);
  });
}

/** Delete a task column: at least one must remain; its tasks move to the end of the (new) first column. */
export async function deleteColumn(id: string, ctx: Ctx): Promise<{ movedTo: string; movedCount: number }> {
  return getDb().transaction(async (tx) => {
    // board-level key first (column list), then both affected columns (their task lists)
    await lockContainers(tx, ["board:tasks"]);
    const col = await getColumnOr404(tx, id);
    if (col.boardId !== "tasks") throw badRequest(PRINT_COLUMNS_FIXED);
    const cols = await columnsOfBoard(tx, "tasks");
    if (cols.length <= 1) throw badRequest("Musí zůstat alespoň jeden sloupec.");
    const first = cols.find((c) => c.id !== id)!;
    await lockContainers(tx, [`column:${id}`, `column:${first.id}`]);
    const moving = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.columnId, id)).orderBy(asc(tasks.sortOrder));
    if (moving.length) {
      const target = await taskSiblings(tx, first.id);
      const start = appendOrder(target);
      const cases = sql.join(
        moving.map((t, k) => sql`when ${tasks.id} = ${t.id} then ${start + k}::numeric`),
        sql` `,
      );
      await tx
        .update(tasks)
        .set({ columnId: first.id, sortOrder: sql`case ${cases} end` })
        .where(inArray(tasks.id, moving.map((t) => t.id)));
    }
    await tx.delete(boardColumns).where(eq(boardColumns.id, id));
    await notify(tx, ctx, "column", "delete", id);
    return { movedTo: first.id, movedCount: moving.length };
  });
}

// ---------------------------------------------------------------- tasks

const zPersonRef = zId.nullable().optional();

export const createTaskSchema = z.object({
  id: zId.optional(),
  columnId: zId,
  category: zRequiredText(100),
  title: zRequiredText(300),
  description: zTrimmed(10000).optional(),
  leadId: zPersonRef,
  ownerId: zPersonRef,
  dueDate: zIsoDate.nullable().optional(),
  createdBy: zPersonRef,
});
export const updateTaskSchema = createTaskSchema.omit({ id: true, createdBy: true }).partial().strict();
export const moveSchema = z.object({ columnId: zId, beforeId: zId.nullable().optional() });
export const duplicateSchema = z.object({ id: zId.optional(), createdBy: zPersonRef });

async function assertPersons(tx: DbOrTx, ids: Array<string | null | undefined>) {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  if (!wanted.length) return;
  const rows = await tx.select({ id: orgNodes.id }).from(orgNodes).where(and(inArray(orgNodes.id, wanted), eq(orgNodes.kind, "person")));
  if (rows.length !== wanted.length) throw badRequest("Osoba neexistuje.");
}

async function assertColumnOfBoard(tx: DbOrTx, columnId: string, board: BoardId) {
  const [col] = await tx.select().from(boardColumns).where(eq(boardColumns.id, columnId));
  if (!col || col.boardId !== board) throw badRequest("Sloupec nepatří k této tabuli.");
}

async function taskSiblings(tx: DbOrTx, columnId: string): Promise<Sortable[]> {
  const rows = await tx.select({ id: tasks.id, sortOrder: tasks.sortOrder }).from(tasks).where(eq(tasks.columnId, columnId));
  return rows.map((r) => ({ id: r.id, sortOrder: Number(r.sortOrder) }));
}

async function getTaskOr404(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(tasks).where(eq(tasks.id, id));
  if (!row) throw notFound("Úkol nenalezen.");
  return row;
}

/**
 * Serialise writes into a column's item list so concurrent moves/creates/duplicates compute consistent neighbours
 * (same keys as deleteColumn). Re-checks that the column still exists after waiting for the lock.
 */
async function lockColumns(tx: Tx, ids: string[]) {
  await lockContainers(tx, ids.map((id) => `column:${id}`));
  const rows = await tx.select({ id: boardColumns.id }).from(boardColumns).where(inArray(boardColumns.id, ids));
  if (rows.length !== new Set(ids).size) throw badRequest("Sloupec mezitím někdo smazal.");
}

export async function createTask(input: z.infer<typeof createTaskSchema>, ctx: Ctx): Promise<Task> {
  return getDb().transaction(async (tx) => {
    await assertColumnOfBoard(tx, input.columnId, "tasks");
    await lockColumns(tx, [input.columnId]);
    await assertPersons(tx, [input.leadId, input.ownerId, input.createdBy]);
    const [row] = await tx
      .insert(tasks)
      .values({
        ...(input.id && { id: input.id }),
        columnId: input.columnId,
        category: input.category,
        title: input.title,
        description: input.description ?? "",
        leadId: input.leadId ?? null,
        ownerId: input.ownerId ?? null,
        dueDate: input.dueDate ?? null,
        createdBy: input.createdBy ?? null,
        sortOrder: appendOrder(await taskSiblings(tx, input.columnId)),
      })
      .returning();
    await notify(tx, ctx, "task", "insert", row.id);
    return mapTask(row);
  });
}

export async function updateTask(id: string, input: z.infer<typeof updateTaskSchema>, ctx: Ctx): Promise<Task> {
  return getDb().transaction(async (tx) => {
    const current = await getTaskOr404(tx, id);
    await assertPersons(tx, [input.leadId, input.ownerId]);
    const patch: Partial<typeof tasks.$inferInsert> = { ...input };
    if (input.columnId && input.columnId !== current.columnId) {
      await assertColumnOfBoard(tx, input.columnId, "tasks");
      await lockColumns(tx, [input.columnId]);
      patch.sortOrder = appendOrder(await taskSiblings(tx, input.columnId));
    }
    const [row] = Object.keys(patch).length ? await tx.update(tasks).set(patch).where(eq(tasks.id, id)).returning() : [current];
    await notify(tx, ctx, "task", "update", id);
    return mapTask(row);
  });
}

export async function moveTask(id: string, input: z.infer<typeof moveSchema>, ctx: Ctx): Promise<Task> {
  return getDb().transaction(async (tx) => {
    await getTaskOr404(tx, id);
    await assertColumnOfBoard(tx, input.columnId, "tasks");
    await lockColumns(tx, [input.columnId]);
    const sibs = await taskSiblings(tx, input.columnId);
    if (input.beforeId && input.beforeId !== id && !sibs.some((s) => s.id === input.beforeId)) {
      throw badRequest("Úkol before_id není v cílovém sloupci.");
    }
    await tx.update(tasks).set({ columnId: input.columnId }).where(eq(tasks.id, id));
    await applyPlacement(tx, tasks, sibs, id, { beforeId: input.beforeId === id ? null : input.beforeId });
    await notify(tx, ctx, "task", "move", id);
    return mapTask(await getTaskOr404(tx, id));
  });
}

export async function deleteTask(id: string, ctx: Ctx): Promise<void> {
  const files = await getDb().transaction(async (tx) => {
    // FOR UPDATE: waits for an in-flight upload (which holds FOR SHARE on the parent), so its attachment row is
    // deleted here too instead of being orphaned.
    const [locked] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).for("update");
    if (!locked) throw notFound("Úkol nenalezen.");
    const keys = await deleteAttachmentsOf(tx, "task", [id]);
    await tx.delete(tasks).where(eq(tasks.id, id));
    await notify(tx, ctx, "task", "delete", id);
    return keys;
  });
  await files.cleanup();
}

/** Duplicate („(kopie)") placed right after the original in the same column; attachments are copied. */
export async function duplicateTask(id: string, input: z.infer<typeof duplicateSchema>, ctx: Ctx) {
  const copiedFiles: string[] = [];
  return withFileRollback(copiedFiles, () => getDb().transaction(async (tx) => {
    let src = await getTaskOr404(tx, id);
    await lockColumns(tx, [src.columnId]);
    // re-read under the lock: a concurrent move may have changed its column meanwhile
    const fresh = await getTaskOr404(tx, id);
    if (fresh.columnId !== src.columnId) await lockColumns(tx, [fresh.columnId]);
    src = fresh;
    await assertPersons(tx, [input.createdBy]);
    const sibs = await taskSiblings(tx, src.columnId);
    const { id: _i, createdAt: _c, ...rest } = src;
    void _i;
    void _c;
    const [row] = await tx
      .insert(tasks)
      .values({
        ...rest,
        ...(input.id && { id: input.id }),
        title: `${src.title} (kopie)`,
        createdBy: input.createdBy ?? src.createdBy,
        sortOrder: between(Number(src.sortOrder), null),
      })
      .returning();
    await applyPlacement(tx, tasks, sibs, row.id, { afterId: id });
    const copied = await copyAttachments(tx, "task", id, row.id, copiedFiles);
    await notify(tx, ctx, "task", "duplicate", row.id);
    return { task: mapTask(await getTaskOr404(tx, row.id)), attachments: copied };
  }));
}

// ---------------------------------------------------------------- print items

export const createPrintItemSchema = z.object({
  id: zId.optional(),
  columnId: zId,
  typeId: zId,
  title: zRequiredText(300),
  description: zTrimmed(10000).optional(),
  quantity: zMoney.optional(),
  price: zMoney.optional(),
  paidByClub: z.boolean().optional(),
  realizationDate: zIsoDate.nullable().optional(),
  createdBy: zPersonRef,
});
export const updatePrintItemSchema = createPrintItemSchema.omit({ id: true, createdBy: true }).partial().strict();

async function printSiblings(tx: DbOrTx, columnId: string): Promise<Sortable[]> {
  const rows = await tx
    .select({ id: printItems.id, sortOrder: printItems.sortOrder })
    .from(printItems)
    .where(eq(printItems.columnId, columnId));
  return rows.map((r) => ({ id: r.id, sortOrder: Number(r.sortOrder) }));
}

async function getPrintItemOr404(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(printItems).where(eq(printItems.id, id));
  if (!row) throw notFound("Tiskovina nenalezena.");
  return row;
}

async function assertType(tx: DbOrTx, typeId: string) {
  const [t] = await tx.select({ id: printTypes.id }).from(printTypes).where(eq(printTypes.id, typeId));
  if (!t) throw badRequest("Typ média neexistuje.");
}

export async function createPrintItem(input: z.infer<typeof createPrintItemSchema>, ctx: Ctx): Promise<PrintItem> {
  return getDb().transaction(async (tx) => {
    await assertColumnOfBoard(tx, input.columnId, "print");
    await assertType(tx, input.typeId);
    await assertPersons(tx, [input.createdBy]);
    await lockColumns(tx, [input.columnId]);
    const [row] = await tx
      .insert(printItems)
      .values({
        ...(input.id && { id: input.id }),
        columnId: input.columnId,
        typeId: input.typeId,
        title: input.title,
        description: input.description ?? "",
        quantity: input.quantity ?? null,
        price: input.price ?? null,
        paidByClub: input.paidByClub ?? false,
        realizationDate: input.realizationDate ?? null,
        createdBy: input.createdBy ?? null,
        sortOrder: appendOrder(await printSiblings(tx, input.columnId)),
      })
      .returning();
    await notify(tx, ctx, "print_item", "insert", row.id);
    return mapPrintItem(row);
  });
}

export async function updatePrintItem(id: string, input: z.infer<typeof updatePrintItemSchema>, ctx: Ctx): Promise<PrintItem> {
  return getDb().transaction(async (tx) => {
    const current = await getPrintItemOr404(tx, id);
    if (input.typeId) await assertType(tx, input.typeId);
    const patch: Partial<typeof printItems.$inferInsert> = { ...input };
    if (input.columnId && input.columnId !== current.columnId) {
      await assertColumnOfBoard(tx, input.columnId, "print");
      await lockColumns(tx, [input.columnId]);
      patch.sortOrder = appendOrder(await printSiblings(tx, input.columnId));
    }
    const [row] = Object.keys(patch).length
      ? await tx.update(printItems).set(patch).where(eq(printItems.id, id)).returning()
      : [current];
    await notify(tx, ctx, "print_item", "update", id);
    return mapPrintItem(row);
  });
}

export async function movePrintItem(id: string, input: z.infer<typeof moveSchema>, ctx: Ctx): Promise<PrintItem> {
  return getDb().transaction(async (tx) => {
    await getPrintItemOr404(tx, id);
    await assertColumnOfBoard(tx, input.columnId, "print");
    await lockColumns(tx, [input.columnId]);
    const sibs = await printSiblings(tx, input.columnId);
    if (input.beforeId && input.beforeId !== id && !sibs.some((s) => s.id === input.beforeId)) {
      throw badRequest("Položka before_id není v cílovém sloupci.");
    }
    await tx.update(printItems).set({ columnId: input.columnId }).where(eq(printItems.id, id));
    await applyPlacement(tx, printItems, sibs, id, { beforeId: input.beforeId === id ? null : input.beforeId });
    await notify(tx, ctx, "print_item", "move", id);
    return mapPrintItem(await getPrintItemOr404(tx, id));
  });
}

export async function deletePrintItem(id: string, ctx: Ctx): Promise<void> {
  const files = await getDb().transaction(async (tx) => {
    const [locked] = await tx.select({ id: printItems.id }).from(printItems).where(eq(printItems.id, id)).for("update");
    if (!locked) throw notFound("Tiskovina nenalezena.");
    const keys = await deleteAttachmentsOf(tx, "print", [id]);
    await tx.delete(printItems).where(eq(printItems.id, id));
    await notify(tx, ctx, "print_item", "delete", id);
    return keys;
  });
  await files.cleanup();
}

export async function duplicatePrintItem(id: string, input: z.infer<typeof duplicateSchema>, ctx: Ctx) {
  const copiedFiles: string[] = [];
  return withFileRollback(copiedFiles, () => getDb().transaction(async (tx) => {
    let src = await getPrintItemOr404(tx, id);
    await lockColumns(tx, [src.columnId]);
    const fresh = await getPrintItemOr404(tx, id);
    if (fresh.columnId !== src.columnId) await lockColumns(tx, [fresh.columnId]);
    src = fresh;
    await assertPersons(tx, [input.createdBy]);
    const sibs = await printSiblings(tx, src.columnId);
    const { id: _i, createdAt: _c, ...rest } = src;
    void _i;
    void _c;
    const [row] = await tx
      .insert(printItems)
      .values({
        ...rest,
        ...(input.id && { id: input.id }),
        title: `${src.title} (kopie)`,
        createdBy: input.createdBy ?? src.createdBy,
        sortOrder: between(Number(src.sortOrder), null),
      })
      .returning();
    await applyPlacement(tx, printItems, sibs, row.id, { afterId: id });
    const copied = await copyAttachments(tx, "print", id, row.id, copiedFiles);
    await notify(tx, ctx, "print_item", "duplicate", row.id);
    return { printItem: mapPrintItem(await getPrintItemOr404(tx, row.id)), attachments: copied };
  }));
}
