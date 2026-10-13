import { asc } from "drizzle-orm";
import type { AppState } from "@/lib/types";
import { getDb } from "../db/client";
import { attachments, boardColumns, budget, orgNodes, printItems, printTypes, printYearClosures, tasks } from "../db/schema";
import { mapAttachment, mapBudget, mapClosure, mapColumn, mapNode, mapPrintItem, mapPrintType, mapTask } from "./mappers";

/** Everything for the initial load. Consistent snapshot (repeatable read, read only). */
export async function getState(): Promise<AppState> {
  return getDb().transaction(
    async (tx) => {
      // sequential: a transaction holds one connection (pg does not pipeline concurrent queries)
      const nodes = await tx.select().from(orgNodes).orderBy(asc(orgNodes.sortOrder), asc(orgNodes.createdAt));
      const columns = await tx.select().from(boardColumns).orderBy(asc(boardColumns.boardId), asc(boardColumns.sortOrder));
      const taskRows = await tx.select().from(tasks).orderBy(asc(tasks.sortOrder));
      const types = await tx.select().from(printTypes).orderBy(asc(printTypes.sortOrder));
      const items = await tx.select().from(printItems).orderBy(asc(printItems.sortOrder));
      const closures = await tx.select().from(printYearClosures).orderBy(asc(printYearClosures.year));
      const atts = await tx.select().from(attachments).orderBy(asc(attachments.createdAt));
      const budgetRows = await tx.select().from(budget);
      return {
        nodes: nodes.map(mapNode),
        columns: columns.map(mapColumn),
        tasks: taskRows.map(mapTask),
        printTypes: types.map(mapPrintType),
        printItems: items.map(mapPrintItem),
        closures: closures.map(mapClosure),
        attachments: atts.map(mapAttachment),
        budget: mapBudget(budgetRows[0]),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
