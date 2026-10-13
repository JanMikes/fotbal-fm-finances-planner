import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { appendOrder, between, type Sortable } from "@/lib/sortOrder";
import { descendantsOf } from "@/lib/tree";
import type { OrgNode } from "@/lib/types";
import { getDb, type DbOrTx, type Tx } from "../db/client";
import { orgNodes } from "../db/schema";
import { badRequest, notFound, zId, zMoney, zRequiredText, zTrimmed, type Ctx } from "../http";
import { notify } from "../notify";
import { mapNode } from "./mappers";
import { applyPlacement } from "./ordering";

const zHex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Barva musí být ve formátu #rrggbb.")
  .transform((s) => s.toLowerCase());
/** Optional trimmed text; "" → null. */
const zOptText = (max: number) =>
  zTrimmed(max)
    .nullable()
    .transform((v) => (v ? v : null))
    .optional();

const nodeFields = {
  name: zRequiredText(200),
  role: zOptText(200),
  info: zOptText(5000),
  budget: zMoney.optional(),
  budgetColor: z.enum(["blue", "green", "red"]).optional(),
  avatarColor: zHex.nullable().optional(),
  areas: z.array(zTrimmed(100).min(1)).max(50).optional(),
  color: zHex.nullable().optional(),
  parentId: zId.nullable().optional(),
};

export const createNodeSchema = z.object({
  id: zId.optional(),
  kind: z.enum(["person", "unit"]),
  ...nodeFields,
  /** Optional position among the new siblings (default: append). */
  beforeId: zId.nullable().optional(),
  afterId: zId.nullable().optional(),
});

export const updateNodeSchema = z.object({ ...nodeFields, name: nodeFields.name.optional() }).strict();

export const moveNodeSchema = z.object({
  id: zId,
  parentId: zId.nullable(),
  beforeId: zId.nullable().optional(),
  afterId: zId.nullable().optional(),
  /**
   * Category insert-between (prototype §10.8): when a UNIT is dropped as a child of a node, re-parent that node's
   * PERSON children (except the moved unit) under the moved unit. Ignored for persons and for top level.
   */
  adoptChildren: z.boolean().optional(),
});

export const duplicateNodeSchema = z.object({ id: zId.optional() });

type NodeRow = typeof orgNodes.$inferSelect;

/** Serialise structural changes to the tree (cycle checks need a stable view). */
async function lockTree(tx: Tx) {
  await tx.execute(sql`lock table ${orgNodes} in share row exclusive mode`);
}

async function getNodeOr404(tx: DbOrTx, id: string): Promise<NodeRow> {
  const [row] = await tx.select().from(orgNodes).where(eq(orgNodes.id, id));
  if (!row) throw notFound("Uzel struktury nenalezen.");
  return row;
}

async function siblingsOf(tx: DbOrTx, parentId: string | null): Promise<Sortable[]> {
  const rows = await tx
    .select({ id: orgNodes.id, sortOrder: orgNodes.sortOrder })
    .from(orgNodes)
    .where(parentId ? eq(orgNodes.parentId, parentId) : isNull(orgNodes.parentId))
    .orderBy(asc(orgNodes.sortOrder));
  return rows.map((r) => ({ id: r.id, sortOrder: Number(r.sortOrder) }));
}

async function assertValidParent(tx: Tx, nodeId: string | null, parentId: string | null | undefined) {
  if (!parentId) return;
  const all = (await tx.select().from(orgNodes)).map(mapNode);
  if (!all.some((n) => n.id === parentId)) throw badRequest("Nadřízený uzel neexistuje.");
  if (nodeId && descendantsOf(all, nodeId).has(parentId)) throw badRequest("Uzel nelze přesunout pod sebe ani pod vlastního potomka.");
}

/** Strip fields that do not belong to the node kind. */
function fieldsForKind(kind: "person" | "unit", input: Partial<z.infer<typeof updateNodeSchema>>) {
  const common = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.parentId !== undefined && { parentId: input.parentId }),
  };
  if (kind === "unit") return { ...common, ...(input.color !== undefined && { color: input.color }) };
  return {
    ...common,
    ...(input.role !== undefined && { role: input.role }),
    ...(input.info !== undefined && { info: input.info }),
    ...(input.budget !== undefined && { budget: input.budget }),
    ...(input.budgetColor !== undefined && { budgetColor: input.budgetColor }),
    ...(input.avatarColor !== undefined && { avatarColor: input.avatarColor }),
    ...(input.areas !== undefined && { areas: input.areas }),
  };
}

export async function listNodes(db: DbOrTx = getDb()): Promise<OrgNode[]> {
  const rows = await db.select().from(orgNodes).orderBy(asc(orgNodes.sortOrder), asc(orgNodes.createdAt));
  return rows.map(mapNode);
}

export async function createNode(input: z.infer<typeof createNodeSchema>, ctx: Ctx): Promise<OrgNode> {
  return getDb().transaction(async (tx) => {
    await lockTree(tx);
    const parentId = input.parentId ?? null;
    await assertValidParent(tx, null, parentId);
    const fields = fieldsForKind(input.kind, input);
    const sibs = await siblingsOf(tx, parentId);
    const [row] = await tx
      .insert(orgNodes)
      .values({
        ...(input.id && { id: input.id }),
        kind: input.kind,
        ...fields,
        name: input.name,
        parentId,
        sortOrder: appendOrder(sibs),
        ...(input.kind === "unit" && { budgetColor: "blue" }),
      })
      .returning();
    if (input.beforeId || input.afterId) {
      await applyPlacement(tx, orgNodes, sibs, row.id, { beforeId: input.beforeId, afterId: input.afterId });
    }
    await notify(tx, ctx, "org_node", "insert", row.id);
    return mapNode(await getNodeOr404(tx, row.id));
  });
}

export async function updateNode(id: string, input: z.infer<typeof updateNodeSchema>, ctx: Ctx): Promise<OrgNode> {
  return getDb().transaction(async (tx) => {
    await lockTree(tx);
    const current = await getNodeOr404(tx, id);
    const fields = fieldsForKind(current.kind as "person" | "unit", input);
    const parentChanged = input.parentId !== undefined && (input.parentId ?? null) !== current.parentId;
    if (parentChanged) {
      await assertValidParent(tx, id, input.parentId);
      // moving to another parent via the form appends at the end of the new sibling group
      (fields as { sortOrder?: number }).sortOrder = appendOrder(await siblingsOf(tx, input.parentId ?? null));
    }
    if (Object.keys(fields).length) await tx.update(orgNodes).set(fields).where(eq(orgNodes.id, id));
    await notify(tx, ctx, "org_node", "update", id);
    return mapNode(await getNodeOr404(tx, id));
  });
}

/**
 * Delete a node. Children move to the deleted node's parent, taking its place in the sibling order.
 * Person: tasks lead/owner/created_by are set null by the FKs (ON DELETE SET NULL).
 */
export async function deleteNode(id: string, ctx: Ctx): Promise<void> {
  await getDb().transaction(async (tx) => {
    await lockTree(tx);
    const node = await getNodeOr404(tx, id);
    const children = await siblingsOf(tx, id);
    if (children.length) {
      const sibs = (await siblingsOf(tx, node.parentId)).map((s) => s.id);
      const idx = sibs.indexOf(id);
      const ordered = [...sibs.slice(0, idx), ...children.map((c) => c.id), ...sibs.slice(idx + 1)];
      const cases = sql.join(
        ordered.map((nid, k) => sql`when ${orgNodes.id} = ${nid} then ${k + 1}::numeric`),
        sql` `,
      );
      await tx
        .update(orgNodes)
        .set({ sortOrder: sql`case ${cases} end`, parentId: node.parentId })
        .where(inArray(orgNodes.id, ordered));
    }
    await tx.delete(orgNodes).where(eq(orgNodes.id, id));
    await notify(tx, ctx, "org_node", "delete", id);
  });
}

/** Move a node (with its subtree) under `parentId` (null = top level), optionally before/after a sibling. */
export async function moveNode(input: z.infer<typeof moveNodeSchema>, ctx: Ctx): Promise<OrgNode> {
  return getDb().transaction(async (tx) => {
    await lockTree(tx);
    const node = await getNodeOr404(tx, input.id);
    await assertValidParent(tx, input.id, input.parentId);
    const sibs = await siblingsOf(tx, input.parentId);
    for (const ref of [input.beforeId, input.afterId]) {
      if (ref && !sibs.some((s) => s.id === ref)) throw badRequest("Referenční uzel není sourozencem v cílové úrovni.");
    }
    await tx.update(orgNodes).set({ parentId: input.parentId }).where(eq(orgNodes.id, input.id));
    await applyPlacement(tx, orgNodes, sibs, input.id, { beforeId: input.beforeId, afterId: input.afterId });

    if (input.adoptChildren && node.kind === "unit" && input.parentId) {
      await tx
        .update(orgNodes)
        .set({ parentId: input.id })
        .where(
          and(eq(orgNodes.parentId, input.parentId), eq(orgNodes.kind, "person"), sql`${orgNodes.id} <> ${input.id}`),
        );
    }
    await notify(tx, ctx, "org_node", "move", input.id);
    return mapNode(await getNodeOr404(tx, input.id));
  });
}

/**
 * Duplicate a node, placed right after the original.
 *  - person: copy with " (kopie)" (no children). Optional client-provided id for the copy.
 *  - unit: recursive copy of the unit and all its sub-UNITS (no persons); top copy gets " (kopie)".
 * Returns all created nodes (top copy first).
 */
export async function duplicateNode(id: string, input: z.infer<typeof duplicateNodeSchema>, ctx: Ctx): Promise<OrgNode[]> {
  return getDb().transaction(async (tx) => {
    await lockTree(tx);
    const src = await getNodeOr404(tx, id);
    const sibs = await siblingsOf(tx, src.parentId);
    const idx = sibs.findIndex((s) => s.id === id);
    const next = sibs[idx + 1]?.sortOrder ?? null;
    const { id: _srcId, createdAt: _c, ...rest } = src;
    void _srcId;
    void _c;
    const [top] = await tx
      .insert(orgNodes)
      .values({
        ...rest,
        ...(input.id && { id: input.id }),
        name: `${src.name} (kopie)`,
        sortOrder: between(Number(src.sortOrder), next),
      })
      .returning();
    await applyPlacement(tx, orgNodes, sibs, top.id, { afterId: id });
    const created = [top.id];

    if (src.kind === "unit") {
      const all = await tx.select().from(orgNodes);
      const copyChildren = async (fromId: string, toId: string) => {
        const kids = all.filter((n) => n.parentId === fromId && n.kind === "unit").sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
        for (const k of kids) {
          const { id: kidId, createdAt: _kc, ...krest } = k;
          void _kc;
          const [copy] = await tx.insert(orgNodes).values({ ...krest, parentId: toId }).returning();
          created.push(copy.id);
          await copyChildren(kidId, copy.id);
        }
      };
      await copyChildren(id, top.id);
    }
    await notify(tx, ctx, "org_node", "duplicate", top.id);
    const rows = await tx.select().from(orgNodes).where(inArray(orgNodes.id, created));
    return created.map((cid) => mapNode(rows.find((r) => r.id === cid)!));
  });
}
