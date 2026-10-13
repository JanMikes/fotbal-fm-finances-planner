/**
 * Stateless session cookie: `v1.<issuedAtMs>.<base64url HMAC-SHA256(key, "v1.<issuedAtMs>")>` where
 * key = SESSION_SECRET + "." + base64url(SHA-256(APP_PASSWORD + "\n" + APP_ACCESS_TOKEN)) (see sessionSigningKey).
 * Rotating SESSION_SECRET, APP_PASSWORD or APP_ACCESS_TOKEN therefore invalidates every cookie.
 * Uses Web Crypto so it works in the proxy and in route handlers.
 */
import { env } from "../env";

export const SESSION_COOKIE = "fmp_session";
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60; // 1 year

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time string comparison (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** Constant-time secret comparison that does not leak the length (compares SHA-256 digests). */
export async function secretEquals(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return safeEqual(b64url(a), b64url(b)) && provided.length > 0;
}

let keyCache: { input: string; key: string } | null = null;

/**
 * HMAC key for session cookies, derived from SESSION_SECRET and a hash of APP_PASSWORD + APP_ACCESS_TOKEN, so that
 * rotating any of the three logs everyone out (DEPLOYMENT.md §3).
 */
export async function sessionSigningKey(
  secrets: { sessionSecret: string; appPassword: string; accessToken: string } = env,
): Promise<string> {
  const { sessionSecret, appPassword, accessToken } = secrets;
  const input = `${appPassword}\n${accessToken}`;
  const cacheInput = `${sessionSecret}\u0000${input}`;
  if (keyCache?.input === cacheInput) return keyCache.key;
  const epoch = b64url(await crypto.subtle.digest("SHA-256", enc.encode(input)));
  const key = `${sessionSecret}.${epoch}`;
  keyCache = { input: cacheInput, key };
  return key;
}

/** New cookie value signed with the current derived key. */
export async function issueSession(now: number = Date.now()): Promise<string> {
  return createSessionValue(await sessionSigningKey(), now);
}

/** Whether a cookie value is valid for the current secrets. */
export async function isValidSession(value: string | undefined | null, now: number = Date.now()): Promise<boolean> {
  if (!value) return false;
  return verifySessionValue(value, await sessionSigningKey(), now);
}

export async function createSessionValue(secret: string, now: number = Date.now()): Promise<string> {
  const payload = `v1.${now}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySessionValue(value: string | undefined | null, secret: string, now: number = Date.now()): Promise<boolean> {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const issued = Number(parts[1]);
  if (!Number.isFinite(issued) || issued > now + 60_000 || now - issued > SESSION_MAX_AGE_S * 1000) return false;
  const expected = await hmac(secret, `${parts[0]}.${parts[1]}`);
  return safeEqual(parts[2], expected);
}

/** Whether the original request was HTTPS (directly or via a TLS-terminating proxy). */
export function isSecureRequest(req: Request): boolean {
  const xfp = req.headers.get("x-forwarded-proto");
  if (xfp) return xfp.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookieHeader(value: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_S}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookieHeader(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])].join("; ");
}

/** Read the session cookie from a raw Cookie header. */
export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=");
  }
  return undefined;
}
