/**
 * SSE subscription to /api/realtime with reconnect + exponential backoff (1 s → 30 s).
 * Own events (same X-Client-Id) are ignored; every other event schedules a refetch. The server sends `hello` once its
 * LISTEN is live and `resync` after LISTEN reconnects — both (including the very first `hello`) trigger a full refetch,
 * so changes committed between the initial /api/state snapshot and the live subscription are never lost.
 *
 * Invariant: AT MOST ONE EventSource per connection. Every open() tears down the previous source and any pending
 * reconnect first, and every handler is bound to its own source and goes inert once a newer one exists (`gen`). Before
 * this, an `online` event firing while the reconnect probe was in flight opened a second source, and each orphan's
 * onerror closed the *current* source instead of itself and scheduled one more open() — so every network blip doubled
 * the number of streams (66 in one Safari tab on 2026-10-22, which the edge's CrowdSec read as a crawler and blocked).
 */
import { CLIENT_ID } from "../api";
import type { ChangeEvent } from "../types";
import type { AppStore } from "./store";

export interface RealtimeOptions {
  url?: string;
  onEvent?: (e: ChangeEvent) => void;
  /** Injection points for tests. */
  EventSource?: typeof EventSource;
  fetch?: typeof fetch;
}

const MAX_DELAY_MS = 30_000;

export function connectRealtime(store: AppStore, opts: RealtimeOptions = {}): () => void {
  const url = opts.url ?? "/api/realtime";
  const ES = opts.EventSource ?? EventSource;
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  let es: EventSource | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // bumped by every open(); a handler or probe continuation from an older generation does nothing
  let gen = 0;
  let stopped = false;

  const teardown = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    es?.close();
    es = null;
  };

  const scheduleReconnect = (myGen: number) => {
    const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** attempt++) + Math.floor(Math.random() * 500);
    timer = setTimeout(async () => {
      timer = null;
      // Probe first: a 401 redirects to /login (api.ts) instead of looping on a dead session, and any other non-2xx
      // (edge block 403, rate limit 429, 5xx) keeps backing off without opening a stream that would fail the same way.
      try {
        const res = await doFetch("/api/budget", { credentials: "same-origin", cache: "no-store" });
        if (myGen !== gen || stopped) return;
        if (res.status === 401) {
          stopped = true;
          // full reload on purpose: the proxy serves /login
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login";
          return;
        }
        if (!res.ok) {
          scheduleReconnect(myGen);
          return;
        }
      } catch {
        /* offline — open() below fails fast and backs off again */
      }
      if (myGen !== gen || stopped) return;
      open();
    }, delay);
  };

  const open = () => {
    if (stopped) return;
    teardown();
    const myGen = ++gen;
    const source = new ES(url, { withCredentials: true });
    es = source;
    const current = () => myGen === gen && !stopped;
    source.addEventListener("hello", () => {
      if (!current()) return;
      attempt = 0;
      store.setOnline(true);
      store.scheduleRefetch(0);
    });
    source.addEventListener("change", (msg) => {
      if (!current()) return;
      let ev: ChangeEvent;
      try {
        ev = JSON.parse((msg as MessageEvent<string>).data) as ChangeEvent;
      } catch {
        return;
      }
      opts.onEvent?.(ev);
      if (ev.clientId && ev.clientId === CLIENT_ID) return;
      store.scheduleRefetch();
    });
    source.addEventListener("resync", () => {
      if (current()) store.scheduleRefetch(0);
    });
    source.onerror = () => {
      // Always close THIS source: take over reconnecting ourselves (EventSource gives up on HTTP errors such as
      // 401/503, and its native retry would otherwise run alongside ours).
      source.close();
      if (!current()) return;
      es = null;
      store.setOnline(false);
      scheduleReconnect(myGen);
    };
  };

  const onOnline = () => {
    if (!es && !stopped) {
      attempt = 0;
      open();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("online", onOnline);
  open();

  return () => {
    stopped = true;
    teardown();
    if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
  };
}
