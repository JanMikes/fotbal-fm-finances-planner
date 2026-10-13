import { ctxFrom, json, parseBody, parseParam, route, zId } from "@/server/http";
import { deleteTask, updateTask, updateTaskSchema } from "@/server/services/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const PATCH = route<P>(async (req, p) =>
  json(await updateTask(parseParam(p.id, zId), await parseBody(req, updateTaskSchema), ctxFrom(req))),
);
export const DELETE = route<P>(async (req, p) => {
  await deleteTask(parseParam(p.id, zId), ctxFrom(req));
  return json({ ok: true });
});
