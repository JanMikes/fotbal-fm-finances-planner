"use client";
/**
 * Generic modal shell (prototype §8.1 `shell(title, body, foot)`):
 *   <div class="ov" id="ov"><div class="modal" role="dialog" aria-modal aria-labelledby>
 *     <div class="mh"><h2/><button class="close"/></div>{children = .mb}
 *     <div class="mf">[span.meta] [.mf-start] [.mf-end]</div></div></div>
 *
 * Behaviour (WAI-ARIA APG modal dialog): initial focus = `initialFocus` (skipped on coarse pointers so the
 * keyboard does not pop up) or the dialog; focus returns to the opener on unmount; Tab / Shift+Tab cycle inside;
 * focus that escapes is pulled back, except into body-portalled layers (`[data-fm-layer]`) and the toast.
 * Escape and Ctrl/Cmd+Enter (→ `onSubmit`) are handled on `window` and ignored when a layer already handled the
 * event (`defaultPrevented`); with stacked modals only the topmost reacts. Pointerdown on the overlay closes,
 * unless it merely dismissed a popover.
 *
 * Lives inside #modalRoot (sibling of .app) so the print stylesheet keeps working: either rendered there by the
 * caller (ModalHost) or, with `portal`, portalled there from anywhere (team forms).
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isLayerDismiss, tabbables } from "./layers";
import { isCoarsePointer } from "./useCoarsePointer";

export interface ModalProps {
  title: string;
  onClose: () => void;
  /** Usually a `<div className="mb">…</div>`. */
  children: ReactNode;
  /** Right-aligned footer actions (`.mf-end`): Zrušit, Uložit. */
  foot?: ReactNode;
  /** Left footer actions (`.mf-start`): Smazat, Duplikovat. */
  footStart?: ReactNode;
  /** Footer info line (wrapped in `span.meta`), e.g. „Založil(a) …". */
  meta?: ReactNode;
  /** Ctrl/Cmd+Enter anywhere in the modal. */
  onSubmit?: () => void;
  /** CSS selector (inside the modal) of the element to focus on open; ignored on coarse pointers. */
  initialFocus?: string;
  /** Extra attributes for e2e tests / styling. */
  testId?: string;
  /** Portal the modal into `#modalRoot` (for callers rendered inside `.app`). */
  portal?: boolean;
  size?: "md" | "lg";
}

/** Open modals, topmost last. */
const stack: symbol[] = [];

export function Modal({ title, onClose, children, foot, footStart, meta, onSubmit, initialFocus, testId, portal = false, size = "md" }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [token] = useState(() => Symbol("modal"));
  // the element that had focus when the modal opened (read once, before children can autofocus)
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null,
  );
  const closeRef = useRef(onClose);
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    closeRef.current = onClose;
    submitRef.current = onSubmit;
  }, [onClose, onSubmit]);

  const [host] = useState(() => (portal && typeof document !== "undefined" ? (document.getElementById("modalRoot") ?? document.body) : null));

  // stack membership, initial focus, focus restore
  useEffect(() => {
    stack.push(token);
    const dlg = dialogRef.current;
    if (dlg && !dlg.contains(document.activeElement)) {
      const target = initialFocus && !isCoarsePointer() ? dlg.querySelector<HTMLElement>(initialFocus) : null;
      (target ?? dlg).focus({ preventScroll: true });
    }
    return () => {
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // initialFocus is read on open only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, opener]);

  // Escape / Ctrl+Enter on window (bubble phase: after React handlers had the chance to preventDefault)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || stack[stack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && submitRef.current) {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [token]);

  // pull escaped focus back (layers and the toast are allowed)
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (stack[stack.length - 1] !== token) return;
      const dlg = dialogRef.current;
      const t = e.target as HTMLElement | null;
      if (!dlg || !t || dlg.contains(t) || t.closest?.("[data-fm-layer],.app-toast")) return;
      dlg.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [token]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dlg = dialogRef.current;
    // React events from body-portalled layers bubble here too — only trap Tab for DOM descendants
    if (e.key !== "Tab" || e.defaultPrevented || !dlg || !dlg.contains(e.target as Node)) return;
    const list = tabbables(dlg);
    if (!list.length) {
      e.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dlg)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const hasSlots = footStart !== undefined || meta !== undefined;
  const footer =
    foot !== undefined || hasSlots ? (
      <div className={"mf" + (hasSlots ? " mf--slots" : "")}>
        {meta !== undefined && meta !== null && meta !== "" ? <span className="meta">{meta}</span> : null}
        {footStart ? <div className="mf-start">{footStart}</div> : null}
        {foot !== undefined ? <div className="mf-end">{foot}</div> : null}
      </div>
    ) : null;

  const el = (
    <div
      className="ov"
      id="ov"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !isLayerDismiss(e.nativeEvent)) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={"modal" + (size === "lg" ? " modal--lg" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        onKeyDown={onKeyDown}
      >
        <div className="mh">
          <h2 id={titleId}>{title}</h2>
          <button className="close" type="button" data-close="" aria-label="Zavřít" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
  if (!portal) return el;
  return host ? createPortal(el, host) : null;
}
