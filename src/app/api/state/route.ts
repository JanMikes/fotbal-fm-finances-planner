import { json, route } from "@/server/http";
import { getState } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => json(await getState()));
