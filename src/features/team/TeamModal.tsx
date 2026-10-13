"use client";
/**
 * Generic modal shell (prototype §8.1 `shell`): overlay `.ov` → `.modal` → `.mh` / body / `.mf`.
 * Closes on overlay pointerdown, the × button and Escape. Rendered into `#modalRoot` (outside `.app`).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function TeamModal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const [host] = useState(() => (typeof document === "undefined" ? null : (document.getElementById("modalRoot") ?? document.body)));
  if (!host) return null;
  return createPortal(
    <div
      className="ov"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh">
          <h2>{title}</h2>
          <button type="button" className="close" aria-label="Zavřít" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
        <div className="mf">{footer}</div>
      </div>
    </div>,
    host,
  );
}
