/**
 * Framework-agnostic client store holding the full AppState.
 *
 * Mutations: `store.mutate(optimistic, request)`
 *   1. applies `optimistic(state)` immediately,
 *   2. runs `request()` (an `api.*` call),
 *   3. on error: rolls back to the pre-mutation snapshot (when no other mutation is in flight), records `error`,
 *   4. when no mutation is pending any more, refetches /api/state to reconcile with the server.
 * Remote changes (SSE) trigger a debounced refetch, deferred while local mutations are in flight so a refetch never
 * clobbers an optimistic update.
 */
import { api, ApiError } from "../api";
import type { AppState } from "../types";

export type Status = "loading" | "ready" | "error";

export interface StoreSnapshot {
  state: AppState | null;
  status: Status;
  /** Last mutation/load error (Czech message), cleared by `clearError()`. */
  error: string | null;
  /** Realtime connection status. */
  online: boolean;
  /** Number of in-flight mutations. */
  pending: number;
}

type Listener = () => void;

export class AppStore {
  private snap: StoreSnapshot = { state: null, status: "loading", error: null, online: false, pending: 0 };
  private listeners = new Set<Listener>();
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;
  private refetchWanted = false;
  private loadSeq = 0;
  private abort: AbortController | null = null;

  constructor(private readonly fetchState: (signal?: AbortSignal) => Promise<AppState> = api.state) {}

  getSnapshot = (): StoreSnapshot => this.snap;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<StoreSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  /** Replace the whole state (e.g. server-provided initial state, tests). */
  hydrate(state: AppState) {
    this.set({ state, status: "ready" });
  }

  setOnline(online: boolean) {
    if (online !== this.snap.online) this.set({ online });
  }

  clearError() {
    if (this.snap.error) this.set({ error: null });
  }

  /** Load /api/state now. Stale responses (older than a later load or arriving during mutations) are ignored. */
  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.abort?.abort();
    const ac = new AbortController();
    this.abort = ac;
    try {
      const state = await this.fetchState(ac.signal);
      if (seq !== this.loadSeq) return;
      if (this.snap.pending > 0) {
        this.refetchWanted = true; // apply later, after mutations settle
        return;
      }
      this.set({ state, status: "ready" });
    } catch (err) {
      if ((err as Error).name === "AbortError" || seq !== this.loadSeq) return;
      this.set({ status: this.snap.state ? "ready" : "error", error: messageOf(err) });
    }
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

  /** Apply an optimistic change and run the request. Resolves with the request result; rejects on error (after rollback). */
  async mutate<T>(optimistic: ((s: AppState) => AppState) | null, run: () => Promise<T>): Promise<T> {
    const before = this.snap.state;
    const next = before && optimistic ? optimistic(before) : before;
    this.set({ state: next, pending: this.snap.pending + 1 });
    try {
      const result = await run();
      this.settle();
      return result;
    } catch (err) {
      const pending = this.snap.pending - 1;
      // Roll back immediately when nothing else is in flight; otherwise the reconciling refetch fixes it.
      this.set({ pending, error: messageOf(err), ...(pending === 0 && before ? { state: before } : {}) });
      this.refetchWanted = true;
      if (pending === 0) this.flushRefetch();
      throw err;
    }
  }

  private settle() {
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

export function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message || "Neznámá chyba.";
  return "Neznámá chyba.";
}
