import { requireApiAccess } from "@/server/auth/guard";
import { ctxFrom, HttpError, isJsonContentType, json, parseBody, route } from "@/server/http";
import { addLink, linkSchema, uploadFile } from "@/server/services/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * multipart/form-data {parentKind, parentId, file, id?}  → file attachment (streamed to disk, max 25 MB → 413)
 * application/json {kind:"link", parentKind, parentId, url, name?, id?} → link attachment
 *
 * NOTE: this exact path is excluded from the proxy matcher (so Next does not buffer the upload body in memory);
 * auth + CSRF are enforced here by requireApiAccess.
 */
export const POST = route(async (req) => {
  await requireApiAccess(req);
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  if (type.startsWith("multipart/form-data")) return json(await uploadFile(req, ctxFrom(req)), 201);
  if (!isJsonContentType(req)) {
    throw new HttpError(415, "unsupported_media_type", "Očekáván multipart/form-data (soubor) nebo JSON (odkaz).");
  }
  return json(await addLink(await parseBody(req, linkSchema), ctxFrom(req)), 201);
});
