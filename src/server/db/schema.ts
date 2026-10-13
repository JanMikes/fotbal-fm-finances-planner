import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Org tree: one table for both node kinds (spec §2 recommendation).
 *  - kind 'person' = team member (name, role, info, budget, budget_color, avatar_color, areas)
 *  - kind 'unit'   = category node (name, color)
 * parent_id points to any node (person or unit); null = top level.
 */
export const orgNodes = pgTable(
  "org_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    // person fields
    role: text("role"),
    info: text("info"),
    budget: integer("budget"),
    budgetColor: text("budget_color").notNull().default("blue"),
    avatarColor: text("avatar_color"),
    areas: text("areas").array().notNull().default(sql`'{}'::text[]`),
    // unit fields
    color: text("color"),
    // common
    parentId: uuid("parent_id").references((): AnyPgColumn => orgNodes.id, { onDelete: "set null" }),
    sortOrder: numeric("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [
    check("org_nodes_kind_check", sql`${t.kind} in ('person','unit')`),
    check("org_nodes_budget_color_check", sql`${t.budgetColor} in ('blue','green','red')`),
    check("org_nodes_not_own_parent", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    index("org_nodes_parent_idx").on(t.parentId, t.sortOrder),
  ],
);

export const boards = pgTable("boards", {
  id: text("id").primaryKey(), // 'tasks' | 'print'
});

export const boardColumns = pgTable(
  "board_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortOrder: numeric("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [index("board_columns_board_idx").on(t.boardId, t.sortOrder)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    columnId: uuid("column_id")
      .notNull()
      .references(() => boardColumns.id, { onDelete: "restrict" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    leadId: uuid("lead_id").references(() => orgNodes.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => orgNodes.id, { onDelete: "set null" }),
    dueDate: date("due_date", { mode: "string" }),
    sortOrder: numeric("sort_order", { mode: "number" }).notNull().default(0),
    createdBy: uuid("created_by").references(() => orgNodes.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [index("tasks_column_idx").on(t.columnId, t.sortOrder)],
);

export const printTypes = pgTable("print_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: numeric("sort_order", { mode: "number" }).notNull().default(0),
});

export const printItems = pgTable(
  "print_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    columnId: uuid("column_id")
      .notNull()
      .references(() => boardColumns.id, { onDelete: "restrict" }),
    typeId: uuid("type_id")
      .notNull()
      .references(() => printTypes.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    quantity: integer("quantity"),
    price: integer("price"),
    paidByClub: boolean("paid_by_club").notNull().default(false),
    realizationDate: date("realization_date", { mode: "string" }),
    archived: boolean("archived").notNull().default(false),
    sortOrder: numeric("sort_order", { mode: "number" }).notNull().default(0),
    createdBy: uuid("created_by").references(() => orgNodes.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [index("print_items_column_idx").on(t.columnId, t.sortOrder)],
);

export const printYearClosures = pgTable("print_year_closures", {
  year: integer("year").primaryKey(),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

/** Attachments shared by tasks and print items (polymorphic parent, cleaned up by the service layer). */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentKind: text("parent_kind").notNull(),
    parentId: uuid("parent_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull().default(""),
    /** External URL for links; null for files. */
    url: text("url"),
    /** Random file name inside UPLOAD_DIR for files; null for links. Never exposed to clients. */
    storageKey: text("storage_key"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    mime: text("mime"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [
    check("attachments_parent_kind_check", sql`${t.parentKind} in ('task','print')`),
    check("attachments_kind_check", sql`${t.kind} in ('file','link')`),
    index("attachments_parent_idx").on(t.parentKind, t.parentId),
  ],
);

/** Singleton (id = 1). */
export const budget = pgTable(
  "budget",
  {
    id: integer("id").primaryKey().default(1),
    spolek: integer("spolek").notNull().default(0),
    asAmount: integer("as_amount").notNull().default(0),
    monthlyInstallment: integer("monthly_installment").notNull().default(7500),
    /** First day of the month from which the installment is deducted (inclusive). */
    installmentFrom: date("installment_from", { mode: "string" }),
  },
  (t) => [check("budget_singleton", sql`${t.id} = 1`)],
);
