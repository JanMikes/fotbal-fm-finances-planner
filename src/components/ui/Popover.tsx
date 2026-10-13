"use client";
/**
 * Anchored layer, portalled to <body>:
 *  - fine pointer: `.fm-pop[data-fm-layer]`, `position:fixed` from the anchor rect, flips above the anchor when
 *    the space below is short, `max-height: min(320px, available)`, follows scroll (capture) / resize / own size;
 *  - coarse pointer (`sheet`, default = `useCoarsePointer()`): `.fm-sheet-backdrop` + bottom `.fm-sheet[role=dialog]`
 *    with a header (label + × „Zavřít"), focus kept inside.
 * Closes on outside pointerdown (the event is marked so a modal overlay underneath does not close too) and on
 * Escape (Escape contract, see layers.ts). The owner is responsible for returning focus to its trigger.
 */
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { markLayerDismiss, tabbables } from "./layers";
import { useCoarsePointer } from "./useCoarsePointer";

export type PopoverCloseReason = "outside" | "escape" | "close-button";

export interface PopoverProps {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: (reason: PopoverCloseReason) => void;
  /** Accessible name of the layer and the sheet title. */
  label: string;
  children: ReactNode;
  /** Bottom sheet instead of an anchored popover (default: coarse pointer). */
  sheet?: boolean;
  /** Popover at least as wide as the anchor. */
  matchWidth?: boolean;
  placement?: "bottom-start" | "bottom-end";
  /** Role of the anchored popover root (a sheet is always a modal dialog). Omit when the content has its own role. */
  role?: "dialog";
  id?: string;
  className?: string;
  /** Tab / Shift+Tab cycle inside the layer (dialog-like content such as the calendar). Sheets always trap. */
  trapFocus?: boolean;
  /** Element to focus when a sheet opens (default: the sheet itself). */
  sheetInitialFocus?: RefObject<HTMLElement | null>;
  /** Upper bound for the popover height (px). */
  maxHeight?: number;
}

const GAP = 4;
const MARGIN = 8;

export function Popover({
  anchor,
  open,
  onClose,
  label,
  children,
  sheet,
  matchWidth = false,
  placement = "bottom-start",
  role,
  id,
  className,
  trapFocus = false,
  sheetInitialFocus,
  maxHeight = 320,
}: PopoverProps) {
  const coarse = useCoarsePointer();
  const asSheet = sheet ?? coarse;
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // position before paint and keep following the anchor
  useLayoutEffect(() => {
    if (!open || asSheet) return;
    const place = () => {
      const el = ref.current;
      const a = anchor.current;
      if (!el || !a || asSheet) return;
      const r = a.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      el.style.maxHeight = `${maxHeight}px`;
      if (matchWidth) el.style.minWidth = `${Math.round(r.width)}px`;
      const natural = el.offsetHeight;
      const below = vh - r.bottom - GAP - MARGIN;
      const above = r.top - GAP - MARGIN;
      const up = below < natural && above > below;
      const avail = Math.max(120, up ? above : below);
      el.style.maxHeight = `${Math.min(maxHeight, avail)}px`;
      if (up) {
        el.style.top = "";
        el.style.bottom = `${Math.round(vh - r.top + GAP)}px`;
      } else {
        el.style.bottom = "";
        el.style.top = `${Math.round(r.bottom + GAP)}px`;
      }
      const w = el.offsetWidth;
      let left = placement === "bottom-end" ? r.right - w : r.left;
      left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - w - MARGIN));
      el.style.left = `${Math.round(left)}px`;
      el.dataset.side = up ? "top" : "bottom";
    };
    place();
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onMove) : null;
    if (ro && ref.current) {
      ro.observe(ref.current);
      if (anchor.current) ro.observe(anchor.current);
    }
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      ro?.disconnect();
    };
  }, [open, asSheet, anchor, matchWidth, maxHeight, placement]);

  // outside pointerdown closes (popover only; the sheet has its backdrop)
  useEffect(() => {
    if (!open || asSheet) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      markLayerDismiss(e);
      closeRef.current("outside");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, asSheet, anchor]);

  // sheet: move focus inside, lock page scroll
  useEffect(() => {
    if (!open || !asSheet) return;
    const target = sheetInitialFocus?.current ?? ref.current;
    target?.focus({ preventScroll: true });
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open, asSheet, sheetInitialFocus]);

  if (!open || typeof document === "undefined") return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current("escape");
      return;
    }
    if (e.key === "Tab" && (asSheet || trapFocus) && ref.current) {
      const list = tabbables(ref.current);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (asSheet) {
    return createPortal(
      <div className="fm-sheet-layer" data-fm-layer="">
        <div
          className="fm-sheet-backdrop"
          aria-hidden="true"
          onPointerDown={(e) => {
            markLayerDismiss(e.nativeEvent);
            e.preventDefault();
            closeRef.current("outside");
          }}
        />
        <div
          ref={ref}
          id={id}
          className={"fm-sheet" + (className ? " " + className : "")}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <div className="fm-sheet__head">
            <span className="fm-sheet__title">{label}</span>
            <button type="button" className="fm-sheet__close" aria-label="Zavřít" onClick={() => closeRef.current("close-button")}>
              ×
            </button>
          </div>
          <div className="fm-sheet__body">{children}</div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={ref}
      id={id}
      className={"fm-pop" + (className ? " " + className : "")}
      data-fm-layer=""
      role={role}
      aria-label={role ? label : undefined}
      aria-modal={role === "dialog" && trapFocus ? "true" : undefined}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}
