import { ctxFrom, json, parseParam, route, zId } from "@/server/http";
import { deleteAttachment } from "@/server/services/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>(async (req, p) => {
  await deleteAttachment(parseParam(p.id, zId), ctxFrom(req));
  return json({ ok: true });
});
