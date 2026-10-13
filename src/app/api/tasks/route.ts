import { ctxFrom, json, parseBody, route } from "@/server/http";
import { createTask, createTaskSchema } from "@/server/services/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => json(await createTask(await parseBody(req, createTaskSchema), ctxFrom(req)), 201));
