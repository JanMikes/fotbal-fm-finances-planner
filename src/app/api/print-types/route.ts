import { asc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { printTypes } from "@/server/db/schema";
import { ctxFrom, json, parseBody, route } from "@/server/http";
import { mapPrintType } from "@/server/services/mappers";
import { createPrintType, createPrintTypeSchema } from "@/server/services/print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json((await getDb().select().from(printTypes).orderBy(asc(printTypes.sortOrder))).map(mapPrintType)));
export const POST = route(async (req) => json(await createPrintType(await parseBody(req, createPrintTypeSchema), ctxFrom(req)), 201));
