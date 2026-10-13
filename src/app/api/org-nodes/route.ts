import { ctxFrom, json, parseBody, route } from "@/server/http";
import { createNode, createNodeSchema, listNodes } from "@/server/services/orgNodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listNodes()));
export const POST = route(async (req) => json(await createNode(await parseBody(req, createNodeSchema), ctxFrom(req)), 201));
