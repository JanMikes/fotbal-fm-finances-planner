/** DB row → API (domain) shape. */
import type { Attachment, BoardColumn, BoardId, Budget, OrgNode, PrintItem, PrintType, PrintYearClosure, Task } from "@/lib/types";
import type { attachments, boardColumns, budget, orgNodes, printItems, printTypes, printYearClosures, tasks } from "../db/schema";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

/** Normalise Postgres timestamp text ("2026-10-13 10:00:00.123+00") to ISO 8601. */
export function toIso(v: string | Date): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

const num = (v: number | string) => (typeof v === "number" ? v : Number(v));

export const mapNode = (r: Row<typeof orgNodes>): OrgNode => ({
  id: r.id,
  kind: r.kind as OrgNode["kind"],
  name: r.name,
  role: r.role,
  info: r.info,
  budget: r.budget,
  budgetColor: r.budgetColor as OrgNode["budgetColor"],
  avatarColor: r.avatarColor,
  areas: r.areas ?? [],
  color: r.color,
  parentId: r.parentId,
  sortOrder: num(r.sortOrder),
  createdAt: toIso(r.createdAt),
});

export const mapColumn = (r: Row<typeof boardColumns>): BoardColumn => ({
  id: r.id,
  boardId: r.boardId as BoardId,
  title: r.title,
  sortOrder: num(r.sortOrder),
});

export const mapTask = (r: Row<typeof tasks>): Task => ({
  id: r.id,
  columnId: r.columnId,
  category: r.category,
  title: r.title,
  description: r.description,
  leadId: r.leadId,
  ownerId: r.ownerId,
  dueDate: r.dueDate,
  sortOrder: num(r.sortOrder),
  createdBy: r.createdBy,
  createdAt: toIso(r.createdAt),
});

export const mapPrintType = (r: Row<typeof printTypes>): PrintType => ({ id: r.id, name: r.name, sortOrder: num(r.sortOrder) });

export const mapPrintItem = (r: Row<typeof printItems>): PrintItem => ({
  id: r.id,
  columnId: r.columnId,
  typeId: r.typeId,
  title: r.title,
  description: r.description,
  quantity: r.quantity,
  price: r.price,
  paidByClub: r.paidByClub,
  realizationDate: r.realizationDate,
  archived: r.archived,
  sortOrder: num(r.sortOrder),
  createdBy: r.createdBy,
  createdAt: toIso(r.createdAt),
});

export const mapClosure = (r: Row<typeof printYearClosures>): PrintYearClosure => ({ year: r.year, closedAt: toIso(r.closedAt) });

export const mapAttachment = (r: Row<typeof attachments>): Attachment => ({
  id: r.id,
  parentKind: r.parentKind as Attachment["parentKind"],
  parentId: r.parentId,
  kind: r.kind as Attachment["kind"],
  name: r.name,
  url: r.kind === "file" ? `/api/attachments/${r.id}/file` : (r.url ?? ""),
  sizeBytes: r.sizeBytes === null ? null : num(r.sizeBytes),
  mime: r.mime,
  createdAt: toIso(r.createdAt),
});

export const mapBudget = (r: Row<typeof budget> | undefined): Budget => ({
  spolek: r?.spolek ?? 0,
  asAmount: r?.asAmount ?? 0,
  monthlyInstallment: r?.monthlyInstallment ?? 0,
  installmentFrom: r?.installmentFrom ?? null,
});
