import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/server/auth/rateLimit";
import {
  createSessionValue,
  isSecureRequest,
  safeEqual,
  secretEquals,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  sessionCookieHeader,
  verifySessionValue,
} from "@/server/auth/session";
import { proxy } from "@/proxy";

const SECRET = "dev-session-secret-change-me-0000000000";

describe("session cookie", () => {
  it("signs and verifies", async () => {
    const v = await createSessionValue(SECRET);
    expect(await verifySessionValue(v, SECRET)).toBe(true);
    expect(await verifySessionValue(v, SECRET + "x")).toBe(false);
    expect(await verifySessionValue(v.slice(0, -2) + "AA", SECRET)).toBe(false);
    expect(await verifySessionValue("v1.123", SECRET)).toBe(false);
    expect(await verifySessionValue(undefined, SECRET)).toBe(false);
  });

  it("expires after one year", async () => {
    const issued = Date.now() - SESSION_MAX_AGE_S * 1000 - 1000;
    expect(await verifySessionValue(await createSessionValue(SECRET, issued), SECRET)).toBe(false);
  });

  it("constant-time comparisons", async () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(await secretEquals("dev-token", "dev-token")).toBe(true);
    expect(await secretEquals("dev-tokenx", "dev-token")).toBe(false);
    expect(await secretEquals("", "")).toBe(false);
  });

  it("cookie attributes and secure detection", () => {
    expect(sessionCookieHeader("v", false)).toBe(`${SESSION_COOKIE}=v; Path=/; Max-Age=${SESSION_MAX_AGE_S}; HttpOnly; SameSite=Lax`);
    expect(sessionCookieHeader("v", true)).toContain("; Secure");
    expect(isSecureRequest(new Request("http://127.0.0.1/x"))).toBe(false);
    expect(isSecureRequest(new Request("https://a.cz/x"))).toBe(true);
    expect(isSecureRequest(new Request("http://a/x", { headers: { "x-forwarded-proto": "https" } }))).toBe(true);
    expect(isSecureRequest(new Request("https://a/x", { headers: { "x-forwarded-proto": "http" } }))).toBe(false);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit within the window", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.hit("ip", 0)).toBe(true);
    expect(rl.hit("ip", 1)).toBe(true);
    expect(rl.hit("ip", 2)).toBe(false);
    expect(rl.hit("ip", 1001)).toBe(true);
    rl.reset("ip");
    expect(rl.hit("ip", 1002)).toBe(true);
  });
});

describe("proxy", () => {
  const req = (path: string, cookie?: string) =>
    new NextRequest(new URL(path, "http://127.0.0.1:3000"), {
      headers: { host: "127.0.0.1:3000", ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}) },
    });

  it("lets public paths through", async () => {
    for (const p of ["/login", "/api/health", "/k/abc", "/api/auth/login", "/_next/static/chunks/a.css", "/fonts/Montserrat-Bold.otf", "/logo-short.svg"]) {
      const r = await proxy(req(p));
      expect(r.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("401 JSON for API, redirect for pages", async () => {
    const api = await proxy(req("/api/state"));
    expect(api.status).toBe(401);
    expect(await api.json()).toMatchObject({ error: "unauthorized" });
    const page = await proxy(req("/"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://127.0.0.1:3000/login");
    const behind = await proxy(
      new NextRequest(new URL("/", "http://10.0.0.5:3000"), { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "marketing.example.cz" } }),
    );
    expect(behind.headers.get("location")).toBe("https://marketing.example.cz/login");
  });

  it("passes with a valid cookie; /login redirects home", async () => {
    const v = await createSessionValue(SECRET);
    expect((await proxy(req("/api/state", v))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(req("/", v))).headers.get("x-middleware-next")).toBe("1");
    const login = await proxy(req("/login", v));
    expect(login.status).toBe(307);
    expect(login.headers.get("location")).toBe("http://127.0.0.1:3000/");
    expect((await proxy(req("/api/state", "v1.1.bad"))).status).toBe(401);
  });
});
