/**
 * High-level mutations for the UI: optimistic update + API call (+ rollback via the store).
 * Every action returns the server response; it rejects (after rollback) on error so callers can show a message.
 * Creates register their id (`creates`) and every request lists the ids it targets or references (`after`), so a
 * request never overtakes the still-in-flight create of an entity it needs (see `AppStore.mutate`).
 */
import { api, uuid, type BudgetInput, type RequestInit2, type CreateNodeInput, type MoveNodeInput, type NodeInput, type UpdatePrintItemInput, type UpdateTaskInput } from "../api";
import type { Attachment, OrgNode, ParentKind, PrintItem, Task } from "../types";
import * as o from "./optimistic";
import type { AppStore } from "./store";

const now = () => new Date().toISOString();

export function createActions(store: AppStore) {
  const m = store.mutate.bind(store);

  return {
    refetch: () => store.load(),

    // ------------------------------------------------------------ tasks
    createTask(input: Omit<Task, "id" | "sortOrder" | "createdAt"> & { id?: string }) {
      const id = input.id ?? uuid();
      const task = { ...input, id, createdAt: now() };
      return m((s) => o.addTask(s, task), () => api.createTask({ ...input, id }), {
        creates: [id],
        after: [input.columnId, input.leadId, input.ownerId],
      });
    },
    updateTask(id: string, patch: UpdateTaskInput) {
      return m((s) => o.patchTask(s, id, patch), () => api.updateTask(id, patch), {
        after: [id, patch.columnId, patch.leadId, patch.ownerId],
      });
    },
    /** Move a card; `beforeId` = the next VISIBLE card in the target column, or null to append. */
    moveTask(id: string, columnId: string, beforeId: string | null) {
      return m((s) => o.moveTask(s, id, columnId, beforeId), () => api.moveTask(id, { columnId, beforeId }), {
        after: [id, columnId, beforeId],
      });
    },
    duplicateTask(id: string, createdBy: string | null) {
      const newId = uuid();
      return m(
        (s) => o.duplicateTask(s, id, { id: newId, createdBy, createdAt: now() }),
        () => api.duplicateTask(id, { id: newId, createdBy }),
        { creates: [newId], after: [id] },
      );
    },
    deleteTask(id: string) {
      return m((s) => o.removeTask(s, id), () => api.deleteTask(id), { after: [id] });
    },

    // ------------------------------------------------------------ columns
    createColumn(title: string) {
      const id = uuid();
      return m((s) => o.addColumn(s, { id, boardId: "tasks", title }), () => api.createColumn(title, id), { creates: [id] });
    },
    renameColumn(id: string, title: string) {
      return m((s) => o.renameColumn(s, id, title), () => api.renameColumn(id, title), { after: [id] });
    },
    deleteColumn(id: string) {
      return m((s) => o.deleteColumn(s, id), () => api.deleteColumn(id), { after: [id] });
    },

    // ------------------------------------------------------------ print
    createPrintItem(input: Omit<PrintItem, "id" | "sortOrder" | "createdAt" | "archived"> & { id?: string }) {
      const id = input.id ?? uuid();
      return m((s) => o.addPrintItem(s, { ...input, id, archived: false, createdAt: now() }), () => api.createPrintItem({ ...input, id }), {
        creates: [id],
        after: [input.typeId],
      });
    },
    updatePrintItem(id: string, patch: UpdatePrintItemInput) {
      return m((s) => o.patchPrintItem(s, id, patch), () => api.updatePrintItem(id, patch), { after: [id, patch.typeId] });
    },
    movePrintItem(id: string, columnId: string, beforeId: string | null) {
      return m((s) => o.movePrintItem(s, id, columnId, beforeId), () => api.movePrintItem(id, { columnId, beforeId }), {
        after: [id, beforeId],
      });
    },
    duplicatePrintItem(id: string, createdBy: string | null) {
      const newId = uuid();
      return m(
        (s) => o.duplicatePrintItem(s, id, { id: newId, createdBy, createdAt: now() }),
        () => api.duplicatePrintItem(id, { id: newId, createdBy }),
        { creates: [newId], after: [id] },
      );
    },
    deletePrintItem(id: string) {
      return m((s) => o.removePrintItem(s, id), () => api.deletePrintItem(id), { after: [id] });
    },
    createPrintType(name: string) {
      const id = uuid();
      return m((s) => o.addPrintType(s, { id, name }), () => api.createPrintType(name, id), { creates: [id] });
    },
    renamePrintType(id: string, name: string) {
      return m((s) => o.renamePrintType(s, id, name), () => api.renamePrintType(id, name), { after: [id] });
    },
    deletePrintType(id: string) {
      return m((s) => o.deletePrintType(s, id), () => api.deletePrintType(id), { after: [id] });
    },
    closeYear(year: number) {
      return m((s) => o.closeYear(s, year), () => api.closeYear(year));
    },
    reopenYear(year: number) {
      return m((s) => o.reopenYear(s, year), () => api.reopenYear(year));
    },

    // ------------------------------------------------------------ org tree
    createNode(input: CreateNodeInput) {
      const id = input.id ?? uuid();
      const node: OrgNode = {
        id,
        kind: input.kind,
        name: input.name,
        role: input.role ?? null,
        info: input.info ?? null,
        budget: input.budget ?? null,
        budgetColor: input.budgetColor ?? "blue",
        avatarColor: input.avatarColor ?? null,
        areas: input.areas ?? [],
        color: input.color ?? null,
        parentId: input.parentId ?? null,
        sortOrder: 0,
        createdAt: now(),
      };
      return m(
        (s) => {
          const added = o.addNode(s, { ...node, sortOrder: undefined });
          return input.beforeId || input.afterId
            ? o.moveNode(added, { id, parentId: node.parentId, beforeId: input.beforeId, afterId: input.afterId })
            : added;
        },
        () => api.createNode({ ...input, id }),
        { creates: [id], after: [input.parentId, input.beforeId, input.afterId] },
      );
    },
    updateNode(id: string, patch: NodeInput) {
      return m((s) => o.patchNode(s, id, patch), () => api.updateNode(id, patch), { after: [id, patch.parentId] });
    },
    deleteNode(id: string) {
      return m((s) => o.deleteNode(s, id), () => api.deleteNode(id), { after: [id] });
    },
    /** Drag & drop in the tree (child / before / after / root zone / category insert-between via adoptChildren). */
    moveNode(input: MoveNodeInput) {
      return m((s) => o.moveNode(s, input), () => api.moveNode(input), {
        after: [input.id, input.parentId, input.beforeId, input.afterId],
      });
    },
    /** Person: optimistic copy, returns the created nodes. Unit (recursive, units only): server-driven. */
    duplicateNode(id: string) {
      const node = store.getSnapshot().state?.nodes.find((n) => n.id === id);
      if (node?.kind === "person") {
        const newId = uuid();
        return m((s) => o.duplicatePerson(s, id, newId), () => api.duplicateNode(id, newId), { creates: [newId], after: [id] });
      }
      return m(null, () => api.duplicateNode(id), { after: [id] });
    },

    // ------------------------------------------------------------ budget
    /** `keepalive` lets the request outlive the page (flush on `pagehide`). */
    updateBudget(patch: BudgetInput, opts: RequestInit2 = {}) {
      return m((s) => o.setBudget(s, patch), () => api.updateBudget(patch, { keepalive: opts.keepalive }));
    },

    // ------------------------------------------------------------ attachments (parent must already exist on the server)
    async uploadFile(parentKind: ParentKind, parentId: string, file: File): Promise<Attachment> {
      const att = await m(null, () => api.uploadFile(parentKind, parentId, file), { after: [parentId] });
      return att;
    },
    addLink(parentKind: ParentKind, parentId: string, url: string, name = "") {
      return m(null, () => api.addLink(parentKind, parentId, url, name), { after: [parentId] });
    },
    deleteAttachment(id: string) {
      return m((s) => o.removeAttachment(s, id), () => api.deleteAttachment(id));
    },
  };
}

export type Actions = ReturnType<typeof createActions>;
