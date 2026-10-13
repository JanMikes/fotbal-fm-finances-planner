import { ctxFrom, json, parseBody, parseParam, route, zId } from "@/server/http";
import { duplicateTask, duplicateSchema } from "@/server/services/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (req, p) =>
  json(await duplicateTask(parseParam(p.id, zId), await parseBody(req, duplicateSchema), ctxFrom(req)), 201),
);
