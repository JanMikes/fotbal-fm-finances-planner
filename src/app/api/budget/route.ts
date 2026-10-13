import { ctxFrom, json, parseBody, route } from "@/server/http";
import { budgetSchema, getBudget, updateBudget } from "@/server/services/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json(await getBudget()));
export const PUT = route(async (req) => json(await updateBudget(await parseBody(req, budgetSchema), ctxFrom(req))));
