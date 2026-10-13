"use client";
/**
 * `useToday()` → local midnight of today, as a stable Date that changes exactly when the day changes.
 * One shared source for the whole app: a single timer to the next local midnight plus a re-check on
 * `visibilitychange` (timers are throttled/suspended in background tabs and during sleep).
 */
import { useSyncExternalStore } from "react";

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

let current = startOfToday();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function read(): Date {
  const t = startOfToday();
  if (t.getTime() !== current.getTime()) current = t;
  return current;
}

function check(): void {
  const before = current;
  if (read() !== before) listeners.forEach((l) => l());
}

function schedule(): void {
  clearTimeout(timer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  timer = setTimeout(() => {
    check();
    schedule();
  }, Math.max(1000, next.getTime() - now.getTime()));
}

function onVisibility(): void {
  if (document.visibilityState === "visible") {
    check();
    schedule();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1) {
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

export function useToday(): Date {
  return useSyncExternalStore(subscribe, read, read);
}
