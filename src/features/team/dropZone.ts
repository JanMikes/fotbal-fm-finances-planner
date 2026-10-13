/**
 * Pure drop-zone resolution for the org tree drag & drop (prototype §10.8 `oMove` / `oEnd`).
 * Kept free of DOM access so it can be unit-tested.
 */
import type { MoveNodeInput } from "@/lib/api";
import type { NodeKind, OrgNode } from "@/lib/types";

export type DropPos = "child" | "before" | "after";

/** Breakpoint at which the tree becomes an indented list and the thirds become vertical. */
export const MOBILE_QUERY = "(max-width:760px)";

/**
 * Position from the pointer's fraction across the target card (x on desktop, y on mobile):
 * < .34 = before, > .66 = after, else child. A person dropped onto a TOP-LEVEL unit always goes inside it.
 */
export function resolveDropPos(fraction: number, target: Pick<OrgNode, "kind" | "parentId">, dragKind: NodeKind): DropPos {
  let pos: DropPos = fraction < 0.34 ? "before" : fraction > 0.66 ? "after" : "child";
  if (target.kind === "unit" && dragKind !== "unit" && (pos === "child" || !target.parentId)) pos = "child";
  return pos;
}

/** Cursor tooltip text. Mobile uses „Před X" / „Za X" for the vertical thirds (DECISIONS #8). */
export function dropTooltip(pos: DropPos, target: Pick<OrgNode, "kind" | "name">, mobile: boolean): string {
  if (pos === "child") return (target.kind === "unit" ? "Do kategorie " : "Pod ") + target.name;
  if (mobile) return (pos === "before" ? "Před " : "Za ") + target.name;
  return (pos === "before" ? "Vlevo vedle " : "Vpravo vedle ") + target.name;
}

/** The drop target while dragging: a node (with a position) or the top-level root zone. */
export type DropTarget = { kind: "node"; id: string; pos: DropPos } | { kind: "root" };

/** PATCH /api/org/move payload for a drop (without the adoptChildren decision). */
export function dropToMove(dragId: string, target: DropTarget, nodes: readonly OrgNode[]): MoveNodeInput | null {
  if (target.kind === "root") return { id: dragId, parentId: null };
  const tn = nodes.find((n) => n.id === target.id);
  if (!tn || tn.id === dragId) return null;
  if (target.pos === "child") return { id: dragId, parentId: tn.id };
  const ids = new Set(nodes.map((n) => n.id));
  const parentId = tn.parentId && ids.has(tn.parentId) ? tn.parentId : null;
  return target.pos === "before" ? { id: dragId, parentId, beforeId: tn.id } : { id: dragId, parentId, afterId: tn.id };
}

/**
 * Person children of the target that a unit dropped „under" it may adopt (prototype: only PERSON children;
 * the confirm is asked only when the dragged node is a unit, the drop is onto a node centre and the list is non-empty).
 * The root zone never asks (fixes the prototype crash).
 */
export function adoptCandidates(nodes: readonly OrgNode[], dragId: string, target: DropTarget): OrgNode[] {
  if (target.kind !== "node" || target.pos !== "child") return [];
  const drag = nodes.find((n) => n.id === dragId);
  if (!drag || drag.kind !== "unit") return [];
  return nodes.filter((n) => n.parentId === target.id && n.id !== dragId && n.kind === "person").sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Text of the „insert the category between" confirm (prototype §11, verbatim). */
export function adoptConfirmText(unitName: string, targetName: string, persons: readonly Pick<OrgNode, "name">[]): string {
  return `Vložit kategorii „${unitName}“ mezi ${targetName} a jeho podřízené?\n\nOK = ${persons.map((p) => p.name).join(", ")} se přesunou pod kategorii.\nZrušit = kategorie se jen přidá vedle nich.`;
}
