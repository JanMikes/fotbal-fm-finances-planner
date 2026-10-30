import { ctxFrom, json, parseBody, route } from "@/server/http";
import { createPrintIncome, createPrintIncomeSchema } from "@/server/services/print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => json(await createPrintIncome(await parseBody(req, createPrintIncomeSchema), ctxFrom(req)), 201));
