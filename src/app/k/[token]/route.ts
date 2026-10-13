import { clientIp, loginLimiter } from "@/server/auth/rateLimit";
import { isSecureRequest, issueSession, secretEquals, sessionCookieHeader } from "@/server/auth/session";
import { env } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Magic link: /k/<APP_ACCESS_TOKEN> → session cookie → redirect "/" (token never stays in the address bar).
 * Attempts share the login rate limiter (10 per 15 min per client IP); over the limit → /login?error=rate.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  const ip = clientIp(req);
  if (!loginLimiter.hit(ip)) {
    headers.set("Location", "/login?error=rate");
    return new Response(null, { status: 303, headers });
  }
  if (!(await secretEquals(safeDecode(token ?? ""), env.accessToken))) {
    headers.set("Location", "/login");
    return new Response(null, { status: 303, headers });
  }
  loginLimiter.reset(ip);
  headers.set("Set-Cookie", sessionCookieHeader(await issueSession(), isSecureRequest(req)));
  headers.set("Location", "/");
  return new Response(null, { status: 303, headers });
}
