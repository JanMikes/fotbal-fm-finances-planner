/**
 * Pure optimistic state transitions — mirror the server's integrity rules so the UI updates instantly.
 * The server stays authoritative: the store refetches /api/state after mutations settle.
 */
import { appendOrder, planInsert, type InsertPosition } from "../sortOrder";
import { descendantsOf } from "../tree";
import type { AppState, Attachment, BoardColumn, Budget, OrgNode, PrintItem, PrintType, Task } from "../types";

type WithSort = { id: string; columnId: string; sortOrder: number };

function placeInColumn<T extends WithSort>(items: T[], id: string, columnId: string, pos: InsertPosition): T[] {
  const sibs = items.filter((i) => i.columnId === columnId && i.id !== id);
  const plan = planInsert(sibs, id, pos);
  const upd = new Map(plan.updates.map((u) => [u.id, u.sortOrder]));
  return items.map((i) => (i.id === id ? { ...i, columnId, sortOrder: upd.get(id)! } : upd.has(i.id) ? { ...i, sortOrder: upd.get(i.id)! } : i));
}

const appendIn = <T extends WithSort>(items: T[], columnId: string) => appendOrder(items.filter((i) => i.columnId === columnId));

// ---------------------------------------------------------------- tasks
export function addTask(s: AppState, t: Omit<Task, "sortOrder"> & { sortOrder?: number }): AppState {
  return { ...s, tasks: [...s.tasks, { ...t, sortOrder: t.sortOrder ?? appendIn(s.tasks, t.columnId) }] };
}

export function patchTask(s: AppState, id: string, patch: Partial<Task>): AppState {
  return {
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t, ...patch };
      if (patch.columnId && patch.columnId !== t.columnId) next.sortOrder = appendIn(s.tasks, patch.columnId);
      return next;
    }),
  };
}

export function moveTask(s: AppState, id: string, columnId: string, beforeId?: string | null): AppState {
  return { ...s, tasks: placeInColumn(s.tasks, id, columnId, { beforeId }) };
}

export function removeTask(s: AppState, id: string): AppState {
  return {
    ...s,
    tasks: s.tasks.filter((t) => t.id !== id),
    attachments: s.attachments.filter((a) => !(a.parentKind === "task" && a.parentId === id)),
  };
}

/** Insert a duplicate right after the original (sortOrder computed like the server). */
export function duplicateTask(s: AppState, srcId: string, copy: Partial<Task> & { id: string }): AppState {
  const src = s.tasks.find((t) => t.id === srcId);
  if (!src) return s;
  const added = { ...src, ...copy, title: copy.title ?? `${src.title} (kopie)` };
  const tasks = placeInColumn([...s.tasks, added], added.id, src.columnId, { afterId: srcId });
  return { ...s, tasks };
}

// ---------------------------------------------------------------- columns
export function addColumn(s: AppState, col: Omit<BoardColumn, "sortOrder">): AppState {
  const sort = appendOrder(s.columns.filter((c) => c.boardId === col.boardId));
  return { ...s, columns: [...s.columns, { ...col, sortOrder: sort }] };
}

export function renameColumn(s: AppState, id: string, title: string): AppState {
  return { ...s, columns: s.columns.map((c) => (c.id === id ? { ...c, title } : c)) };
}

/** Remove a task column; its tasks go to the end of the first remaining column. */
export function deleteColumn(s: AppState, id: string): AppState {
  const col = s.columns.find((c) => c.id === id);
  if (!col) return s;
  const rest = s.columns.filter((c) => c.boardId === col.boardId && c.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!rest.length) return s;
  const first = rest[0].id;
  let next = appendIn(s.tasks, first);
  const moving = s.tasks.filter((t) => t.columnId === id).sort((a, b) => a.sortOrder - b.sortOrder);
  const newSort = new Map(moving.map((t) => [t.id, next++]));
  return {
    ...s,
    columns: s.columns.filter((c) => c.id !== id),
    tasks: s.tasks.map((t) => (newSort.has(t.id) ? { ...t, columnId: first, sortOrder: newSort.get(t.id)! } : t)),
  };
}

// ---------------------------------------------------------------- print
export function addPrintItem(s: AppState, item: Omit<PrintItem, "sortOrder"> & { sortOrder?: number }): AppState {
  return { ...s, printItems: [...s.printItems, { ...item, sortOrder: item.sortOrder ?? appendIn(s.printItems, item.columnId) }] };
}

export function patchPrintItem(s: AppState, id: string, patch: Partial<PrintItem>): AppState {
  return {
    ...s,
    printItems: s.printItems.map((i) => {
      if (i.id !== id) return i;
      const next = { ...i, ...patch };
      if (patch.columnId && patch.columnId !== i.columnId) next.sortOrder = appendIn(s.printItems, patch.columnId);
      return next;
    }),
  };
}

export function movePrintItem(s: AppState, id: string, columnId: string, beforeId?: string | null): AppState {
  return { ...s, printItems: placeInColumn(s.printItems, id, columnId, { beforeId }) };
}

export function removePrintItem(s: AppState, id: string): AppState {
  return {
    ...s,
    printItems: s.printItems.filter((i) => i.id !== id),
    attachments: s.attachments.filter((a) => !(a.parentKind === "print" && a.parentId === id)),
  };
}

export function duplicatePrintItem(s: AppState, srcId: string, copy: Partial<PrintItem> & { id: string }): AppState {
  const src = s.printItems.find((t) => t.id === srcId);
  if (!src) return s;
  const added = { ...src, ...copy, title: copy.title ?? `${src.title} (kopie)` };
  return { ...s, printItems: placeInColumn([...s.printItems, added], added.id, src.columnId, { afterId: srcId }) };
}

export function addPrintType(s: AppState, t: Omit<PrintType, "sortOrder">): AppState {
  return { ...s, printTypes: [...s.printTypes, { ...t, sortOrder: appendOrder(s.printTypes) }] };
}

export function renamePrintType(s: AppState, id: string, name: string): AppState {
  return { ...s, printTypes: s.printTypes.map((t) => (t.id === id ? { ...t, name } : t)) };
}

export function deletePrintType(s: AppState, id: string): AppState {
  const rest = s.printTypes.filter((t) => t.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!rest.length) return s;
  return {
    ...s,
    printTypes: s.printTypes.filter((t) => t.id !== id),
    printItems: s.printItems.map((i) => (i.typeId === id ? { ...i, typeId: rest[0].id } : i)),
  };
}

export function closeYear(s: AppState, year: number, closedAt: string = new Date().toISOString()): AppState {
  const inYear = (i: PrintItem) => !!i.realizationDate && Number(i.realizationDate.slice(0, 4)) === year;
  return {
    ...s,
    printItems: s.printItems.map((i) => (inYear(i) ? { ...i, archived: true } : i)),
    closures: [...s.closures.filter((c) => c.year !== year), { year, closedAt }],
  };
}

export function reopenYear(s: AppState, year: number): AppState {
  const inYear = (i: PrintItem) => !!i.realizationDate && Number(i.realizationDate.slice(0, 4)) === year;
  return {
    ...s,
    printItems: s.printItems.map((i) => (inYear(i) ? { ...i, archived: false } : i)),
    closures: s.closures.filter((c) => c.year !== year),
  };
}

// ---------------------------------------------------------------- org tree
const siblingsIn = (nodes: OrgNode[], parentId: string | null) => nodes.filter((n) => (n.parentId ?? null) === parentId);

export function addNode(s: AppState, node: Omit<OrgNode, "sortOrder"> & { sortOrder?: number }): AppState {
  return { ...s, nodes: [...s.nodes, { ...node, sortOrder: node.sortOrder ?? appendOrder(siblingsIn(s.nodes, node.parentId)) }] };
}

export function patchNode(s: AppState, id: string, patch: Partial<OrgNode>): AppState {
  return {
    ...s,
    nodes: s.nodes.map((n) => {
      if (n.id !== id) return n;
      const next = { ...n, ...patch };
      if (patch.parentId !== undefined && (patch.parentId ?? null) !== (n.parentId ?? null)) {
        next.sortOrder = appendOrder(siblingsIn(s.nodes, patch.parentId ?? null));
      }
      return next;
    }),
  };
}

/** Delete: children take the node's place under its parent; tasks lose lead/owner/createdBy. */
export function deleteNode(s: AppState, id: string): AppState {
  const node = s.nodes.find((n) => n.id === id);
  if (!node) return s;
  const parent = node.parentId ?? null;
  const sibs = siblingsIn(s.nodes, parent).sort((a, b) => a.sortOrder - b.sortOrder).map((n) => n.id);
  const kids = s.nodes.filter((n) => n.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder).map((n) => n.id);
  const idx = sibs.indexOf(id);
  const ordered = kids.length ? [...sibs.slice(0, idx), ...kids, ...sibs.slice(idx + 1)] : [];
  const order = new Map(ordered.map((nid, k) => [nid, k + 1]));
  return {
    ...s,
    nodes: s.nodes
      .filter((n) => n.id !== id)
      .map((n) => (order.has(n.id) ? { ...n, parentId: parent, sortOrder: order.get(n.id)! } : n)),
    tasks: s.tasks.map((t) =>
      t.leadId === id || t.ownerId === id || t.createdBy === id
        ? { ...t, leadId: t.leadId === id ? null : t.leadId, ownerId: t.ownerId === id ? null : t.ownerId, createdBy: t.createdBy === id ? null : t.createdBy }
        : t,
    ),
    printItems: s.printItems.map((i) => (i.createdBy === id ? { ...i, createdBy: null } : i)),
  };
}

/** Move a node (+subtree). Returns the state unchanged when the move would create a cycle. */
export function moveNode(
  s: AppState,
  input: { id: string; parentId: string | null; beforeId?: string | null; afterId?: string | null; adoptChildren?: boolean },
): AppState {
  const node = s.nodes.find((n) => n.id === input.id);
  if (!node) return s;
  if (input.parentId && descendantsOf(s.nodes, input.id).has(input.parentId)) return s;
  const plan = planInsert(siblingsIn(s.nodes, input.parentId), input.id, { beforeId: input.beforeId, afterId: input.afterId });
  const upd = new Map(plan.updates.map((u) => [u.id, u.sortOrder]));
  const adopt = input.adoptChildren && node.kind === "unit" && input.parentId;
  return {
    ...s,
    nodes: s.nodes.map((n) => {
      if (n.id === input.id) return { ...n, parentId: input.parentId, sortOrder: upd.get(n.id)! };
      let next = n;
      if (upd.has(n.id)) next = { ...next, sortOrder: upd.get(n.id)! };
      if (adopt && n.parentId === input.parentId && n.kind === "person") next = { ...next, parentId: input.id };
      return next;
    }),
  };
}

/** Duplicate a person (" (kopie)") right after the original. */
export function duplicatePerson(s: AppState, srcId: string, newId: string): AppState {
  const src = s.nodes.find((n) => n.id === srcId);
  if (!src) return s;
  const copy: OrgNode = { ...src, id: newId, name: `${src.name} (kopie)`, createdAt: new Date().toISOString() };
  const nodes = [...s.nodes, copy];
  const plan = planInsert(siblingsIn(nodes, src.parentId ?? null), newId, { afterId: srcId });
  const upd = new Map(plan.updates.map((u) => [u.id, u.sortOrder]));
  return { ...s, nodes: nodes.map((n) => (upd.has(n.id) ? { ...n, sortOrder: upd.get(n.id)! } : n)) };
}

// ---------------------------------------------------------------- misc
export function setBudget(s: AppState, patch: Partial<Budget>): AppState {
  return { ...s, budget: { ...s.budget, ...patch } };
}

export function addAttachment(s: AppState, a: Attachment): AppState {
  return { ...s, attachments: [...s.attachments.filter((x) => x.id !== a.id), a] };
}

export function removeAttachment(s: AppState, id: string): AppState {
  return { ...s, attachments: s.attachments.filter((a) => a.id !== id) };
}
