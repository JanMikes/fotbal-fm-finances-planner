/** Attachments: files stored on disk in UPLOAD_DIR under random names; links stored as rows. */
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import busboy from "busboy";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import type { Attachment, ParentKind } from "@/lib/types";
import { getDb, type DbOrTx } from "../db/client";
import { attachments, printItems, tasks } from "../db/schema";
import { env } from "../env";
import { badRequest, HttpError, notFound, zId, zTrimmed, type Ctx } from "../http";
import { notify } from "../notify";
import { mapAttachment } from "./mappers";

export const linkSchema = z.object({
  id: zId.optional(),
  kind: z.literal("link"),
  parentKind: z.enum(["task", "print"]),
  parentId: zId,
  url: z.string().trim().min(1, "Zadejte odkaz.").max(2000),
  name: zTrimmed(300).optional(),
});

const uploadMetaSchema = z.object({
  id: zId.optional(),
  parentKind: z.enum(["task", "print"]),
  parentId: zId,
});

function uploadDir(): string {
  return env.uploadDir;
}

function newStorageKey(): string {
  return randomBytes(24).toString("hex");
}

function storagePath(key: string): string {
  if (!/^[a-f0-9]{48}$/.test(key)) throw new Error("invalid storage key");
  return path.join(uploadDir(), key);
}

/**
 * The parent must exist. FOR SHARE keeps it from being deleted until this transaction commits; deleteTask /
 * deletePrintItem take FOR UPDATE first, so an attachment is never committed for an already-deleted parent.
 */
async function assertParent(tx: DbOrTx, kind: ParentKind, id: string) {
  const table = kind === "task" ? tasks : printItems;
  const [row] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id)).for("share");
  if (!row) throw badRequest(kind === "task" ? "Úkol neexistuje." : "Tiskovina neexistuje.");
}

const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Normalise + validate a link: `https://` is prepended when there is no scheme; only http, https and mailto are
 * accepted (no javascript:, data:, file:, custom app protocols, …). Returns null when invalid.
 */
export function sanitizeLinkUrl(raw: string): string | null {
  const u = raw.trim();
  if (!u || /[\u0000-\u001f\u007f]/.test(u)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(u) && !/^[^:/]+:\d/.test(u) ? u : `https://${u}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) return null;
  if (parsed.protocol !== "mailto:" && !parsed.hostname) return null;
  if (parsed.protocol === "mailto:" && !parsed.pathname) return null;
  return withScheme;
}

export async function addLink(input: z.infer<typeof linkSchema>, ctx: Ctx): Promise<Attachment> {
  const url = sanitizeLinkUrl(input.url);
  if (!url) throw badRequest("Neplatný odkaz — povolené jsou jen adresy http(s):// a mailto:.");
  return getDb().transaction(async (tx) => {
    await assertParent(tx, input.parentKind, input.parentId);
    const [row] = await tx
      .insert(attachments)
      .values({
        ...(input.id && { id: input.id }),
        parentKind: input.parentKind,
        parentId: input.parentId,
        kind: "link",
        name: input.name ?? "",
        url,
      })
      .returning();
    await notify(tx, ctx, "attachment", "insert", row.id);
    return mapAttachment(row);
  });
}

/** Generous allowance for multipart boundaries + the small text fields around the file. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const tooLarge = () => new HttpError(413, "too_large", "Soubor je příliš velký (max. 25 MB).");

interface ParsedUpload {
  fields: Record<string, string>;
  file: { key: string; name: string; mime: string; size: number } | null;
}

/**
 * Stream a multipart upload straight to disk (never buffered in memory). Enforces MAX_UPLOAD_BYTES early via
 * Content-Length when present and always via a streaming byte cap (also for chunked bodies). One file field
 * (`file`) per request; other file parts are discarded.
 */
async function receiveMultipart(req: Request): Promise<ParsedUpload> {
  const contentType = req.headers.get("content-type") ?? "";
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) throw tooLarge();
  if (!req.body) throw badRequest("Chybí soubor (pole „file“).");

  let bb: busboy.Busboy;
  try {
    bb = busboy({
      headers: { "content-type": contentType },
      defParamCharset: "utf8", // browsers send UTF-8 filenames
      // busboy emits "limit" when the count REACHES fileSize, so +1 allows exactly MAX_UPLOAD_BYTES
      limits: { files: 1, fileSize: MAX_UPLOAD_BYTES + 1, fields: 10, fieldSize: 1024, parts: 20, headerPairs: 50 },
    });
  } catch {
    throw badRequest("Neplatná multipart data.");
  }
  await mkdir(uploadDir(), { recursive: true });
  const input = Readable.fromWeb(req.body as unknown as NodeWebReadableStream<Uint8Array>);

  const fields: Record<string, string> = {};
  let file: ParsedUpload["file"] = null;
  let written: Promise<void> | null = null;
  let target: string | null = null;
  let failure: HttpError | null = null;
  let fileStream: NodeJS.ReadableStream & { destroy?: (e?: Error) => void } | null = null;

  const done = new Promise<void>((resolve, reject) => {
    const fail = (err: HttpError) => {
      if (failure) return;
      failure = err;
      input.unpipe(bb);
      input.destroy();
      fileStream?.destroy?.(err); // makes the disk pipeline settle (and its partial file gets unlinked below)
      reject(err);
    };
    bb.on("field", (name, value, info) => {
      if (info.valueTruncated || info.nameTruncated) return fail(badRequest("Neplatná multipart data."));
      fields[name] = value;
    });
    bb.on("file", (name, stream, info) => {
      if (name !== "file" || file) {
        stream.resume(); // discard unexpected file parts
        return;
      }
      fileStream = stream;
      const key = newStorageKey();
      target = storagePath(key);
      const entry = { key, name: (info.filename || "soubor").slice(0, 300), mime: info.mimeType || "application/octet-stream", size: 0 };
      file = entry;
      stream.on("data", (chunk: Buffer) => {
        entry.size += chunk.length;
      });
      stream.on("limit", () => fail(tooLarge()));
      written = pipeline(stream, createWriteStream(target, { flags: "wx" })).catch((err) => {
        if (!failure) fail(new HttpError(500, "internal", "Soubor se nepodařilo uložit."));
        throw err;
      });
      written.catch(() => undefined);
    });
    bb.on("partsLimit", () => fail(badRequest("Neplatná multipart data.")));
    bb.on("filesLimit", () => undefined);
    bb.on("fieldsLimit", () => fail(badRequest("Neplatná multipart data.")));
    bb.on("error", () => fail(badRequest("Neplatná multipart data.")));
    input.on("error", () => fail(badRequest("Přenos souboru byl přerušen.")));
    bb.on("close", () => {
      if (!failure) resolve();
    });
  });

  try {
    input.pipe(bb);
    await done;
    if (written) await written;
  } catch (err) {
    if (written) await (written as Promise<void>).catch(() => undefined);
    if (target) await unlink(target).catch(() => undefined);
    throw err instanceof HttpError ? err : badRequest("Neplatná multipart data.");
  }
  return { fields, file };
}

/** Store an uploaded file (multipart form fields: parentKind, parentId, file, optional id). */
export async function uploadFile(req: Request, ctx: Ctx): Promise<Attachment> {
  const { fields, file } = await receiveMultipart(req);
  const cleanup = async () => {
    if (file) await unlink(storagePath(file.key)).catch(() => undefined);
  };
  try {
    const meta = uploadMetaSchema.parse({
      id: fields.id || undefined,
      parentKind: fields.parentKind ?? fields.parent_kind,
      parentId: fields.parentId ?? fields.parent_id,
    });
    if (!file) throw badRequest("Chybí soubor (pole „file“).");
    const f = file;
    return await getDb().transaction(async (tx) => {
      await assertParent(tx, meta.parentKind, meta.parentId);
      const [row] = await tx
        .insert(attachments)
        .values({
          ...(meta.id && { id: meta.id }),
          parentKind: meta.parentKind,
          parentId: meta.parentId,
          kind: "file",
          name: f.name,
          storageKey: f.key,
          sizeBytes: f.size,
          mime: f.mime,
        })
        .returning();
      await notify(tx, ctx, "attachment", "insert", row.id);
      return mapAttachment(row);
    });
  } catch (err) {
    await cleanup();
    throw err;
  }
}

export async function deleteAttachment(id: string, ctx: Ctx): Promise<void> {
  const key = await getDb().transaction(async (tx) => {
    const [row] = await tx.delete(attachments).where(eq(attachments.id, id)).returning();
    if (!row) throw notFound("Příloha nenalezena.");
    await notify(tx, ctx, "attachment", "delete", id);
    return row.storageKey;
  });
  if (key) await unlink(storagePath(key)).catch(() => undefined);
}

/** Delete all attachment rows of the given parents; returns a cleanup() to unlink files AFTER commit. */
export async function deleteAttachmentsOf(tx: DbOrTx, kind: ParentKind, parentIds: string[]): Promise<{ cleanup: () => Promise<void> }> {
  if (!parentIds.length) return { cleanup: async () => undefined };
  const rows = await tx
    .delete(attachments)
    .where(and(eq(attachments.parentKind, kind), inArray(attachments.parentId, parentIds)))
    .returning();
  const keys = rows.map((r) => r.storageKey).filter((k): k is string => !!k);
  return {
    cleanup: async () => {
      await Promise.all(keys.map((k) => unlink(storagePath(k)).catch(() => undefined)));
    },
  };
}

/** Unlink files by storage key (best effort). */
export async function unlinkStorageKeys(keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => unlink(storagePath(k)).catch(() => undefined)));
}

/** Run `fn`; if it throws (e.g. its transaction rolled back), delete the files whose keys were collected. */
export async function withFileRollback<T>(collected: string[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await unlinkStorageKeys(collected);
    throw err;
  }
}

/**
 * Copy attachments (files duplicated on disk) from one parent to another (used by duplicate). New storage keys are
 * pushed to `copiedKeys` so the caller can unlink them if the surrounding transaction fails (withFileRollback).
 */
export async function copyAttachments(
  tx: DbOrTx,
  kind: ParentKind,
  fromId: string,
  toId: string,
  copiedKeys: string[] = [],
): Promise<Attachment[]> {
  const rows = await tx.select().from(attachments).where(and(eq(attachments.parentKind, kind), eq(attachments.parentId, fromId)));
  const out: Attachment[] = [];
  for (const r of rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    let storageKey: string | null = null;
    if (r.kind === "file" && r.storageKey) {
      storageKey = newStorageKey();
      try {
        await copyFile(storagePath(r.storageKey), storagePath(storageKey));
        copiedKeys.push(storageKey);
      } catch {
        continue; // source file missing on disk — skip it
      }
    }
    const { id: _id, createdAt: _c, ...rest } = r;
    void _id;
    void _c;
    const [row] = await tx.insert(attachments).values({ ...rest, parentId: toId, storageKey }).returning();
    out.push(mapAttachment(row));
  }
  return out;
}

const INLINE_MIME = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|text\/plain)$/i;

/** Stream a stored file with the right headers. */
export async function fileResponse(id: string): Promise<Response> {
  const [row] = await getDb().select().from(attachments).where(eq(attachments.id, id));
  if (!row || row.kind !== "file" || !row.storageKey) throw notFound("Soubor nenalezen.");
  const p = storagePath(row.storageKey);
  let size: number;
  try {
    size = (await stat(p)).size;
  } catch {
    throw notFound("Soubor nenalezen na disku.");
  }
  const mime = row.mime || "application/octet-stream";
  const inline = INLINE_MIME.test(mime);
  const ascii = row.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const disposition = `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`;
  const stream = Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(size),
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      // never let an uploaded HTML/SVG execute in our origin
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
