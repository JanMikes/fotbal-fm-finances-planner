import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeEach } from "vitest";
import type { AppState } from "@/lib/types";
import { closeDb } from "@/server/db/client";

const SEED_SQL = readFileSync(path.resolve(__dirname, "../../drizzle/0001_seed_structural_defaults.sql"), "utf8").replaceAll(
  "--> statement-breakpoint",
  "",
);

let admin: pg.Pool | null = null;
export function adminPool(): pg.Pool {
  return (admin ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }));
}

/** Empty all tables and re-apply the structural seed migration. */
export async function resetData() {
  await adminPool().query(
    "truncate attachments, tasks, print_items, print_types, print_year_closures, board_columns, boards, org_nodes, budget restart identity cascade",
  );
  await adminPool().query(SEED_SQL);
}

/** Per-file hooks: clean data before each test, close pools after the file. */
export function withCleanDb() {
  beforeEach(resetData);
  afterAll(async () => {
    await closeDb();
    await admin?.end();
    admin = null;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteHandler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response> | Response;

export interface CallResult<T> {
  status: number;
  body: T;
  headers: Headers;
}

/** Invoke a route handler directly. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function call<T = any>(
  handler: RouteHandler,
  opts: { method?: string; path?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<CallResult<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const req = new Request(`http://127.0.0.1:3000${opts.path ?? "/"}`, { method: opts.method ?? "GET", headers, body });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const isJson = res.headers.get("content-type")?.includes("json");
  const text = isJson ? await res.text() : "";
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T, headers: res.headers };
}

export async function getState(): Promise<AppState> {
  const { GET } = await import("@/app/api/state/route");
  return (await call<AppState>(GET)).body;
}

export const taskCols = (s: AppState) => s.columns.filter((c) => c.boardId === "tasks").sort((a, b) => a.sortOrder - b.sortOrder);
export const printCols = (s: AppState) => s.columns.filter((c) => c.boardId === "print").sort((a, b) => a.sortOrder - b.sortOrder);
export const order = <T extends { id: string; sortOrder: number }>(items: T[]) =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.id);
