"use client";
/**
 * Card drag & drop for both boards — a React port of prototype §7.7 (mouse + touch):
 *  - mouse: drag starts after moving > 5 px; touch/pen: hold 220 ms (navigator.vibrate(15)), moving > 8 px before
 *    that cancels (the gesture becomes a scroll);
 *  - the original card stays in the list as the placeholder (`.ph`) and moves LIVE to the drop position;
 *  - a ghost clone (`.card.ghost`, rotated 2°) follows the pointer; the hovered column gets `.over`;
 *  - autoscroll: board horizontally (60 px edge, 12 px/frame), the hovered list vertically (40 px edge, 10 px/frame);
 *  - drop → `onDrop(id, columnId, beforeId)` where beforeId = the next VISIBLE card (null = append);
 *  - the click that follows a drag is swallowed for 50 ms (`justEnded`).
 * Layout reads use the DOM (data-col / data-list / data-id attributes), placement is React state.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export interface DragView {
  /** Dragged item id. */
  id: string;
  /** Column the placeholder currently sits in. */
  colId: string;
  /** Placeholder sits before this (visible) item; null = at the end of the list. */
  beforeId: string | null;
  /** Column under the pointer (gets `.over`). */
  overCol: string | null;
  /** Columns the pointer has visited — their „empty" text is removed (prototype removes `.empty-col`). */
  touched: ReadonlySet<string>;
}

export interface GhostView {
  id: string;
  width: number;
  transform: string;
}

interface Pointer {
  id: string;
  card: HTMLElement;
  x0: number;
  y0: number;
  x: number;
  y: number;
  touch: boolean;
  active: boolean;
  dx: number;
  dy: number;
  list: HTMLElement | null;
  origin: { colId: string; beforeId: string | null };
}

export function useBoardDnd(
  boardRef: RefObject<HTMLElement | null>,
  onDrop: (id: string, columnId: string, beforeId: string | null) => void,
) {
  const [drag, setDrag] = useState<DragView | null>(null);
  const [ghost, setGhost] = useState<GhostView | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const P = useRef<Pointer | null>(null);
  const dragRef = useRef<DragView | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);
  const justEnded = useRef(false);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  const commit = useCallback((next: DragView | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const transformOf = (p: Pointer) => `translate(${p.x - p.dx}px,${p.y - p.dy}px) rotate(2deg)`;

  const moveDrag = useCallback(() => {
    const p = P.current;
    const cur = dragRef.current;
    if (!p || !p.active || !cur) return;
    if (ghostRef.current) ghostRef.current.style.transform = transformOf(p);
    const el = document.elementFromPoint(p.x, p.y);
    const col = el?.closest<HTMLElement>(".col") ?? null;
    if (!col || !boardRef.current?.contains(col)) {
      // pointer outside every column: the placeholder stays where it was
      if (cur.overCol !== null) commit({ ...cur, overCol: null });
      return;
    }
    const colId = col.dataset.col!;
    const list = col.querySelector<HTMLElement>(".list");
    p.list = list;
    if (!list) return;
    const cards = [...list.querySelectorAll<HTMLElement>(".card:not(.ph)")];
    const before = cards.find((c) => {
      const r = c.getBoundingClientRect();
      return p.y < r.top + r.height / 2;
    });
    const beforeId = before?.dataset.id ?? null;
    if (cur.colId !== colId || cur.beforeId !== beforeId || cur.overCol !== colId || !cur.touched.has(colId)) {
      const touched = cur.touched.has(colId) ? cur.touched : new Set([...cur.touched, colId]);
      commit({ ...cur, colId, beforeId, overCol: colId, touched });
    }
  }, [boardRef, commit]);

  /** Start the rAF autoscroll loop (runs while the drag is active). */
  const autoScroll = useCallback(() => {
    const tick = () => {
      const p = P.current;
      if (!p || !p.active) return;
      const board = boardRef.current;
      if (board) {
        const br = board.getBoundingClientRect();
        const m = 60;
        if (p.x < br.left + m) board.scrollLeft -= 12;
        else if (p.x > br.right - m) board.scrollLeft += 12;
      }
      if (p.list && p.list.isConnected) {
        const lr = p.list.getBoundingClientRect();
        if (p.y < lr.top + 40) p.list.scrollTop -= 10;
        else if (p.y > lr.bottom - 40) p.list.scrollTop += 10;
      }
      moveDrag();
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [boardRef, moveDrag]);

  const startDrag = useCallback(() => {
    const p = P.current;
    if (!p || p.active) return;
    const r = p.card.getBoundingClientRect();
    p.dx = p.x0 - r.left;
    p.dy = p.y0 - r.top;
    p.active = true;
    document.body.classList.add("dragging");
    setGhost({ id: p.id, width: r.width, transform: transformOf(p) });
    commit({ id: p.id, colId: p.origin.colId, beforeId: p.origin.beforeId, overCol: null, touched: new Set() });
    moveDrag();
    autoScroll();
  }, [autoScroll, commit, moveDrag]);

  const endDrag = useCallback(
    (cancel = false) => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
      pressTimer.current = null;
      const p = P.current;
      if (!p) return;
      P.current = null;
      if (!p.active) return; // a plain click falls through to onClick
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
      document.body.classList.remove("dragging");
      const final = dragRef.current;
      setGhost(null);
      commit(null);
      justEnded.current = true;
      setTimeout(() => {
        justEnded.current = false;
      }, 50);
      if (!final || cancel) return;
      if (final.colId === p.origin.colId && final.beforeId === p.origin.beforeId) return; // unchanged
      onDropRef.current(final.id, final.colId, final.beforeId);
    },
    [commit],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = P.current;
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      const dist = Math.hypot(p.x - p.x0, p.y - p.y0);
      if (!p.active) {
        if (p.touch) {
          if (dist > 8) {
            if (pressTimer.current) clearTimeout(pressTimer.current);
            P.current = null;
          }
        } else if (dist > 5) startDrag();
        return;
      }
      e.preventDefault();
      moveDrag();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (P.current?.active) e.preventDefault();
    };
    const onUp = () => endDrag();
    const onCancel = () => {
      if (P.current?.active) endDrag();
      else {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        P.current = null;
      }
    };
    const onContext = (e: Event) => {
      if (P.current?.active) e.preventDefault();
    };
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("contextmenu", onContext);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("contextmenu", onContext);
      if (pressTimer.current) clearTimeout(pressTimer.current);
      if (raf.current != null) cancelAnimationFrame(raf.current);
      document.body.classList.remove("dragging");
    };
  }, [endDrag, moveDrag, startDrag]);

  /** Attach to each card: `onPointerDown={(e) => cardPointerDown(e, id, colId, nextVisibleId)}`. */
  const cardPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, id: string, colId: string, nextId: string | null) => {
      if (e.button > 0) return;
      const touch = e.pointerType !== "mouse";
      P.current = {
        id,
        card: e.currentTarget,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        touch,
        active: false,
        dx: 0,
        dy: 0,
        list: null,
        origin: { colId, beforeId: nextId },
      };
      if (touch) {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        pressTimer.current = setTimeout(() => {
          if (P.current && !P.current.active) {
            startDrag();
            navigator.vibrate?.(15);
          }
        }, 220);
      }
    },
    [startDrag],
  );

  /** True for ~50 ms after a drag ended (swallow the click that follows pointerup). */
  const wasDragging = useCallback(() => justEnded.current, []);

  return { drag, ghost, ghostRef, cardPointerDown, wasDragging };
}
