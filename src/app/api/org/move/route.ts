import { ctxFrom, json, parseBody, route } from "@/server/http";
import { moveNode, moveNodeSchema } from "@/server/services/orgNodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route(async (req) => json(await moveNode(await parseBody(req, moveNodeSchema), ctxFrom(req))));
