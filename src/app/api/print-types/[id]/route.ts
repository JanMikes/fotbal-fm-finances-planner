import { ctxFrom, json, parseBody, parseParam, route, zId } from "@/server/http";
import { deletePrintType, renamePrintType, updatePrintTypeSchema } from "@/server/services/print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const PATCH = route<P>(async (req, p) =>
  json(await renamePrintType(parseParam(p.id, zId), await parseBody(req, updatePrintTypeSchema), ctxFrom(req))),
);
export const DELETE = route<P>(async (req, p) => json({ ok: true, ...(await deletePrintType(parseParam(p.id, zId), ctxFrom(req))) }));
