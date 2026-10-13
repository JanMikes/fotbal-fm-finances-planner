import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { badRequest, ctxFrom, HttpError, json, parseBody, route } from "@/server/http";
import { addLink, linkSchema, uploadFile } from "@/server/services/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * multipart/form-data {parentKind, parentId, file, id?}  → file attachment
 * application/json {kind:"link", parentKind, parentId, url, name?, id?} → link attachment
 */
export const POST = route(async (req) => {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_UPLOAD_BYTES + 1024 * 1024) throw new HttpError(413, "too_large", "Soubor je větší než 25 MB.");
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw badRequest("Neplatná multipart data.");
    }
    return json(await uploadFile(form, ctxFrom(req)), 201);
  }
  return json(await addLink(await parseBody(req, linkSchema), ctxFrom(req)), 201);
});
