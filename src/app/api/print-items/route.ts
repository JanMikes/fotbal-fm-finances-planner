import { ctxFrom, json, parseBody, route } from "@/server/http";
import { createPrintItem, createPrintItemSchema } from "@/server/services/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => json(await createPrintItem(await parseBody(req, createPrintItemSchema), ctxFrom(req)), 201));
