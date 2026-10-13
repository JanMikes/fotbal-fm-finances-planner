import { ctxFrom, json, parseBody, parseParam, route, zId } from "@/server/http";
import { deleteNode, updateNode, updateNodeSchema } from "@/server/services/orgNodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const PATCH = route<P>(async (req, p) =>
  json(await updateNode(parseParam(p.id, zId), await parseBody(req, updateNodeSchema), ctxFrom(req))),
);
export const DELETE = route<P>(async (req, p) => {
  await deleteNode(parseParam(p.id, zId), ctxFrom(req));
  return json({ ok: true });
});
