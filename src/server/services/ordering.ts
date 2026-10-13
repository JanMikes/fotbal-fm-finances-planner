import { inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { planInsert, type InsertPosition, type Sortable } from "@/lib/sortOrder";
import type { DbOrTx, Tx } from "../db/client";

/**
 * Serialise ordering-affecting writes per container ("board:tasks", "column:<id>", "print_types", …) with
 * transaction-scoped advisory locks, so concurrent creates / moves / deletes / duplicates compute their
 * sort_order from a stable sibling list (no duplicate sort orders). Keys are locked in sorted order to avoid
 * deadlocks; callers that also take a board-level key must take it in the same call or before any column key.
 */
export async function lockContainers(tx: Tx, keys: string[]): Promise<void> {
  for (const key of [...new Set(keys)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`fmp:${key}`}, 0))`);
  }
}

/**
 * Apply an insert plan for `movedId` among `siblings`. Writes the moved row's sort order (and renumbers the group
 * when the gap is too small). The caller must update other columns (e.g. parent/column) itself.
 */
export async function applyPlacement(
  tx: DbOrTx,
  table: PgTable & { id: PgColumn; sortOrder: PgColumn },
  siblings: Sortable[],
  movedId: string,
  pos: InsertPosition,
): Promise<number> {
  const plan = planInsert(siblings, movedId, pos);
  if (plan.updates.length === 1) {
    await tx.update(table).set({ sortOrder: plan.sortOrder } as never).where(sql`${table.id} = ${movedId}`);
  } else {
    // renumber in one statement
    const cases = sql.join(
      plan.updates.map((u) => sql`when ${table.id} = ${u.id} then ${u.sortOrder}::numeric`),
      sql` `,
    );
    await tx
      .update(table)
      .set({ sortOrder: sql`case ${cases} end` } as never)
      .where(inArray(table.id, plan.updates.map((u) => u.id)));
  }
  return plan.sortOrder;
}
