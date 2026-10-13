import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/server/auth/csrf";
import { clientIp, RateLimiter } from "@/server/auth/rateLimit";
import {
  createSessionValue,
  isSecureRequest,
  isValidSession,
  issueSession,
  sessionSigningKey,
  safeEqual,
  secretEquals,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  sessionCookieHeader,
  verifySessionValue,
} from "@/server/auth/session";
import { productionEnvProblems } from "@/server/env";
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

describe("session signing key (rotation)", () => {
  it("is derived from SESSION_SECRET + password + token, so rotating any of them invalidates cookies", async () => {
    const base = { sessionSecret: SECRET, appPassword: "heslo-tymu", accessToken: "t".repeat(48) };
    const v = await createSessionValue(await sessionSigningKey(base));
    expect(await verifySessionValue(v, await sessionSigningKey(base))).toBe(true);
    expect(await verifySessionValue(v, await sessionSigningKey({ ...base, appPassword: "nove-heslo" }))).toBe(false);
    expect(await verifySessionValue(v, await sessionSigningKey({ ...base, accessToken: "u".repeat(48) }))).toBe(false);
    expect(await verifySessionValue(v, await sessionSigningKey({ ...base, sessionSecret: SECRET + "x" }))).toBe(false);
    // a cookie signed with the bare SESSION_SECRET (old format) is no longer accepted
    expect(await isValidSession(await createSessionValue(SECRET))).toBe(false);
    expect(await isValidSession(await issueSession())).toBe(true);
  });
});

describe("production env checks", () => {
  const strong = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@db/x",
    APP_PASSWORD: "abcdefgh",
    APP_ACCESS_TOKEN: "a".repeat(32),
    SESSION_SECRET: "b".repeat(32),
  } as NodeJS.ProcessEnv;
  it("accepts strong values (password min 8, token/secret min 32)", () => {
    expect(productionEnvProblems(strong)).toEqual([]);
  });
  it("rejects missing, short and public dev values", () => {
    expect(productionEnvProblems({ ...strong, APP_PASSWORD: "" })).toEqual(["APP_PASSWORD (missing)"]);
    expect(productionEnvProblems({ ...strong, APP_PASSWORD: "1234567" })).toEqual(["APP_PASSWORD (min 8 chars)"]);
    expect(productionEnvProblems({ ...strong, APP_ACCESS_TOKEN: "a".repeat(31) })).toEqual(["APP_ACCESS_TOKEN (min 32 chars)"]);
    expect(productionEnvProblems({ ...strong, SESSION_SECRET: "b".repeat(31) })).toEqual(["SESSION_SECRET (min 32 chars)"]);
    expect(productionEnvProblems({ ...strong, APP_PASSWORD: "dev-password" })).toEqual(["APP_PASSWORD (public dev default — generate a real secret)"]);
    expect(productionEnvProblems({ ...strong, SESSION_SECRET: "dev-session-secret-change-me-0000000000" })).toHaveLength(1);
    expect(productionEnvProblems({ ...strong, SESSION_SECRET: "ci-session-secret-not-used-in-production-0000000000000000" })).toHaveLength(1);
    expect(productionEnvProblems({ ...strong, APP_ACCESS_TOKEN: "dev-token" })).toHaveLength(2);
  });
  it("ALLOW_DEV_SECRETS=1 (local compose only) skips the strength checks but not presence", () => {
    const dev = { ...strong, APP_PASSWORD: "dev-password", APP_ACCESS_TOKEN: "dev-token", ALLOW_DEV_SECRETS: "1" };
    expect(productionEnvProblems(dev)).toEqual([]);
    expect(productionEnvProblems({ ...dev, SESSION_SECRET: "" })).toEqual(["SESSION_SECRET (missing)"]);
  });
});

describe("client IP", () => {
  const r = (h: Record<string, string>) => new Request("http://x/", { headers: h });
  it("uses the right-most X-Forwarded-For entry (the one the trusted proxy appended)", () => {
    expect(clientIp(r({ "x-forwarded-for": "1.2.3.5, 1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(r({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(r({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(r({}))).toBe("unknown");
  });
});

describe("CSRF same-origin check", () => {
  const r = (method: string, h: Record<string, string>, url = "http://127.0.0.1:3000/api/tasks") => new Request(url, { method, headers: h });
  it("safe methods always pass", () => {
    expect(isSameOriginRequest(r("GET", { origin: "https://evil.cz", "sec-fetch-site": "cross-site" }))).toBe(true);
  });
  it("Sec-Fetch-Site is authoritative", () => {
    expect(isSameOriginRequest(r("POST", { "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(r("POST", { "sec-fetch-site": "none" }))).toBe(true);
    expect(isSameOriginRequest(r("POST", { "sec-fetch-site": "same-site", origin: "http://127.0.0.1:3000" }))).toBe(false);
    expect(isSameOriginRequest(r("DELETE", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });
  it("Origin must match the public origin (X-Forwarded-Host/Proto behind Traefik)", () => {
    expect(isSameOriginRequest(r("POST", { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }))).toBe(true);
    expect(isSameOriginRequest(r("POST", { origin: "https://evil.thedevs.cz", host: "127.0.0.1:3000" }))).toBe(false);
    expect(isSameOriginRequest(r("POST", { origin: "null" }))).toBe(false);
    const behind = { host: "web:3000", "x-forwarded-host": "marketing.fotbal-fm.thedevs.cz", "x-forwarded-proto": "https" };
    expect(isSameOriginRequest(r("PATCH", { ...behind, origin: "https://marketing.fotbal-fm.thedevs.cz" }, "http://web:3000/api/x"))).toBe(true);
    expect(isSameOriginRequest(r("PATCH", { ...behind, origin: "http://marketing.fotbal-fm.thedevs.cz" }, "http://web:3000/api/x"))).toBe(false);
    expect(isSameOriginRequest(r("POST", { ...behind, origin: "https://evil.thedevs.cz" }, "http://web:3000/api/x"))).toBe(false);
  });
  it("no Origin and no Sec-Fetch-Site = not a browser → allowed (still needs the cookie)", () => {
    expect(isSameOriginRequest(r("POST", {}))).toBe(true);
  });
});

describe("rate limiter", () => {
  it("caps the number of tracked keys", () => {
    const rl = new RateLimiter(5, 60_000, 2000);
    for (let i = 0; i < 5000; i++) rl.hit(`ip-${i}`, 0);
    expect(rl.size).toBeLessThanOrEqual(2000);
  });

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

  it("rejects cross-origin unsafe API requests (incl. login) with 403, before auth", async () => {
    const v = await issueSession();
    for (const [path, method] of [["/api/tasks", "POST"], ["/api/print/years/2026/close", "POST"], ["/api/auth/login", "POST"], ["/api/tasks/x", "DELETE"]]) {
      const res = await proxy(
        new NextRequest(new URL(path, "http://127.0.0.1:3000"), {
          method,
          headers: { host: "127.0.0.1:3000", origin: "https://evil.thedevs.cz", "content-type": "text/plain", cookie: `${SESSION_COOKIE}=${v}` },
        }),
      );
      expect(res.status, path).toBe(403);
      expect(await res.json()).toMatchObject({ error: "forbidden" });
    }
    const same = await proxy(
      new NextRequest(new URL("/api/tasks", "http://127.0.0.1:3000"), {
        method: "POST",
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", cookie: `${SESSION_COOKIE}=${v}` },
      }),
    );
    expect(same.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes with a valid cookie; /login redirects home", async () => {
    const v = await issueSession();
    expect((await proxy(req("/api/state", v))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(req("/", v))).headers.get("x-middleware-next")).toBe("1");
    const login = await proxy(req("/login", v));
    expect(login.status).toBe(307);
    expect(login.headers.get("location")).toBe("http://127.0.0.1:3000/");
    expect((await proxy(req("/api/state", "v1.1.bad"))).status).toBe(401);
  });
});
