/** Shared domain types — the exact JSON shapes returned by the API (camelCase). */

export type NodeKind = "person" | "unit";
export type BudgetColor = "blue" | "green" | "red";
export type BoardId = "tasks" | "print";
export type ParentKind = "task" | "print";
export type AttachmentKind = "file" | "link";

/** Org tree node. Person-only fields are null/empty on units and vice versa. */
export interface OrgNode {
  id: string;
  kind: NodeKind;
  name: string;
  role: string | null;
  info: string | null;
  /** Kč, integer. */
  budget: number | null;
  budgetColor: BudgetColor;
  avatarColor: string | null;
  areas: string[];
  /** Unit colour (hex). */
  color: string | null;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface BoardColumn {
  id: string;
  boardId: BoardId;
  title: string;
  sortOrder: number;
}

export interface Task {
  id: string;
  columnId: string;
  category: string;
  title: string;
  description: string;
  leadId: string | null;
  ownerId: string | null;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
}

export interface PrintType {
  id: string;
  name: string;
  sortOrder: number;
}

export interface PrintItem {
  id: string;
  columnId: string;
  typeId: string;
  title: string;
  description: string;
  quantity: number | null;
  /** Kč, integer; null = „Bez ceny". */
  price: number | null;
  paidByClub: boolean;
  /** "YYYY-MM-DD" */
  realizationDate: string | null;
  archived: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
}

export interface PrintYearClosure {
  year: number;
  closedAt: string;
}

export interface Attachment {
  id: string;
  parentKind: ParentKind;
  parentId: string;
  kind: AttachmentKind;
  name: string;
  /** Link: external URL. File: authenticated download URL `/api/attachments/:id/file`. */
  url: string;
  sizeBytes: number | null;
  mime: string | null;
  createdAt: string;
}

export interface Budget {
  spolek: number;
  asAmount: number;
  monthlyInstallment: number;
  /** "YYYY-MM-01" — first month the installment is deducted (inclusive); null = never. */
  installmentFrom: string | null;
}

/** Everything the SPA needs (GET /api/state). Arrays are sorted by sortOrder (nodes: by parent, then sortOrder). */
export interface AppState {
  nodes: OrgNode[];
  columns: BoardColumn[];
  tasks: Task[];
  printTypes: PrintType[];
  printItems: PrintItem[];
  closures: PrintYearClosure[];
  attachments: Attachment[];
  budget: Budget;
}

/** Realtime event pushed over SSE (`event: change`). */
export interface ChangeEvent {
  entity: "org_node" | "column" | "task" | "print_type" | "print_item" | "print_year" | "budget" | "attachment";
  op: "insert" | "update" | "delete" | "move" | "duplicate" | "close" | "reopen";
  id: string | number | null;
  clientId: string | null;
}
