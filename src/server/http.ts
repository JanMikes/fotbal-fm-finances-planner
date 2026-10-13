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

/** Whether the request declares a JSON body (`application/json`, optionally with parameters). */
export function isJsonContentType(req: Request): boolean {
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return type === "application/json";
}

/**
 * Parse + validate a JSON body. A non-empty body MUST be sent as `application/json` (415 otherwise) — this blocks
 * `<form enctype="text/plain">` CSRF payloads. An empty body (e.g. POST …/close without a body) is treated as `{}`.
 */
/** JSON bodies are small (longest field: 10 000 chars); anything bigger is rejected while streaming. */
export const MAX_JSON_BYTES = 256 * 1024;

const payloadTooLarge = () => new HttpError(413, "too_large", "Požadavek je příliš velký.");

/** Read the body as UTF-8 text, aborting once it exceeds `maxBytes` (never buffers more than that). */
export async function readTextCapped(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge();
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw payloadTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  let text: string;
  try {
    text = await readTextCapped(req, MAX_JSON_BYTES);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badRequest("Neplatný požadavek.");
  }
  if (text.trim() && !isJsonContentType(req)) {
    throw new HttpError(415, "unsupported_media_type", "Data musí být odeslána jako JSON (Content-Type: application/json).");
  }
  try {
    body = text.trim() ? JSON.parse(text) : {};
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
    // Surface a custom Czech message (e.g. the date range) when the issue carries one.
    const custom = err.issues.find((i) => i.code === "custom" && i.message)?.message;
    return json({ error: "validation", message: custom ?? "Neplatná data.", details: err.issues }, 400);
  }
  const pgErr = err as PgError;
  if (pgErr && typeof pgErr === "object" && typeof pgErr.code === "string") {
    if (pgErr.code === "23505") return json({ error: "conflict", message: "Záznam již existuje.", details: pgErr.constraint }, 409);
    if (pgErr.code === "23503") return json({ error: "bad_reference", message: "Odkazovaný záznam neexistuje.", details: pgErr.constraint }, 400);
    if (pgErr.code === "23514") return json({ error: "validation", message: "Neplatná data.", details: pgErr.constraint }, 400);
    if (pgErr.code === "22P02") return json({ error: "validation", message: "Neplatný formát hodnoty." }, 400);
    if (pgErr.code === "40P01" || pgErr.code === "40001") {
      return json({ error: "conflict", message: "Souběžná změna — zkuste to prosím znovu." }, 409);
    }
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
/** Accepted year range for every date (a typo year such as 0026 would break the yearly report). */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
export const DATE_RANGE_MESSAGE = `Datum musí být mezi roky ${MIN_YEAR} a ${MAX_YEAR}.`;
export const zIsoDate = z.iso.date().refine((s) => {
  const y = Number(s.slice(0, 4));
  return y >= MIN_YEAR && y <= MAX_YEAR;
}, DATE_RANGE_MESSAGE);
/** Integer Kč / ks; accepts numbers or free text (digits are extracted like the prototype). */
export const zMoney = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return v === "" ? null : v;
  if (typeof v === "number") return v;
  const d = String(v).replace(/\D/g, "");
  return d ? Number(d) : null;
}, z.number().int().min(0).max(2_000_000_000).nullable());
export const zTrimmed = (max: number) => z.string().trim().max(max);
export const zRequiredText = (max: number) => z.string().trim().min(1, "Povinné pole.").max(max);
