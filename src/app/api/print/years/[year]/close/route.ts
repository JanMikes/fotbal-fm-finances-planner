import { ctxFrom, json, parseParam, route } from "@/server/http";
import { closeYear, reopenYear, zYear } from "@/server/services/print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { year: string };
export const POST = route<P>(async (req, p) => json(await closeYear(parseParam(p.year, zYear, "year"), ctxFrom(req))));
export const DELETE = route<P>(async (req, p) => json(await reopenYear(parseParam(p.year, zYear, "year"), ctxFrom(req))));
