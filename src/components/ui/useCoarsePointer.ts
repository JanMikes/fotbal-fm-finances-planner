"use client";
/** `true` on touch-first devices (`(pointer: coarse)`): popovers become bottom sheets, inputs skip autofocus. */
import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Non-hook check for event handlers / effects. */
export function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, isCoarsePointer, () => false);
}
