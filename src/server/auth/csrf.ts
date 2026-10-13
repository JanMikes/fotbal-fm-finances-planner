/**
 * Cross-origin request protection for state-changing requests (CSRF).
 *
 * Why: the session cookie is SameSite=Lax, and SameSite is per *site* (eTLD+1 = thedevs.cz), so every sibling
 * `*.thedevs.cz` app counts as same-site and its forms would carry our cookie. We therefore require that unsafe
 * requests come from our own *origin*.
 *
 * Algorithm (same as Go's net/http CrossOriginProtection):
 *  1. Safe methods (GET/HEAD/OPTIONS) always pass.
 *  2. `Sec-Fetch-Site` present → only `same-origin` or `none` (user-initiated) pass.
 *  3. Else `Origin` present → must equal the request's own origin (scheme + host, honouring
 *     X-Forwarded-Proto / X-Forwarded-Host set by Traefik).
 *  4. Neither header → not a browser request (every current browser sends Origin on cross-origin POST/PUT/
 *     PATCH/DELETE, and Sec-Fetch-Site on HTTPS), so it cannot be a CSRF; pass. Such a client still needs the cookie.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function first(v: string | null): string | null {
  const s = v?.split(",")[0]?.trim();
  return s ? s : null;
}

/** The public origin of the request ("https://host[:port]"), as seen by the browser. */
export function requestOrigin(req: Request): string | null {
  let url: URL | null = null;
  try {
    url = new URL(req.url);
  } catch {
    url = null;
  }
  const host = first(req.headers.get("x-forwarded-host")) ?? first(req.headers.get("host")) ?? url?.host ?? null;
  if (!host) return null;
  const proto = (first(req.headers.get("x-forwarded-proto")) ?? url?.protocol.replace(":", "") ?? "http").toLowerCase();
  return `${proto === "https" ? "https" : "http"}://${host.toLowerCase()}`;
}

export function isSameOriginRequest(req: Request): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin === "null") return false;
    const own = requestOrigin(req);
    return !!own && origin.toLowerCase() === own;
  }
  return true;
}

export function forbiddenCrossOrigin(): Response {
  return Response.json(
    { error: "forbidden", message: "Požadavek z cizího webu byl zablokován." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
