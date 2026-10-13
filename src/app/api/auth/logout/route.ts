import { clearSessionCookieHeader, isSecureRequest } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return new Response(null, {
    status: 303,
    headers: { Location: "/login", "Set-Cookie": clearSessionCookieHeader(isSecureRequest(req)), "Cache-Control": "no-store" },
  });
}
