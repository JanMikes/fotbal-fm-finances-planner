"use client";
/**
 * Org tree drag & drop with pointer events (prototype §10.8 — `oStart` / `oMove` / `oAuto` / `oEnd`):
 * mouse starts after 5 px, touch after a 220 ms hold (vibrate 15 ms; moving > 8 px first cancels so scrolling wins).
 * The source card stays in place as a dashed placeholder, a tilted clone (`.onode.ghost`) follows the pointer,
 * `#oTip` shows the target, `body.odrag` reveals the root zone. On drop the card settles from the ghost position.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { descendantsOf } from "@/lib/tree";
import type { OrgNode } from "@/lib/types";
import { dropTooltip, MOBILE_QUERY, resolveDropPos, type DropPos, type DropTarget } from "./dropZone";

export interface DragView {
  dragId: string | null;
  overId: string | null;
  overPos: DropPos | null;
  rootOver: boolean;
}

/**
 * The element that scrolls the tree horizontally: the tree itself when it is its own `overflow-x` scroller (> 760 px,
 * see team.css), otherwise the whole tab.
 */
export function horizontalScroller(container: HTMLElement): HTMLElement {
  const tree = container.querySelector<HTMLElement>("#tree");
  return tree && tree.scrollWidth > tree.clientWidth + 1 && getComputedStyle(tree).overflowX !== "visible" ? tree : container;
}

const IDLE: DragView = { dragId: null, overId: null, overPos: null, rootOver: false };

interface DragState {
  el: HTMLElement;
  id: string;
  x0: number;
  y0: number;
  x: number;
  y: number;
  touch: boolean;
  active: boolean;
  dx: number;
  dy: number;
  bad: Set<string>;
  ghost: HTMLElement | null;
  target: DropTarget | null;
}

export function useOrgDrag({
  containerRef,
  tipRef,
  nodesRef,
  onDrop,
}: {
  containerRef: RefObject<HTMLElement | null>;
  tipRef: RefObject<HTMLDivElement | null>;
  nodesRef: RefObject<OrgNode[]>;
  onDrop: (id: string, target: DropTarget) => void;
}) {
  const [view, setView] = useState<DragView>(IDLE);
  const viewRef = useRef<DragView>(IDLE);
  const O = useRef<DragState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);
  const endedAt = useRef(0);
  const settle = useRef<{ id: string; x: number; y: number } | null>(null);
  const [settleTick, setSettleTick] = useState(0);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });

  const publish = useCallback((v: DragView) => {
    const c = viewRef.current;
    if (c.dragId === v.dragId && c.overId === v.overId && c.overPos === v.overPos && c.rootOver === v.rootOver) return;
    viewRef.current = v;
    setView(v);
  }, []);

  const tip = useCallback((text: string, x = 0, y = 0) => {
    const el = tipRef.current;
    if (!el) return;
    if (!text) {
      el.style.display = "none";
      return;
    }
    el.textContent = text;
    el.style.display = "block";
    el.style.transform = `translate(${x + 16}px,${y + 18}px)`;
  }, [tipRef]);

  const move = useCallback(() => {
    const o = O.current;
    if (!o || !o.active || !o.ghost) return;
    o.ghost.style.transform = `translate(${o.x - o.dx}px,${o.y - o.dy}px) rotate(2deg)`;
    const el = document.elementFromPoint(o.x, o.y);
    let t = el?.closest<HTMLElement>("#tree .onode") ?? null;
    if (t && o.bad.has(t.dataset.uid ?? "")) t = null;
    const tn = t ? nodesRef.current.find((n) => n.id === t!.dataset.uid) : undefined;
    const drag = nodesRef.current.find((n) => n.id === o.id);
    if (t && tn && drag) {
      const r = t.getBoundingClientRect();
      const mobile = window.matchMedia(MOBILE_QUERY).matches;
      const f = mobile ? (o.y - r.top) / r.height : (o.x - r.left) / r.width;
      const pos = resolveDropPos(f, tn, drag.kind);
      tip(dropTooltip(pos, tn, mobile), o.x, o.y);
      o.target = { kind: "node", id: tn.id, pos };
      publish({ dragId: o.id, overId: tn.id, overPos: pos, rootOver: false });
      return;
    }
    tip("");
    const rz = el?.closest("#rootZone");
    o.target = rz ? { kind: "root" } : null;
    publish({ dragId: o.id, overId: null, overPos: null, rootOver: !!rz });
  }, [nodesRef, publish, tip]);

  const start = useCallback(() => {
    const o = O.current;
    if (!o) return;
    const r = o.el.getBoundingClientRect();
    o.dx = o.x0 - r.left;
    o.dy = o.y0 - r.top;
    o.bad = descendantsOf(nodesRef.current, o.id);
    const g = o.el.cloneNode(true) as HTMLElement;
    g.classList.add("ghost");
    g.classList.remove("drop", "drop-before", "drop-after", "ph");
    g.removeAttribute("tabindex");
    g.setAttribute("aria-hidden", "true");
    g.inert = true; // the cloned name / „i" / „+" buttons must not be focusable
    g.style.width = r.width + "px";
    document.body.appendChild(g);
    o.ghost = g;
    o.active = true;
    document.body.classList.add("dragging", "odrag");
    publish({ dragId: o.id, overId: null, overPos: null, rootOver: false });
    move();
    // autoscroll the tab within 60 px of its edges (12 px per frame), re-evaluating the target. Horizontally the
    // tree itself scrolls when it is its own scroller (> 760 px), else the tab.
    const loop = () => {
      const cur = O.current;
      const c = containerRef.current;
      if (!cur || !cur.active || !c) return;
      const cr = c.getBoundingClientRect();
      const m = 60;
      const sx = horizontalScroller(c);
      const xr = sx === c ? cr : sx.getBoundingClientRect();
      if (cur.x < xr.left + m) sx.scrollLeft -= 12;
      else if (cur.x > xr.right - m) sx.scrollLeft += 12;
      if (cur.y < cr.top + m) c.scrollTop -= 12;
      else if (cur.y > cr.bottom - m) c.scrollTop += 12;
      move();
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }, [containerRef, move, nodesRef, publish]);

  const end = useCallback(
    (cancel: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      const o = O.current;
      if (!o) return;
      if (!o.active) {
        O.current = null;
        return;
      }
      if (raf.current) cancelAnimationFrame(raf.current);
      const gx = o.x - o.dx;
      const gy = o.y - o.dy;
      o.ghost?.remove();
      tip("");
      document.body.classList.remove("dragging", "odrag");
      O.current = null;
      endedAt.current = Date.now();
      publish(IDLE);
      settle.current = { id: o.id, x: gx, y: gy };
      if (!cancel && o.target) onDropRef.current(o.id, o.target);
      setSettleTick((n) => n + 1);
    },
    [publish, tip],
  );

  // settle animation: the dropped card flies from the ghost position to its new place
  useLayoutEffect(() => {
    const s = settle.current;
    if (!s) return;
    settle.current = null;
    const el = containerRef.current?.querySelector<HTMLElement>(`#tree [data-uid="${s.id}"]`);
    if (!el || typeof el.animate !== "function") return;
    const r = el.getBoundingClientRect();
    const dx = s.x - r.left;
    const dy = s.y - r.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px,${dy}px) rotate(2deg)`, boxShadow: "0 14px 32px rgba(27,35,65,.25)" }, { transform: "none" }], {
      duration: 240,
      easing: "cubic-bezier(.2,.8,.2,1)",
    });
  }, [settleTick, containerRef]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const n = target.closest<HTMLElement>(".onode");
      if (!n || e.button > 0 || target.closest(".plus,.info") || !n.dataset.uid) return;
      O.current = {
        el: n,
        id: n.dataset.uid,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        touch: e.pointerType !== "mouse",
        active: false,
        dx: 0,
        dy: 0,
        bad: new Set(),
        ghost: null,
        target: null,
      };
      if (O.current.touch) {
        timer.current = setTimeout(() => {
          if (O.current && !O.current.active) {
            start();
            navigator.vibrate?.(15);
          }
        }, 220);
      }
    };
    const onMove = (e: PointerEvent) => {
      const o = O.current;
      if (!o) return;
      o.x = e.clientX;
      o.y = e.clientY;
      const d = Math.hypot(o.x - o.x0, o.y - o.y0);
      if (!o.active) {
        if (o.touch) {
          if (d > 8) {
            if (timer.current) clearTimeout(timer.current);
            O.current = null;
          }
        } else if (d > 5) start();
        return;
      }
      e.preventDefault();
      move();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (O.current?.active) e.preventDefault();
    };
    const onContext = (e: Event) => {
      if (O.current?.active) e.preventDefault();
    };
    const onUp = () => end(false);
    const onCancel = () => {
      if (O.current?.active) end(true);
      else {
        if (timer.current) clearTimeout(timer.current);
        O.current = null;
      }
    };
    c.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      if (O.current?.active) {
        O.current.ghost?.remove();
        document.body.classList.remove("dragging", "odrag");
      }
      if (raf.current) cancelAnimationFrame(raf.current);
      if (timer.current) clearTimeout(timer.current);
      O.current = null;
    };
  }, [containerRef, end, move, start]);

  /** True for ~50 ms after a drag ended — swallow the click that follows pointerup. */
  const justDragged = useCallback(() => Date.now() - endedAt.current < 50, []);

  return { view, justDragged };
}
