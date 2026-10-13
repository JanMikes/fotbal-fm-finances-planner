/** Attachments: files stored on disk in UPLOAD_DIR under random names; links stored as rows. */
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { normalizeUrl } from "@/lib/format";
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

async function assertParent(tx: DbOrTx, kind: ParentKind, id: string) {
  const table = kind === "task" ? tasks : printItems;
  const [row] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id));
  if (!row) throw badRequest(kind === "task" ? "Úkol neexistuje." : "Tiskovina neexistuje.");
}

export async function addLink(input: z.infer<typeof linkSchema>, ctx: Ctx): Promise<Attachment> {
  const url = normalizeUrl(input.url);
  if (!/^https?:\/\//i.test(url) && !/^[a-z]+:\/\//i.test(url)) throw badRequest("Neplatný odkaz.");
  if (/^(javascript|data|vbscript):/i.test(input.url.trim())) throw badRequest("Neplatný odkaz.");
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

/** Store an uploaded file (multipart form fields: parentKind, parentId, file, optional id). */
export async function uploadFile(form: FormData, ctx: Ctx): Promise<Attachment> {
  const meta = uploadMetaSchema.parse({
    id: form.get("id") || undefined,
    parentKind: form.get("parentKind") ?? form.get("parent_kind"),
    parentId: form.get("parentId") ?? form.get("parent_id"),
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Chybí soubor (pole „file“).");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "too_large", "Soubor je větší než 25 MB.");

  const key = newStorageKey();
  await mkdir(uploadDir(), { recursive: true });
  const target = storagePath(key);
  await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  try {
    return await getDb().transaction(async (tx) => {
      await assertParent(tx, meta.parentKind, meta.parentId);
      const [row] = await tx
        .insert(attachments)
        .values({
          ...(meta.id && { id: meta.id }),
          parentKind: meta.parentKind,
          parentId: meta.parentId,
          kind: "file",
          name: (file.name || "soubor").slice(0, 300),
          storageKey: key,
          sizeBytes: file.size,
          mime: file.type || "application/octet-stream",
        })
        .returning();
      await notify(tx, ctx, "attachment", "insert", row.id);
      return mapAttachment(row);
    });
  } catch (err) {
    await unlink(target).catch(() => undefined);
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

/** Copy attachments (files duplicated on disk) from one parent to another (used by duplicate). */
export async function copyAttachments(tx: DbOrTx, kind: ParentKind, fromId: string, toId: string): Promise<Attachment[]> {
  const rows = await tx.select().from(attachments).where(and(eq(attachments.parentKind, kind), eq(attachments.parentId, fromId)));
  const out: Attachment[] = [];
  for (const r of rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    let storageKey: string | null = null;
    if (r.kind === "file" && r.storageKey) {
      storageKey = newStorageKey();
      try {
        await copyFile(storagePath(r.storageKey), storagePath(storageKey));
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
