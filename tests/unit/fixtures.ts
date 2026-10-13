import type { AppState, BoardColumn, OrgNode, PrintItem, Task } from "@/lib/types";

let n = 0;
const id = (p: string) => `${p}-${++n}`;

export function person(over: Partial<OrgNode> = {}): OrgNode {
  return {
    id: id("p"),
    kind: "person",
    name: "Petra Horáková",
    role: null,
    info: null,
    budget: null,
    budgetColor: "blue",
    avatarColor: null,
    areas: [],
    color: null,
    parentId: null,
    sortOrder: 1,
    createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}.000Z`,
    ...over,
  };
}

export function unit(over: Partial<OrgNode> = {}): OrgNode {
  return person({ kind: "unit", name: "Mládež", color: "#00588e", ...over });
}

export function task(over: Partial<Task> = {}): Task {
  return {
    id: id("t"),
    columnId: "c1",
    category: "Muži A",
    title: "Plakát",
    description: "",
    leadId: null,
    ownerId: null,
    dueDate: null,
    sortOrder: 1,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export function printItem(over: Partial<PrintItem> = {}): PrintItem {
  return {
    id: id("i"),
    columnId: "p1",
    typeId: "ty1",
    title: "Letáky",
    description: "",
    quantity: null,
    price: null,
    paidByClub: false,
    realizationDate: null,
    archived: false,
    sortOrder: 1,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export const columns: BoardColumn[] = [
  { id: "c1", boardId: "tasks", title: "Nápady", sortOrder: 1 },
  { id: "c2", boardId: "tasks", title: "K řešení", sortOrder: 2 },
  { id: "c5", boardId: "tasks", title: "Hotovo", sortOrder: 5 },
  { id: "p1", boardId: "print", title: "Poptávka", sortOrder: 1 },
  { id: "p3", boardId: "print", title: "Hotovo", sortOrder: 3 },
];

export function state(over: Partial<AppState> = {}): AppState {
  return {
    nodes: [],
    columns,
    tasks: [],
    printTypes: [
      { id: "ty1", name: "Letáky", sortOrder: 1 },
      { id: "ty2", name: "Vizitky", sortOrder: 2 },
    ],
    printItems: [],
    closures: [],
    attachments: [],
    budget: { spolek: 0, asAmount: 0, monthlyInstallment: 7500, installmentFrom: null },
    ...over,
  };
}
