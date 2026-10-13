import { createSessionValue, isSecureRequest, secretEquals, sessionCookieHeader } from "@/server/auth/session";
import { env } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Magic link: /k/<APP_ACCESS_TOKEN> → session cookie → redirect "/" (token never stays in the address bar). */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (!(await secretEquals(decodeURIComponent(token ?? ""), env.accessToken))) {
    headers.set("Location", "/login");
    return new Response(null, { status: 303, headers });
  }
  headers.set("Set-Cookie", sessionCookieHeader(await createSessionValue(env.sessionSecret), isSecureRequest(req)));
  headers.set("Location", "/");
  return new Response(null, { status: 303, headers });
}
