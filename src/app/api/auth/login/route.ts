import { clientIp, loginLimiter } from "@/server/auth/rateLimit";
import { createSessionValue, isSecureRequest, secretEquals, sessionCookieHeader } from "@/server/auth/session";
import { env } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Password login. Accepts an HTML form post (application/x-www-form-urlencoded / multipart → 303 redirects)
 * or JSON {password} (→ JSON response).
 */
export async function POST(req: Request) {
  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  let password = "";
  try {
    if (isJson) password = String(((await req.json()) as { password?: unknown }).password ?? "");
    else password = String((await req.formData()).get("password") ?? "");
  } catch {
    password = "";
  }
  const ip = clientIp(req);
  const reply = (status: number, location: string, body: object, cookie?: string) => {
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (cookie) headers.set("Set-Cookie", cookie);
    if (isJson) return Response.json(body, { status, headers });
    headers.set("Location", location);
    return new Response(null, { status: 303, headers });
  };

  if (!loginLimiter.hit(ip)) {
    return reply(429, "/login?error=rate", { error: "rate_limited", message: "Příliš mnoho pokusů. Zkuste to za chvíli." });
  }
  if (!(await secretEquals(password, env.appPassword))) {
    return reply(401, "/login?error=1", { error: "invalid_password", message: "Nesprávné heslo" });
  }
  loginLimiter.reset(ip);
  const cookie = sessionCookieHeader(await createSessionValue(env.sessionSecret), isSecureRequest(req));
  return reply(200, "/", { ok: true }, cookie);
}
