import { ctxFrom, json, parseBody, parseParam, route, zId } from "@/server/http";
import { duplicateNode, duplicateNodeSchema } from "@/server/services/orgNodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (req, p) =>
  json({ nodes: await duplicateNode(parseParam(p.id, zId), await parseBody(req, duplicateNodeSchema), ctxFrom(req)) }, 201),
);
