import { parseParam, route, zId } from "@/server/http";
import { fileResponse } from "@/server/services/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, p) => fileResponse(parseParam(p.id, zId)));
