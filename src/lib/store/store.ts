/**
 * Framework-agnostic client store holding the full AppState.
 *
 * Mutations: `store.mutate(optimistic, request)`
 *   1. applies `optimistic(state)` immediately (the op stays "pending" until the request settles),
 *   2. runs `request()` (an `api.*` call),
 *   3. on error: removes ONLY that op — the state is rebuilt from the confirmed base plus the other pending ops —
 *      and records `error`,
 *   4. when no mutation is pending any more, refetches /api/state to reconcile with the server.
 * Ordering: `deps.creates` registers an entity whose create request is in flight; a later mutation that lists that id
 * in `deps.after` keeps its optimistic patch but sends its request only once the create has settled (a rename sent
 * right after an optimistic create could otherwise reach the server first and 404). The request itself is unchanged.
 * Refetches: no load starts while mutations are in flight, and a /api/state response is ignored when any mutation
 * started or settled after the request was sent (the server snapshot may predate that mutation's commit); a fresh
 * refetch runs once mutations settle. A refetch requested while a load is in flight does not abort it (under steady
 * realtime traffic a slow first load would otherwise never finish); one more load runs right after it instead. Only a
 * load older than 10 s is aborted and replaced (hung request). Failed loads are
 * retried with exponential backoff (1 s → 30 s); `stale` is true while they fail (the UI shows „Offline").
 */
import { api, ApiError } from "../api";
import type { AppState } from "../types";

export type Status = "loading" | "ready" | "error";

export interface StoreSnapshot {
  state: AppState | null;
  status: Status;
  /** Last mutation/load error or notice (Czech message) for the toast, cleared by `clearError()`. */
  error: string | null;
  /** Realtime connection status. */
  online: boolean;
  /** True while (re)loading /api/state keeps failing — the shown data may be out of date. */
  stale: boolean;
  /** Number of in-flight mutations. */
  pending: number;
}

type Listener = () => void;
type Op = { fn: (s: AppState) => AppState };

/** Ordering hints for `mutate`: ids this request creates, and ids it targets/references (wait for their creates). */
export interface MutationDeps {
  creates?: readonly string[];
  after?: readonly (string | null | undefined)[];
}

const RETRY_MAX_MS = 30_000;
/** An in-flight load younger than this is awaited (follow-up queued) rather than aborted. */
const LOAD_REPLACE_MS = 10_000;

export class AppStore {
  private snap: StoreSnapshot = { state: null, status: "loading", error: null, online: false, stale: false, pending: 0 };
  private listeners = new Set<Listener>();
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private refetchWanted = false;
  private loadSeq = 0;
  /** Incremented whenever a mutation starts or settles; a load that saw another epoch is stale. */
  private mutationEpoch = 0;
  private abort: AbortController | null = null;
  private inflight: Promise<void> | null = null;
  private inflightSince = 0;
  private loadAgain = false;
  /** Server state + optimistic patches of mutations that already succeeded (not yet refetched). */
  private base: AppState | null = null;
  /** Optimistic patches of in-flight mutations, in start order. */
  private ops: Op[] = [];
  /** Entity id → its in-flight create request (settles, never rejects). */
  private creating = new Map<string, Promise<void>>();

  constructor(
    private readonly fetchState: (signal?: AbortSignal) => Promise<AppState> = api.state,
    private readonly retryBaseMs = 1000,
  ) {}

  getSnapshot = (): StoreSnapshot => this.snap;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<StoreSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  /** Base state with all pending optimistic patches applied. */
  private compose(): AppState | null {
    let s = this.base;
    if (!s) return s;
    for (const op of this.ops) s = applySafe(op.fn, s);
    return s;
  }

  /** Replace the whole state (e.g. server-provided initial state, tests). */
  hydrate(state: AppState) {
    this.base = state;
    this.set({ state: this.compose(), status: "ready" });
  }

  setOnline(online: boolean) {
    if (online !== this.snap.online) this.set({ online });
  }

  clearError() {
    if (this.snap.error) this.set({ error: null });
  }

  /** Show a short message in the toast (e.g. „Položka byla smazána jiným uživatelem."). */
  notify(message: string) {
    this.set({ error: message });
  }

  /** Load /api/state now (or right after the load in flight). Stale responses (older than a mutation) are ignored. */
  async load(): Promise<void> {
    if (this.snap.pending > 0) {
      // a snapshot taken now could miss an in-flight mutation's commit → load once mutations settle
      this.refetchWanted = true;
      return;
    }
    if (this.inflight && Date.now() - this.inflightSince < LOAD_REPLACE_MS) {
      this.loadAgain = true;
      return this.inflight;
    }
    this.loadAgain = false;
    const run = this.fetchAndApply();
    this.inflight = run;
    this.inflightSince = Date.now();
    try {
      await run;
    } finally {
      if (this.inflight === run) {
        this.inflight = null;
        if (this.loadAgain) {
          this.loadAgain = false;
          void this.load();
        }
      }
    }
  }

  private async fetchAndApply(): Promise<void> {
    const seq = ++this.loadSeq;
    const epoch = this.mutationEpoch;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.abort?.abort();
    const ac = new AbortController();
    this.abort = ac;
    try {
      const state = await this.fetchState(ac.signal);
      if (seq !== this.loadSeq) return;
      this.retryAttempt = 0;
      if (this.snap.pending > 0 || epoch !== this.mutationEpoch) {
        // the snapshot may predate a local mutation → fetch again once mutations settle
        this.refetchWanted = true;
        if (this.snap.stale) this.set({ stale: false });
        if (this.snap.pending === 0) this.flushRefetch();
        return;
      }
      this.base = state;
      this.set({ state: this.compose(), status: "ready", stale: false });
    } catch (err) {
      if ((err as Error).name === "AbortError" || seq !== this.loadSeq) return;
      const hasState = !!this.snap.state;
      // background refetch failures are not toasted (the „Offline" pill covers them); a failed first load shows its error
      this.set({ status: hasState ? "ready" : "error", stale: true, ...(hasState ? {} : { error: messageOf(err) }) });
      this.scheduleRetry();
    } finally {
      if (this.abort === ac) this.abort = null;
    }
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = Math.min(RETRY_MAX_MS, this.retryBaseMs * 2 ** this.retryAttempt++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.load();
    }, delay);
  }

  /** Debounced refetch (used for realtime events). */
  scheduleRefetch(delayMs = 150) {
    if (this.snap.pending > 0) {
      this.refetchWanted = true;
      return;
    }
    if (this.refetchTimer) clearTimeout(this.refetchTimer);
    this.refetchTimer = setTimeout(() => {
      this.refetchTimer = null;
      void this.load();
    }, delayMs);
  }

  /** Refetch right away when the last load failed (e.g. the browser came back online). */
  retryNow() {
    if (this.snap.stale || this.snap.status === "error") {
      this.retryAttempt = 0;
      this.scheduleRefetch(0);
    }
  }

  /** Apply an optimistic change and run the request. Resolves with the request result; rejects on error (after rollback). */
  async mutate<T>(optimistic: ((s: AppState) => AppState) | null, run: () => Promise<T>, deps: MutationDeps = {}): Promise<T> {
    this.mutationEpoch++;
    const op: Op | null = optimistic ? { fn: optimistic } : null;
    if (op) this.ops.push(op);
    this.set({ state: this.compose(), pending: this.snap.pending + 1 });
    const waits = [...new Set(deps.after ?? [])].flatMap((id) => (id && this.creating.get(id)) || []);
    // a failed create is not our failure: the dependent request still runs and reports its own error (e.g. 404)
    const start = (): Promise<T> => {
      try {
        return run();
      } catch (err) {
        return Promise.reject(err);
      }
    };
    const request = waits.length > 0 ? Promise.all(waits).then(start) : start(); // no wait → sent synchronously (keepalive on pagehide)
    if (deps.creates?.length) {
      const done = request.then(
        () => undefined,
        () => undefined,
      );
      for (const id of deps.creates) this.creating.set(id, done);
      void done.then(() => {
        for (const id of deps.creates ?? []) if (this.creating.get(id) === done) this.creating.delete(id);
      });
    }
    try {
      const result = await request;
      if (op) {
        this.ops = this.ops.filter((o) => o !== op);
        if (this.base) this.base = applySafe(op.fn, this.base);
      }
      this.settle();
      return result;
    } catch (err) {
      // roll back only this mutation: base + the other still-pending ops
      if (op) this.ops = this.ops.filter((o) => o !== op);
      this.set({ state: this.compose(), error: messageOf(err) });
      this.settle();
      throw err;
    }
  }

  private settle() {
    this.mutationEpoch++;
    const pending = this.snap.pending - 1;
    this.set({ pending });
    this.refetchWanted = true;
    if (pending === 0) this.flushRefetch();
  }

  private flushRefetch() {
    if (!this.refetchWanted) return;
    this.refetchWanted = false;
    this.scheduleRefetch(50);
  }
}

function applySafe(fn: (s: AppState) => AppState, s: AppState): AppState {
  try {
    return fn(s);
  } catch {
    return s;
  }
}

const GENERIC_ERROR = "Něco se nepovedlo. Zkuste to prosím znovu.";
const NETWORK_ERROR = "Nepodařilo se spojit se serverem. Zkuste to prosím znovu.";

export function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return NETWORK_ERROR; // fetch() network failure („Failed to fetch")
  return GENERIC_ERROR;
}
