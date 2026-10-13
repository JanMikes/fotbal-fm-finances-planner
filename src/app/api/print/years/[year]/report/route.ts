import { json, parseParam, route } from "@/server/http";
import { yearReport, zYear } from "@/server/services/print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ year: string }>(async (_req, p) => json(await yearReport(parseParam(p.year, zYear, "year"))));
