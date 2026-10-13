import { NextResponse, type NextRequest } from "next/server";
import { forbiddenCrossOrigin, isSameOriginRequest } from "@/server/auth/csrf";
import { isValidSession, SESSION_COOKIE } from "@/server/auth/session";

/** Static assets needed by the login page (also excluded via `config.matcher`, checked here as a safety net). */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname.startsWith("/fonts/") ||
    pathname === "/logo-short.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

/** Paths reachable without the session cookie. */
function isPublic(pathname: string): boolean {
  return (
    isStaticAsset(pathname) ||
    pathname === "/login" ||
    pathname === "/api/health" ||
    pathname === "/api/auth/login" ||
    pathname.startsWith("/k/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // CSRF: unsafe API requests (incl. the public /api/auth/login) must come from our own origin.
  if (pathname.startsWith("/api/") && !isSameOriginRequest(request)) return forbiddenCrossOrigin();
  const authed = await isValidSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/k/")) {
    // Malformed percent-encoding would otherwise surface as a bare 500 from Next's param decoding.
    try {
      decodeURIComponent(pathname);
    } catch {
      return redirect(request, "/login");
    }
  }
  if (isPublic(pathname)) {
    if (pathname === "/login" && authed) return redirect(request, "/");
    return NextResponse.next();
  }
  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized", message: "Přihlaste se." }, { status: 401 });
  }
  return redirect(request, "/login");
}

/**
 * Absolute redirect (the proxy runtime requires absolute Location URLs). Honours X-Forwarded-Proto/Host so the
 * redirect keeps the public scheme/host behind Traefik.
 */
function redirect(request: NextRequest, pathname: string) {
  const fallback = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || fallback.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || fallback.host;
  const res = NextResponse.redirect(new URL(pathname, `${proto === "https" ? "https" : "http"}://${host}`), 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/**
 * `/api/attachments` (exact path; the upload endpoint) is deliberately NOT matched: whenever the proxy runs, Next
 * buffers the whole request body in memory (and truncates it at `proxyClientMaxBodySize`). The upload route does
 * its own session + same-origin checks (`requireApiAccess`) and streams the multipart body to disk instead.
 * `/api/attachments/:id` and `/api/attachments/:id/file` still go through the proxy.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts/|favicon.ico|logo-short.svg|robots.txt|api/attachments$).*)"],
};
