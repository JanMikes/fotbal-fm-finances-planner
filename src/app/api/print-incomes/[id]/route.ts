import { ctxFrom, json, parseBody, parseParam, route, zId } from "@/server/http";
import { deletePrintIncome, updatePrintIncome, updatePrintIncomeSchema } from "@/server/services/print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const PATCH = route<P>(async (req, p) =>
  json(await updatePrintIncome(parseParam(p.id, zId), await parseBody(req, updatePrintIncomeSchema), ctxFrom(req))),
);
export const DELETE = route<P>(async (req, p) => {
  await deletePrintIncome(parseParam(p.id, zId), ctxFrom(req));
  return json({ ok: true });
});
