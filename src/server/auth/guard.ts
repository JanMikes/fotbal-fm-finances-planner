/** In-handler auth for routes that bypass src/proxy.ts (see its `config.matcher`). */
import { HttpError } from "../http";
import { isSameOriginRequest } from "./csrf";
import { isValidSession, readSessionCookie } from "./session";

/** Same checks the proxy does for /api/*: same-origin for unsafe methods (403), then a valid session (401). */
export async function requireApiAccess(req: Request): Promise<void> {
  if (!isSameOriginRequest(req)) throw new HttpError(403, "forbidden", "Požadavek z cizího webu byl zablokován.");
  if (!(await isValidSession(readSessionCookie(req)))) throw new HttpError(401, "unauthorized", "Přihlaste se.");
}
