/**
 * SSE subscription to /api/realtime with reconnect + exponential backoff (1 s → 30 s).
 * Own events (same X-Client-Id) are ignored; every other event schedules a refetch. The server sends `hello` once its
 * LISTEN is live and `resync` after LISTEN reconnects — both (including the very first `hello`) trigger a full refetch,
 * so changes committed between the initial /api/state snapshot and the live subscription are never lost.
 */
import { CLIENT_ID } from "../api";
import type { ChangeEvent } from "../types";
import type { AppStore } from "./store";

export interface RealtimeOptions {
  url?: string;
  onEvent?: (e: ChangeEvent) => void;
}

export function connectRealtime(store: AppStore, opts: RealtimeOptions = {}): () => void {
  const url = opts.url ?? "/api/realtime";
  let es: EventSource | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    es = new EventSource(url, { withCredentials: true });
    es.addEventListener("hello", () => {
      attempt = 0;
      store.setOnline(true);
      store.scheduleRefetch(0);
    });
    es.addEventListener("change", (msg) => {
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
    es.addEventListener("resync", () => store.scheduleRefetch(0));
    es.onerror = () => {
      store.setOnline(false);
      // Take over reconnecting ourselves (EventSource gives up on HTTP errors such as 401/503).
      es?.close();
      es = null;
      if (stopped) return;
      const delay = Math.min(30_000, 1000 * 2 ** attempt++) + Math.floor(Math.random() * 500);
      timer = setTimeout(async () => {
        // Probe auth first: a 401 redirects to /login (api.ts) instead of looping on a dead session.
        try {
          const res = await fetch("/api/budget", { credentials: "same-origin", cache: "no-store" });
          if (res.status === 401) {
            stopped = true;
            // full reload on purpose: the proxy serves /login
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/login";
            return;
          }
        } catch {
          /* offline — keep backing off */
        }
        open();
      }, delay);
    };
  };

  const onOnline = () => {
    if (!es && !stopped) {
      if (timer) clearTimeout(timer);
      attempt = 0;
      open();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("online", onOnline);
  open();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    es?.close();
    if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
  };
}
