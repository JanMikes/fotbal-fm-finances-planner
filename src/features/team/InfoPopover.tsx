"use client";
/** Read-only info bubble `#infoPop` (prototype §10.9). Positioned under the „i" button, flips above when needed. */
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function InfoPopover({ name, info, anchor }: { name: string; info: string; anchor: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
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
  return createPortal(
    <div id="infoPop" ref={ref} role="tooltip" style={{ left: -9999, top: 0 }}>
      <div className="ih">{name}</div>
      {info}
    </div>,
    document.body,
  );
}
