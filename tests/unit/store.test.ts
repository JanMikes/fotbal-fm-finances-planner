import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { createActions } from "@/lib/store/actions";
import { AppStore } from "@/lib/store/store";
import { addColumn, addTask, renameColumn } from "@/lib/store/optimistic";
import { state, task } from "./fixtures";

const flush = () => new Promise((r) => setTimeout(r, 120));

describe("AppStore", () => {
  it("loads state", async () => {
    const s = new AppStore(async () => state());
    await s.load();
    expect(s.getSnapshot().status).toBe("ready");
  });

  it("applies optimistic updates and reconciles with a refetch", async () => {
    const server = state();
    const fetchState = vi.fn(async () => server);
    const s = new AppStore(fetchState);
    s.hydrate(state());
    const t = task({ id: "new" });
    const p = s.mutate((st) => addTask(st, t), async () => {
      expect(s.getSnapshot().state?.tasks.map((x) => x.id)).toEqual(["new"]);
      server.tasks = [t];
      return t;
    });
    await expect(p).resolves.toEqual(t);
    await flush();
    expect(fetchState).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot().state?.tasks.map((x) => x.id)).toEqual(["new"]);
  });

  it("rolls back on error and records the message", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    await expect(
      s.mutate((st) => addTask(st, task({ id: "x" })), async () => {
        throw new ApiError(400, "validation", "Neplatná data.");
      }),
    ).rejects.toThrow();
    expect(s.getSnapshot().state?.tasks).toEqual([]);
    expect(s.getSnapshot().error).toBe("Neplatná data.");
  });

  it("defers realtime refetches while mutations are pending", async () => {
    const fetchState = vi.fn(async () => state());
    const s = new AppStore(fetchState);
    s.hydrate(state());
    let release!: () => void;
    const p = s.mutate(null, () => new Promise<void>((r) => (release = r)));
    s.scheduleRefetch(0);
    await flush();
    expect(fetchState).not.toHaveBeenCalled();
    release();
    await p;
    await flush();
    expect(fetchState).toHaveBeenCalledTimes(1);
  });

  it("ignores a refetch that started before a mutation (no jump back to a stale snapshot)", async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let call = 0;
    const s = new AppStore(async () => {
      const n = ++call;
      await sleep(n === 1 ? 50 : 10);
      return state({ tasks: [task({ id: n === 1 ? "stale" : "fresh" })] });
    });
    s.hydrate(state({ tasks: [task({ id: "initial" })] }));
    const seen: string[] = [];
    s.subscribe(() => {
      const id = s.getSnapshot().state!.tasks.map((t) => t.id).join("+");
      if (seen[seen.length - 1] !== id) seen.push(id);
    });
    void s.load(); // e.g. SSE-triggered refetch, its snapshot predates the mutation below
    await sleep(10);
    await s.mutate((st) => ({ ...st, tasks: [task({ id: "optimistic" })] }), () => sleep(5));
    await sleep(200);
    expect(seen).not.toContain("stale");
    expect(seen[seen.length - 1]).toBe("fresh");
  });

  it("never applies a snapshot taken while a mutation was in flight (its commit may be missing)", async () => {
    const fetchState = vi.fn(async () => state({ tasks: [task({ id: "server" })] }));
    const s = new AppStore(fetchState);
    s.hydrate(state());
    let release!: () => void;
    const p = s.mutate((st) => addTask(st, task({ id: "dup" })), () => new Promise<void>((r) => (release = r)));
    await s.load(); // e.g. a debounce timer firing mid-mutation
    expect(fetchState).not.toHaveBeenCalled();
    expect(s.getSnapshot().state?.tasks.map((t) => t.id)).toEqual(["dup"]);
    release();
    await p;
    await flush();
    expect(fetchState).toHaveBeenCalledTimes(1); // one reconciling load after the mutation settled
  });

  it("an error rolls back only the failed mutation, keeping other successful ones", async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const s = new AppStore(() => new Promise(() => undefined)); // the reconciling refetch never answers
    s.hydrate(state());
    const ids = () => s.getSnapshot().state!.tasks.map((t) => t.id);
    const a = s
      .mutate((st) => addTask(st, task({ id: "A" })), async () => {
        await sleep(30);
        throw new ApiError(409, "conflict", "fail A");
      })
      .catch(() => undefined);
    const b = s.mutate((st) => addTask(st, task({ id: "B" })), () => sleep(5));
    await b;
    expect(ids()).toEqual(["A", "B"]);
    await a;
    expect(ids()).toEqual(["B"]);
    expect(s.getSnapshot().error).toBe("fail A");
  });

  it("retries a failed initial load with backoff and marks the state stale meanwhile", async () => {
    let call = 0;
    const s = new AppStore(async () => {
      if (++call <= 2) throw new TypeError("Failed to fetch");
      return state();
    }, 10);
    await s.load();
    expect(s.getSnapshot().status).toBe("error");
    expect(s.getSnapshot().stale).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    expect(call).toBe(3);
    expect(s.getSnapshot().status).toBe("ready");
    expect(s.getSnapshot().stale).toBe(false);
  });

  it("a failed background refetch keeps the data, is not toasted and is retried", async () => {
    let fail = true;
    const fetchState = vi.fn(async () => {
      if (fail) throw new ApiError(502, "http_error", "Server je dočasně nedostupný.");
      return state({ tasks: [task({ id: "new" })] });
    });
    const s = new AppStore(fetchState, 10);
    s.hydrate(state());
    await s.load();
    expect(s.getSnapshot().status).toBe("ready");
    expect(s.getSnapshot().stale).toBe(true);
    expect(s.getSnapshot().error).toBeNull();
    fail = false;
    await new Promise((r) => setTimeout(r, 80));
    expect(s.getSnapshot().stale).toBe(false);
    expect(s.getSnapshot().state?.tasks.map((t) => t.id)).toEqual(["new"]);
  });
});

describe("AppStore — refetches during a slow load", () => {
  it("realtime refetches do not abort a slow first load; one follow-up load runs after it", async () => {
    let calls = 0;
    const aborted: number[] = [];
    const fetchState = vi.fn(
      (signal?: AbortSignal) =>
        new Promise<ReturnType<typeof state>>((resolve, reject) => {
          const n = ++calls;
          signal?.addEventListener("abort", () => (aborted.push(n), reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
          setTimeout(() => resolve(state({ tasks: [task({ id: `t${n}` })] })), 60);
        }),
    );
    const s = new AppStore(fetchState);
    const first = s.load();
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 10));
      void s.load(); // e.g. SSE events from other users every few ms
    }
    await first;
    expect(aborted).toEqual([]);
    expect(s.getSnapshot().status).toBe("ready");
    expect(s.getSnapshot().state?.tasks.map((t) => t.id)).toEqual(["t1"]);
    await new Promise((r) => setTimeout(r, 120));
    expect(calls).toBe(2); // the five requests collapsed into one follow-up
    expect(s.getSnapshot().state?.tasks.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("AppStore — requests never overtake the create they depend on", () => {
  afterEach(() => vi.restoreAllMocks());

  /** A request whose resolution the test controls. */
  function deferred<T = void>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
    return { promise, resolve, reject };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("holds a rename until the optimistic create of the same column has settled (optimistic state is immediate)", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    const sent: string[] = [];
    const create = deferred();
    const pc = s.mutate(
      (st) => addColumn(st, { id: "c9", boardId: "tasks", title: "Nový" }),
      () => (sent.push("create"), create.promise),
      { creates: ["c9"] },
    );
    const pr = s.mutate(
      (st) => renameColumn(st, "c9", "Přejmenovaný"),
      async () => void sent.push("rename"),
      { after: ["c9"] },
    );
    expect(s.getSnapshot().state?.columns.find((c) => c.id === "c9")?.title).toBe("Přejmenovaný");
    await tick();
    expect(sent).toEqual(["create"]); // the rename waits
    create.resolve();
    await Promise.all([pc, pr]);
    expect(sent).toEqual(["create", "rename"]);
    expect(s.getSnapshot().pending).toBe(0);
  });

  it("a failed create still releases the dependent request, which reports its own error", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    const create = deferred();
    const pc = s.mutate((st) => addColumn(st, { id: "c9", boardId: "tasks", title: "Nový" }), () => create.promise, { creates: ["c9"] });
    const rename = vi.fn(async () => {
      throw new ApiError(404, "not_found", "Sloupec nenalezen.");
    });
    const pr = s.mutate((st) => renameColumn(st, "c9", "X"), rename, { after: ["c9"] });
    create.reject(new ApiError(400, "validation", "Neplatná data."));
    await expect(pc).rejects.toThrow();
    await expect(pr).rejects.toThrow();
    expect(rename).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot().state?.columns.some((c) => c.id === "c9")).toBe(false);
    expect(s.getSnapshot().pending).toBe(0);
  });

  it("does not delay requests for other or already-created entities", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    const create = deferred();
    void s.mutate(null, () => create.promise, { creates: ["c9"] });
    const other = vi.fn(async () => undefined);
    void s.mutate(null, other, { after: ["c1", null, undefined] });
    expect(other).toHaveBeenCalledTimes(1); // sent synchronously, as before
    create.resolve();
    await tick();
    const later = vi.fn(async () => undefined);
    void s.mutate(null, later, { after: ["c9"] }); // create settled → no wait
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("actions: renameColumn right after createColumn reaches the API after the create", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    const order: string[] = [];
    const create = deferred<never>();
    vi.spyOn(api, "createColumn").mockImplementation(() => (order.push("create"), create.promise));
    vi.spyOn(api, "renameColumn").mockImplementation(async (id, title) => {
      order.push("rename");
      return { id, boardId: "tasks", title, sortOrder: 0 };
    });
    const a = createActions(s);
    const pc = a.createColumn("Nový");
    const id = s.getSnapshot().state!.columns.find((c) => c.title === "Nový")!.id;
    const pr = a.renameColumn(id, "Hotovo dnes");
    await tick();
    expect(order).toEqual(["create"]);
    create.resolve({ id, boardId: "tasks", title: "Nový", sortOrder: 9 } as never);
    await Promise.all([pc, pr]);
    expect(order).toEqual(["create", "rename"]);
  });
});

describe("AppStore — requests on the same entity keep their order", () => {
  afterEach(() => vi.restoreAllMocks());
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function deferred<T = void>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("a second move of the same card waits for the first one (which waits for its column's create)", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    const sent: string[] = [];
    const create = deferred();
    const pc = s.mutate(null, () => (sent.push("create C"), create.promise), { creates: ["C"] });
    const m1 = s.mutate(null, async () => void sent.push("T → C"), { after: ["T", "C", null] });
    const m2 = s.mutate(null, async () => void sent.push("T → A"), { after: ["T", "A", null] });
    await tick();
    expect(sent).toEqual(["create C"]); // T → A must not overtake T → C
    create.resolve();
    await Promise.all([pc, m1, m2]);
    expect(sent).toEqual(["create C", "T → C", "T → A"]);
    expect(s.inFlightEntities).toBe(0);
  });

  it("updates of the same entity are sent one after another, in call order", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    const sent: string[] = [];
    const first = deferred();
    const p1 = s.mutate(null, () => (sent.push("lead=P1"), first.promise), { after: ["T", "P1"] });
    const p2 = s.mutate(null, async () => void sent.push("lead=P2"), { after: ["T", "P2"] });
    await tick();
    expect(sent).toEqual(["lead=P1"]);
    first.resolve();
    await Promise.all([p1, p2]);
    expect(sent).toEqual(["lead=P1", "lead=P2"]);
  });

  it("a failed request releases the next one on the same entity (no deadlock) and the queue empties", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    const first = deferred();
    const p1 = s.mutate(null, () => first.promise, { after: ["T"] });
    const second = vi.fn(async () => "ok");
    const p2 = s.mutate(null, second, { after: ["T"] });
    expect(second).not.toHaveBeenCalled();
    first.reject(new ApiError(409, "conflict", "Konflikt."));
    await expect(p1).rejects.toThrow();
    await expect(p2).resolves.toBe("ok");
    expect(second).toHaveBeenCalledTimes(1);
    expect(s.inFlightEntities).toBe(0);
    expect(s.getSnapshot().pending).toBe(0);
  });

  it("a request that throws synchronously still settles its tail", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    const p1 = s.mutate(null, () => {
      throw new Error("boom");
    }, { after: ["T"] });
    await expect(p1).rejects.toThrow();
    const next = vi.fn(async () => undefined);
    await s.mutate(null, next, { after: ["T"] });
    expect(next).toHaveBeenCalledTimes(1);
    expect(s.inFlightEntities).toBe(0);
  });

  it("requests on different entities are not serialised (sent synchronously)", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state());
    const slow = deferred();
    void s.mutate(null, () => slow.promise, { after: ["T1"] });
    const other = vi.fn(async () => undefined);
    void s.mutate(null, other, { after: ["T2", "C1"] });
    expect(other).toHaveBeenCalledTimes(1);
    slow.resolve();
    await tick();
  });

  it("actions: moveTask twice — the second request reaches the API after the first", async () => {
    const s = new AppStore(async () => state());
    s.hydrate(state({ tasks: [task({ id: "t1", columnId: "c1" })] }));
    const order: string[] = [];
    const first = deferred<never>();
    vi.spyOn(api, "moveTask").mockImplementation((id, body) => {
      order.push(body.columnId);
      return order.length === 1 ? first.promise : Promise.resolve(task({ id }));
    });
    const a = createActions(s);
    const p1 = a.moveTask("t1", "c2", null);
    const p2 = a.moveTask("t1", "c1", null);
    await tick();
    expect(order).toEqual(["c2"]);
    first.resolve(task({ id: "t1" }) as never);
    await Promise.all([p1, p2]);
    expect(order).toEqual(["c2", "c1"]);
  });
});

describe("AppStore — a hung load is replaced after 10 s", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a refetch while a load is younger than 10 s waits for it; an older load is aborted and replaced", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const signals: AbortSignal[] = [];
    let calls = 0;
    const fetchState = vi.fn((signal?: AbortSignal) => {
      calls++;
      if (signal) signals.push(signal);
      if (calls === 1) {
        // hangs until aborted
        return new Promise<ReturnType<typeof state>>((_, rej) => signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      }
      return Promise.resolve(state());
    });
    const s = new AppStore(fetchState);
    const first = s.load();
    now += 5_000;
    void s.load(); // young load → no abort, only a follow-up is queued
    expect(fetchState).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(false);
    now += 6_000; // the first load is now 11 s old
    await s.load();
    expect(signals[0].aborted).toBe(true);
    expect(fetchState).toHaveBeenCalledTimes(2);
    await first;
    expect(s.getSnapshot().status).toBe("ready");
  });
});
