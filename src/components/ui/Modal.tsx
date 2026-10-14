"use client";
/**
 * Generic modal shell (prototype §8.1 `shell(title, body, foot)`):
 *   <div class="ov"><div class="modal" role="dialog"><div class="mh"><h2/><button class="close"/></div>{body}<div class="mf">{foot}</div></div></div>
 * Closes on Escape, on pointerdown on the overlay itself and via the × button. No unsaved-changes guard (prototype).
 * Lives inside #modalRoot (sibling of .app) so the print stylesheet keeps working: either rendered there by the
 * caller (ModalHost) or, with `portal`, portalled there from anywhere (team forms).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  title: string;
  onClose: () => void;
  /** Usually a `<div className="mb">…</div>`. */
  children: ReactNode;
  foot: ReactNode;
  /** Extra attributes for e2e tests / styling. */
  testId?: string;
  /** Portal the modal into `#modalRoot` (for callers rendered inside `.app`). */
  portal?: boolean;
}

export function Modal({ title, onClose, children, foot, testId, portal = false }: ModalProps) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const [host] = useState(() => (portal && typeof document !== "undefined" ? (document.getElementById("modalRoot") ?? document.body) : null));

  const el = (
    <div
      className="ov"
      id="ov"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className="mh">
          <h2>{title}</h2>
          <button className="close" type="button" data-close="" aria-label="Zavřít" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
        <div className="mf">{foot}</div>
      </div>
    </div>
  );
  if (!portal) return el;
  return host ? createPortal(el, host) : null;
}
