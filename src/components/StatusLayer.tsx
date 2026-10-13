"use client";
/**
 * Non-prototype status UI:
 *  - error toast for `snapshot.error` (failed mutation / load; the store already rolled back): icon, message and a
 *    × „Zavřít" button; auto-hides after 8 s, paused while hovered or focused. On mobile it sits above the sticky
 *    modal footer (components.css). The message is the toast's only text (tests read `.app-toast` text);
 *  - amber „Offline" pill when the realtime connection has been down — or refetching /api/state has kept failing —
 *    for > 4 s (the store retries with backoff and refetches on reconnect);
 *  - silent refetch when the tab becomes visible again (laptop sleep, background tab).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore, useStoreSnapshot } from "@/lib/store/react";

const TOAST_MS = 8000;

export function StatusLayer() {
  const store = useStore();
  const snap = useStoreSnapshot();
  const [offline, setOffline] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const paused = hover || focus;
  const toastRef = useRef<HTMLDivElement>(null);

  // mobile: a full-screen modal has a sticky footer (1–2 rows of actions) — lift the toast just above it
  useLayoutEffect(() => {
    const el = toastRef.current;
    if (!el) return;
    const mf = document.querySelector<HTMLElement>(".ov .mf");
    const r = mf?.getBoundingClientRect();
    if (r && window.matchMedia("(max-width: 760px)").matches && r.bottom >= window.innerHeight - 2) {
      el.style.setProperty("--toast-lift", `${Math.round(window.innerHeight - r.top + 8)}px`);
    } else {
      el.style.removeProperty("--toast-lift");
    }
  }, [snap.error]);

  useEffect(() => {
    if (!snap.error || paused) return;
    const t = setTimeout(() => store.clearError(), TOAST_MS);
    return () => clearTimeout(t);
  }, [snap.error, paused, store]);

  // a new toast starts unpaused (the old one may have unmounted under the pointer / with focus inside)
  const [shown, setShown] = useState(snap.error);
  if (shown !== snap.error) {
    setShown(snap.error);
    setHover(false);
    setFocus(false);
  }

  const loaded = !!snap.state;
  const healthy = snap.online && !snap.stale;
  useEffect(() => {
    if (healthy || !loaded) {
      const t = setTimeout(() => setOffline(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setOffline(true), 4000);
    return () => clearTimeout(t);
  }, [healthy, loaded]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") store.scheduleRefetch(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [store]);

  return (
    <>
      {snap.error && snap.state && (
        <div
          ref={toastRef}
          className="app-toast"
          role="alert"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setFocus(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
          }}
        >
          <span className="app-toast__msg">{snap.error}</span>
          <button type="button" className="app-toast__x" aria-label="Zavřít" title="Zavřít" onClick={() => store.clearError()} />
        </div>
      )}
      {offline && (
        <div className="app-offline" role="status">
          <span className="app-offline__dot" aria-hidden="true" />
          <span className="app-offline__t">Offline</span>
          <span className="app-offline__d"> – změny ostatních se načtou po obnovení spojení</span>
        </div>
      )}
    </>
  );
}
