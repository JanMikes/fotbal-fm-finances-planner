/** Route-handler plumbing: JSON responses, zod parsing, error mapping. */
import { z, ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
export const notFound = (message = "Nenalezeno.") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Mutation context passed to services. */
export interface Ctx {
  /** Value of the `X-Client-Id` header; echoed in realtime events so the originating tab can ignore them. */
  clientId: string | null;
}

export function ctxFrom(req: Request): Ctx {
  const raw = req.headers.get("x-client-id");
  return { clientId: raw && raw.length <= 100 ? raw : null };
}

const snakeToCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Accept snake_case keys too (e.g. `parent_id`, `before_id` as written in the spec). Top-level only. */
export function camelizeKeys(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [snakeToCamel(k), val]));
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("Neplatný JSON.");
  }
  return schema.parse(camelizeKeys(body));
}

export function parseParam<T extends z.ZodType>(value: unknown, schema: T, name = "id"): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(404, "not_found", `Neplatný parametr ${name}.`);
  return r.data;
}

type PgError = { code?: string; constraint?: string; detail?: string };

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) }, err.status);
  }
  if (err instanceof ZodError) {
    return json({ error: "validation", message: "Neplatná data.", details: err.issues }, 400);
  }
  const pgErr = err as PgError;
  if (pgErr && typeof pgErr === "object" && typeof pgErr.code === "string") {
    if (pgErr.code === "23505") return json({ error: "conflict", message: "Záznam již existuje.", details: pgErr.constraint }, 409);
    if (pgErr.code === "23503") return json({ error: "bad_reference", message: "Odkazovaný záznam neexistuje.", details: pgErr.constraint }, 400);
    if (pgErr.code === "23514") return json({ error: "validation", message: "Neplatná data.", details: pgErr.constraint }, 400);
    if (pgErr.code === "22P02") return json({ error: "validation", message: "Neplatný formát hodnoty." }, 400);
  }
  // drizzle wraps driver errors in `cause`
  const cause = (err as { cause?: unknown })?.cause;
  if (cause && cause !== err && typeof cause === "object" && "code" in cause) return errorResponse(cause);
  console.error("[api] unhandled error", err);
  return json({ error: "internal", message: "Interní chyba serveru." }, 500);
}

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

/** Wrap a route handler with uniform error handling. */
export function route<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<Response>): Handler<P> {
  return async (req, ctx) => {
    try {
      return await fn(req, (await ctx?.params) ?? ({} as P));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

// ---------------------------------------------------------------- shared zod pieces
export const zId = z.uuid();
export const zIsoDate = z.iso.date();
/** Integer Kč / ks; accepts numbers or free text (digits are extracted like the prototype). */
export const zMoney = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return v === "" ? null : v;
  if (typeof v === "number") return v;
  const d = String(v).replace(/\D/g, "");
  return d ? Number(d) : null;
}, z.number().int().min(0).max(2_000_000_000).nullable());
export const zTrimmed = (max: number) => z.string().trim().max(max);
export const zRequiredText = (max: number) => z.string().trim().min(1, "Povinné pole.").max(max);
