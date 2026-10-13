import { describe, expect, it, vi } from "vitest";
import { AppStore } from "@/lib/store/store";
import { addTask } from "@/lib/store/optimistic";
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
        throw new Error("Neplatná data.");
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
});
