/** Print types, year closures and the yearly report. */
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { buildYearReport, type YearReport } from "@/lib/report";
import { appendOrder } from "@/lib/sortOrder";
import type { PrintType, PrintYearClosure } from "@/lib/types";
import { getDb, type DbOrTx } from "../db/client";
import { printItems, printTypes, printYearClosures } from "../db/schema";
import { badRequest, conflict, notFound, zId, zRequiredText, type Ctx } from "../http";
import { notify } from "../notify";
import { mapClosure, mapPrintItem, mapPrintType } from "./mappers";

export const createPrintTypeSchema = z.object({ id: zId.optional(), name: zRequiredText(100) });
export const updatePrintTypeSchema = z.object({ name: zRequiredText(100) }).strict();
export const zYear = z.coerce.number().int().min(2000).max(2100);

async function nameTaken(tx: DbOrTx, name: string, exceptId?: string) {
  const rows = await tx.select({ id: printTypes.id }).from(printTypes).where(eq(printTypes.name, name));
  return rows.some((r) => r.id !== exceptId);
}

export async function createPrintType(input: z.infer<typeof createPrintTypeSchema>, ctx: Ctx): Promise<PrintType> {
  return getDb().transaction(async (tx) => {
    if (await nameTaken(tx, input.name)) throw conflict("Typ s tímto názvem již existuje.");
    const all = await tx.select().from(printTypes);
    const [row] = await tx
      .insert(printTypes)
      .values({
        ...(input.id && { id: input.id }),
        name: input.name,
        sortOrder: appendOrder(all.map((t) => ({ id: t.id, sortOrder: Number(t.sortOrder) }))),
      })
      .returning();
    await notify(tx, ctx, "print_type", "insert", row.id);
    return mapPrintType(row);
  });
}

/** Rename: items reference the type by id, so they follow automatically. */
export async function renamePrintType(id: string, input: z.infer<typeof updatePrintTypeSchema>, ctx: Ctx): Promise<PrintType> {
  return getDb().transaction(async (tx) => {
    if (await nameTaken(tx, input.name, id)) throw conflict("Typ s tímto názvem již existuje.");
    const [row] = await tx.update(printTypes).set({ name: input.name }).where(eq(printTypes.id, id)).returning();
    if (!row) throw notFound("Typ média nenalezen.");
    await notify(tx, ctx, "print_type", "update", id);
    return mapPrintType(row);
  });
}

/** Delete: at least one type must remain; items move to the first remaining type. */
export async function deletePrintType(id: string, ctx: Ctx): Promise<{ movedTo: string; movedCount: number }> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`lock table ${printTypes} in share row exclusive mode`);
    const all = await tx.select().from(printTypes).orderBy(asc(printTypes.sortOrder));
    if (!all.some((t) => t.id === id)) throw notFound("Typ média nenalezen.");
    if (all.length <= 1) throw badRequest("Musí zůstat alespoň jeden typ.");
    const first = all.find((t) => t.id !== id)!;
    const moved = await tx.update(printItems).set({ typeId: first.id }).where(eq(printItems.typeId, id)).returning({ id: printItems.id });
    await tx.delete(printTypes).where(eq(printTypes.id, id));
    await notify(tx, ctx, "print_type", "delete", id);
    return { movedTo: first.id, movedCount: moved.length };
  });
}

const yearItems = (year: number) => sql`extract(year from ${printItems.realizationDate}) = ${year}`;

/** Close a year: archive every item with a realization date in that year and record the closure. */
export async function closeYear(year: number, ctx: Ctx): Promise<{ closure: PrintYearClosure; archivedCount: number }> {
  return getDb().transaction(async (tx) => {
    const archived = await tx.update(printItems).set({ archived: true }).where(yearItems(year)).returning({ id: printItems.id });
    const [row] = await tx
      .insert(printYearClosures)
      .values({ year })
      .onConflictDoUpdate({ target: printYearClosures.year, set: { closedAt: sql`now()` } })
      .returning();
    await notify(tx, ctx, "print_year", "close", year);
    return { closure: mapClosure(row), archivedCount: archived.length };
  });
}

/** Reopen a year: un-archive its items and remove the closure. */
export async function reopenYear(year: number, ctx: Ctx): Promise<{ unarchivedCount: number }> {
  return getDb().transaction(async (tx) => {
    const rows = await tx.update(printItems).set({ archived: false }).where(yearItems(year)).returning({ id: printItems.id });
    await tx.delete(printYearClosures).where(eq(printYearClosures.year, year));
    await notify(tx, ctx, "print_year", "reopen", year);
    return { unarchivedCount: rows.length };
  });
}

export async function yearReport(year: number, now: Date = new Date()): Promise<YearReport> {
  const db = getDb();
  const [items, types, closures] = await Promise.all([
    db.select().from(printItems).orderBy(asc(printItems.sortOrder)),
    db.select().from(printTypes).orderBy(asc(printTypes.sortOrder)),
    db.select().from(printYearClosures),
  ]);
  return buildYearReport({
    items: items.map(mapPrintItem),
    types: types.map(mapPrintType),
    closures: closures.map(mapClosure),
    year,
    now,
  });
}

