import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as health from "@/app/api/health/route";
import * as magic from "@/app/k/[token]/route";
import * as login from "@/app/api/auth/login/route";
import * as attRoute from "@/app/api/attachments/route";
import * as attOne from "@/app/api/attachments/[id]/route";
import * as attFile from "@/app/api/attachments/[id]/file/route";
import * as tasksRoute from "@/app/api/tasks/route";
import * as realtime from "@/app/api/realtime/route";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import type { Attachment, Task } from "@/lib/types";
import { SESSION_COOKIE, verifySessionValue } from "@/server/auth/session";
import { shutdownRealtime, __resetRealtimeForTests } from "@/server/realtime/bus";
import { call, getState, taskCols, withCleanDb } from "./helpers";

withCleanDb();

const SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me-0000000000";
const TOKEN = process.env.APP_ACCESS_TOKEN || "dev-token";
const PASSWORD = process.env.APP_PASSWORD || "dev-password";

describe("health", () => {
  it("200 when the database answers", async () => {
    const r = await call(health.GET);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });
});

describe("auth routes", () => {
  it("magic link sets a signed cookie and redirects home; wrong token → /login", async () => {
    const ok = await call(magic.GET, { path: `/k/${TOKEN}`, params: { token: TOKEN } });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/");
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).not.toContain("Secure");
    const value = cookie.split(";")[0].slice(SESSION_COOKIE.length + 1);
    expect(await verifySessionValue(value, SECRET)).toBe(true);

    const bad = await call(magic.GET, { path: "/k/nope", params: { token: "nope" } });
    expect(bad.status).toBe(303);
    expect(bad.headers.get("location")).toBe("/login");
    expect(bad.headers.get("set-cookie")).toBeNull();

    const secure = await call(magic.GET, { path: `/k/${TOKEN}`, params: { token: TOKEN }, headers: { "x-forwarded-proto": "https" } });
    expect(secure.headers.get("set-cookie")).toContain("Secure");
  });

  it("password login via form and JSON, with rate limiting", async () => {
    const form = new URLSearchParams({ password: PASSWORD });
    const ok = await login.POST(
      new Request("http://127.0.0.1:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.0.0.1" },
        body: form,
      }),
    );
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/");
    expect(ok.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=v1.`);

    const wrong = await call<{ message: string }>(login.POST, { method: "POST", body: { password: "nope" }, headers: { "x-forwarded-for": "10.0.0.2" } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe("Nesprávné heslo");

    const badForm = await login.POST(
      new Request("http://127.0.0.1:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.0.0.3" },
        body: new URLSearchParams({ password: "x" }),
      }),
    );
    expect(badForm.headers.get("location")).toBe("/login?error=1");

    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await call(login.POST, { method: "POST", body: { password: "nope" }, headers: { "x-forwarded-for": "10.0.0.9" } })).status;
    }
    expect(last).toBe(429);
  });
});

async function seedTask(): Promise<Task> {
  const s = await getState();
  const r = await call<Task>(tasksRoute.POST, { method: "POST", body: { columnId: taskCols(s)[0].id, category: "Web", title: "T" } });
  return r.body;
}

describe("attachments", () => {
  it("uploads, downloads with headers, deletes (file removed from disk)", async () => {
    const t = await seedTask();
    const fd = new FormData();
    fd.set("parentKind", "task");
    fd.set("parentId", t.id);
    fd.set("file", new File(["ahoj světe"], "Přihláška 2026.txt", { type: "text/plain" }));
    const up = await call<Attachment>(attRoute.POST, { method: "POST", body: fd });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ kind: "file", name: "Přihláška 2026.txt", mime: "text/plain", sizeBytes: 11 });
    expect(up.body.url).toBe(`/api/attachments/${up.body.id}/file`);
    expect(readdirSync(process.env.UPLOAD_DIR!).length).toBeGreaterThan(0);

    const res = await attFile.GET(new Request(`http://x${up.body.url}`), { params: Promise.resolve({ id: up.body.id }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.get("content-disposition")).toContain("inline;");
    expect(res.headers.get("content-disposition")).toContain("filename*=UTF-8''P%C5%99ihl%C3%A1%C5%A1ka%202026.txt");
    expect(await res.text()).toBe("ahoj světe");

    const zip = new FormData();
    zip.set("parentKind", "task");
    zip.set("parentId", t.id);
    zip.set("file", new File([new Uint8Array([80, 75])], "a.zip", { type: "application/zip" }));
    const z = await call<Attachment>(attRoute.POST, { method: "POST", body: zip });
    const zr = await attFile.GET(new Request("http://x"), { params: Promise.resolve({ id: z.body.id }) });
    expect(zr.headers.get("content-disposition")).toMatch(/^attachment;/);

    const before = readdirSync(process.env.UPLOAD_DIR!).length;
    expect((await call(attOne.DELETE, { method: "DELETE", params: { id: up.body.id } })).status).toBe(200);
    expect(readdirSync(process.env.UPLOAD_DIR!).length).toBe(before - 1);
    const gone = await attFile.GET(new Request("http://x"), { params: Promise.resolve({ id: up.body.id }) });
    expect(gone.status).toBe(404);
  });

  it("links get https:// prepended; invalid parents and oversize files are rejected", async () => {
    const t = await seedTask();
    const link = await call<Attachment>(attRoute.POST, { method: "POST", body: { kind: "link", parentKind: "task", parentId: t.id, url: " www.fotbalfm.cz ", name: "Web klubu" } });
    expect(link.body).toMatchObject({ kind: "link", url: "https://www.fotbalfm.cz", name: "Web klubu" });
    expect((await call(attRoute.POST, { method: "POST", body: { kind: "link", parentKind: "task", parentId: t.id, url: "javascript:alert(1)" } })).status).toBe(400);
    expect((await call(attRoute.POST, { method: "POST", body: { kind: "link", parentKind: "print", parentId: t.id, url: "x.cz" } })).status).toBe(400);

    const big = new FormData();
    big.set("parentKind", "task");
    big.set("parentId", t.id);
    big.set("file", new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.bin"));
    expect((await call(attRoute.POST, { method: "POST", body: big })).status).toBe(413);
  });
});

describe("realtime", () => {
  it("streams a change event (with clientId) after a committed mutation", async () => {
    __resetRealtimeForTests();
    const ac = new AbortController();
    const res = await realtime.GET(new Request("http://x/api/realtime", { signal: ac.signal }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const readUntil = async (needle: string) => {
      const deadline = Date.now() + 8000;
      while (!buf.includes(needle)) {
        if (Date.now() > deadline) throw new Error(`timeout waiting for ${needle}; got: ${buf}`);
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value);
      }
    };
    await readUntil("event: hello");
    // give the shared LISTEN connection a moment to be established
    await new Promise((r) => setTimeout(r, 300));
    const s = await getState();
    const created = await call<Task>(tasksRoute.POST, {
      method: "POST",
      body: { columnId: taskCols(s)[0].id, category: "Web", title: "RT" },
      headers: { "x-client-id": "tab-123" },
    });
    await readUntil(created.body.id);
    const line = buf.split("\n").find((l) => l.startsWith("data:") && l.includes(created.body.id))!;
    expect(JSON.parse(line.slice(5))).toEqual({ entity: "task", op: "insert", id: created.body.id, clientId: "tab-123" });
    ac.abort();
    await shutdownRealtime();
  });
});
