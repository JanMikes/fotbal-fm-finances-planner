"use client";
/**
 * Read-only info bubble `#infoPop` (prototype §10.9). Positioned under the „i" button, flips above when needed.
 * Closes on Escape (window listener, bubble phase — ignored when a layer already handled the key, see
 * components/ui/layers.ts) and returns focus to the „i" button; outside pointerdown / scroll close it in TeamTab.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function InfoPopover({ name, info, anchor, onClose }: { name: string; info: string; anchor: HTMLElement; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const p = ref.current;
    if (!p) return;
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth;
    const ph = p.offsetHeight;
    const x = Math.max(8, Math.min(r.right - pw, window.innerWidth - pw - 8));
    let y = r.bottom + 8;
    if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 8);
    p.style.left = x + "px";
    p.style.top = y + "px";
  }, [anchor, name, info]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      closeRef.current();
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor]);

  return createPortal(
    <div id="infoPop" ref={ref} role="tooltip" style={{ left: -9999, top: 0 }}>
      <div className="ih">{name}</div>
      {info}
    </div>,
    document.body,
  );
}
