import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRealtime, printPage, PRINT_RESUME_MS } from "@/lib/store/realtime";
import type { AppStore } from "@/lib/store/store";

/** Minimal EventSource stand-in: records every instance and lets the test fire events / errors on it. */
class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  closed = false;
  onerror: ((ev: Event) => void) | null = null;
  constructor(public url: string) {
    super();
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
  emit(type: string, data = "{}") {
    this.dispatchEvent(new MessageEvent(type, { data }));
  }
}

const open = () => FakeEventSource.instances.filter((e) => !e.closed);
const fakeStore = () => ({ setOnline: vi.fn(), scheduleRefetch: vi.fn() }) as unknown as AppStore;
const response = (status: number) => ({ status, ok: status >= 200 && status < 300 }) as Response;

describe("connectRealtime", () => {
  let win: EventTarget;
  // every connection is stopped after its test (printPage acts on all live connections)
  let stops: Array<() => void> = [];
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    win = new EventTarget();
    vi.stubGlobal("window", win);
  });
  afterEach(() => {
    for (const stop of stops) stop();
    stops = [];
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const connect = (fetchImpl: typeof fetch = vi.fn(async () => response(200))) => {
    const stop = connectRealtime(fakeStore(), { EventSource: FakeEventSource as unknown as typeof EventSource, fetch: fetchImpl });
    stops.push(stop);
    return stop;
  };

  it("opens exactly one stream", () => {
    connect();
    expect(open()).toHaveLength(1);
  });

  it("an `online` event during the reconnect probe does not leave a second stream (2026-10-22 leak)", async () => {
    let release!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (release = r)));
    connect(fetchImpl as unknown as typeof fetch);
    FakeEventSource.instances[0].fail();
    await vi.advanceTimersByTimeAsync(1000); // reconnect timer fires, probe in flight
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("online")); // wake: browser reports online while the probe is pending
    expect(open()).toHaveLength(1);
    release(response(200));
    await vi.advanceTimersByTimeAsync(0);
    expect(open()).toHaveLength(1);
  });

  it("stream count stays at one across many network blips", async () => {
    connect();
    for (let i = 0; i < 6; i++) {
      for (const es of open()) es.fail();
      win.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(31_000);
      expect(open()).toHaveLength(1);
    }
  });

  it("errors on a superseded stream are inert", async () => {
    const fetchImpl = vi.fn(async () => response(200));
    connect(fetchImpl as unknown as typeof fetch);
    const first = FakeEventSource.instances[0];
    first.fail();
    win.dispatchEvent(new Event("online")); // opens the replacement right away
    const created = FakeEventSource.instances.length;
    first.fail();
    first.fail();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances.length).toBe(created);
    expect(open()).toHaveLength(1);
  });

  it("an edge block (403) backs off with probes only — no stream is opened until it clears", async () => {
    let status = 403;
    const fetchImpl = vi.fn(async () => response(status));
    connect(fetchImpl as unknown as typeof fetch);
    FakeEventSource.instances[0].fail();
    // 1 + 2 + 4 + 8 + 16 + 30 + 30 s → 7 probes in ~91 s, never a request storm
    await vi.advanceTimersByTimeAsync(91_000);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(FakeEventSource.instances).toHaveLength(1);
    status = 200;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(open()).toHaveLength(1);
  });

  it("hello resets the backoff and marks the store online", async () => {
    const store = fakeStore();
    stops.push(connectRealtime(store, { EventSource: FakeEventSource as unknown as typeof EventSource, fetch: vi.fn(async () => response(200)) }));
    FakeEventSource.instances[0].emit("hello");
    expect(store.setOnline).toHaveBeenCalledWith(true);
    expect(store.scheduleRefetch).toHaveBeenCalledWith(0);
  });

  it("stop() closes the stream and cancels a pending reconnect", async () => {
    const stop = connect();
    FakeEventSource.instances[0].fail();
    stop();
    win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(open()).toHaveLength(0);
  });

  describe("printPage (Safari never prints while the stream is open)", () => {
    const printWin = () => Object.assign(new EventTarget(), { print: vi.fn() }) as unknown as Window & { print: ReturnType<typeof vi.fn> };

    it("closes the stream before printing and reconnects on afterprint", async () => {
      const stop = connect();
      const w = printWin();
      printPage(w);
      expect(open()).toHaveLength(0);
      win.dispatchEvent(new Event("online")); // must not reopen while printing
      expect(open()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(50);
      expect(w.print).toHaveBeenCalledTimes(1);
      w.dispatchEvent(new Event("afterprint"));
      expect(open()).toHaveLength(1);
      w.dispatchEvent(new Event("afterprint")); // resumes once
      expect(open()).toHaveLength(1);
      stop();
    });

    it("reconnects after the fallback when afterprint never fires; a stopped connection stays closed", async () => {
      const stop = connect();
      printPage(printWin());
      await vi.advanceTimersByTimeAsync(PRINT_RESUME_MS);
      expect(open()).toHaveLength(1);
      stop();
      const w = printWin();
      printPage(w);
      w.dispatchEvent(new Event("afterprint"));
      expect(open()).toHaveLength(0);
    });
  });
});
