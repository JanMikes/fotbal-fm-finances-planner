/**
 * Typed browser API client. Every mutation sends `X-Client-Id` (this tab's id) so realtime events caused by this
 * tab can be ignored. A 401 redirects to /login.
 */
import type { YearReport } from "./report";
import type {
  AppState,
  Attachment,
  BoardColumn,
  Budget,
  OrgNode,
  ParentKind,
  PrintItem,
  PrintType,
  PrintYearClosure,
  Task,
} from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function newId(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // RFC 4122 v4 fallback (randomUUID needs a secure context; plain-http LAN access lacks it)
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Generate a UUID for client-side creates (optimistic entities keep their final id). */
export const uuid = newId;

/** Per-tab client id. */
export const CLIENT_ID: string = typeof window === "undefined" ? "server" : newId();

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function request<T>(method: Method, path: string, body?: unknown, init?: { signal?: AbortSignal }): Promise<T> {
  const headers: Record<string, string> = { "X-Client-Id": CLIENT_ID, Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload, credentials: "same-origin", cache: "no-store", signal: init?.signal });
  if (res.status === 401 && typeof window !== "undefined") {
    // full reload on purpose: the proxy serves /login
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
    throw new ApiError(401, "unauthorized", "Přihlaste se.");
  }
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, d.error ?? "http_error", d.message ?? `HTTP ${res.status}`, d.details);
  }
  return data as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return { message: t };
  }
}

// ---------------------------------------------------------------- payload types
export type NodeInput = Partial<Omit<OrgNode, "id" | "kind" | "sortOrder" | "createdAt">> & { name?: string };
export type CreateNodeInput = NodeInput & {
  id?: string;
  kind: OrgNode["kind"];
  name: string;
  beforeId?: string | null;
  afterId?: string | null;
};
export interface MoveNodeInput {
  id: string;
  parentId: string | null;
  beforeId?: string | null;
  afterId?: string | null;
  adoptChildren?: boolean;
}
export type CreateTaskInput = Pick<Task, "columnId" | "category" | "title"> &
  Partial<Pick<Task, "id" | "description" | "leadId" | "ownerId" | "dueDate" | "createdBy">>;
export type UpdateTaskInput = Partial<Pick<Task, "columnId" | "category" | "title" | "description" | "leadId" | "ownerId" | "dueDate">>;
export type CreatePrintItemInput = Pick<PrintItem, "columnId" | "typeId" | "title"> &
  Partial<Pick<PrintItem, "id" | "description" | "quantity" | "price" | "paidByClub" | "realizationDate" | "createdBy">>;
export type UpdatePrintItemInput = Partial<
  Pick<PrintItem, "columnId" | "typeId" | "title" | "description" | "quantity" | "price" | "paidByClub" | "realizationDate">
>;
export interface MoveInput {
  columnId: string;
  /** Insert before this item; null/undefined = append to the end of the column. */
  beforeId?: string | null;
}
export type BudgetInput = Partial<Omit<Budget, "installmentFrom">> & { installmentFrom?: string | null };

// ---------------------------------------------------------------- endpoints
export const api = {
  state: (signal?: AbortSignal) => request<AppState>("GET", "/api/state", undefined, { signal }),

  // org tree
  createNode: (input: CreateNodeInput) => request<OrgNode>("POST", "/api/org-nodes", input),
  updateNode: (id: string, input: NodeInput) => request<OrgNode>("PATCH", `/api/org-nodes/${id}`, input),
  deleteNode: (id: string) => request<{ ok: true }>("DELETE", `/api/org-nodes/${id}`),
  moveNode: (input: MoveNodeInput) => request<OrgNode>("PATCH", "/api/org/move", input),
  duplicateNode: (id: string, newId?: string) => request<{ nodes: OrgNode[] }>("POST", `/api/org-nodes/${id}/duplicate`, { id: newId }),

  // columns (tasks board only)
  createColumn: (title: string, id?: string) => request<BoardColumn>("POST", "/api/columns", { id, boardId: "tasks", title }),
  renameColumn: (id: string, title: string) => request<BoardColumn>("PATCH", `/api/columns/${id}`, { title }),
  deleteColumn: (id: string) => request<{ ok: true; movedTo: string; movedCount: number }>("DELETE", `/api/columns/${id}`),

  // tasks
  createTask: (input: CreateTaskInput) => request<Task>("POST", "/api/tasks", input),
  updateTask: (id: string, input: UpdateTaskInput) => request<Task>("PATCH", `/api/tasks/${id}`, input),
  moveTask: (id: string, input: MoveInput) => request<Task>("PATCH", `/api/tasks/${id}/move`, input),
  duplicateTask: (id: string, input: { id?: string; createdBy?: string | null } = {}) =>
    request<{ task: Task; attachments: Attachment[] }>("POST", `/api/tasks/${id}/duplicate`, input),
  deleteTask: (id: string) => request<{ ok: true }>("DELETE", `/api/tasks/${id}`),

  // print
  createPrintType: (name: string, id?: string) => request<PrintType>("POST", "/api/print-types", { id, name }),
  renamePrintType: (id: string, name: string) => request<PrintType>("PATCH", `/api/print-types/${id}`, { name }),
  deletePrintType: (id: string) => request<{ ok: true; movedTo: string; movedCount: number }>("DELETE", `/api/print-types/${id}`),
  createPrintItem: (input: CreatePrintItemInput) => request<PrintItem>("POST", "/api/print-items", input),
  updatePrintItem: (id: string, input: UpdatePrintItemInput) => request<PrintItem>("PATCH", `/api/print-items/${id}`, input),
  movePrintItem: (id: string, input: MoveInput) => request<PrintItem>("PATCH", `/api/print-items/${id}/move`, input),
  duplicatePrintItem: (id: string, input: { id?: string; createdBy?: string | null } = {}) =>
    request<{ printItem: PrintItem; attachments: Attachment[] }>("POST", `/api/print-items/${id}/duplicate`, input),
  deletePrintItem: (id: string) => request<{ ok: true }>("DELETE", `/api/print-items/${id}`),
  closeYear: (year: number) => request<{ closure: PrintYearClosure; archivedCount: number }>("POST", `/api/print/years/${year}/close`),
  reopenYear: (year: number) => request<{ unarchivedCount: number }>("DELETE", `/api/print/years/${year}/close`),
  yearReport: (year: number) => request<YearReport>("GET", `/api/print/years/${year}/report`),

  // budget
  updateBudget: (input: BudgetInput) => request<Budget>("PUT", "/api/budget", input),

  // attachments
  uploadFile: (parentKind: ParentKind, parentId: string, file: File, id?: string) => {
    const fd = new FormData();
    fd.set("parentKind", parentKind);
    fd.set("parentId", parentId);
    if (id) fd.set("id", id);
    fd.set("file", file);
    return request<Attachment>("POST", "/api/attachments", fd);
  },
  addLink: (parentKind: ParentKind, parentId: string, url: string, name = "", id?: string) =>
    request<Attachment>("POST", "/api/attachments", { id, kind: "link", parentKind, parentId, url, name }),
  deleteAttachment: (id: string) => request<{ ok: true }>("DELETE", `/api/attachments/${id}`),
};
