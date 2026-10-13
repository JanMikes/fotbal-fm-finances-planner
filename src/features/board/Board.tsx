"use client";
/**
 * Generic kanban board (prototype §7.3 / §9.3) used by Úkoly and Tiskoviny.
 * DOM / class names follow the prototype so the ported CSS applies:
 *   .board-wrap > main.board[.pboard] > section.col[data-col] > (.colh > .t .c [.sum] [.x])
 *     + (.list[data-list] > .card[data-id][role=button][tabindex=0]…) + button.add  + button.addcol (tasks only)
 * Cards open on click, Enter or Space (not while dragging). `.board-wrap` gets `fade-l` / `fade-r` while the board
 * can scroll further left / right (edge fade, board.css).
 */
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BoardColumn } from "@/lib/types";
import { useBoardDnd } from "./useBoardDnd";
import "./board.css";

export interface BoardItem {
  id: string;
}

export interface BoardProps<T extends BoardItem> {
  /** `print` adds `.pboard` (columns fill the width), shows column sums and hides column editing. */
  mode: "tasks" | "print";
  columns: readonly BoardColumn[];
  /** Visible (filtered) items per column id, in display order. */
  visible: ReadonlyMap<string, readonly T[]>;
  /** Inner HTML of a card (everything inside `.card`). */
  renderCard: (item: T) => ReactNode;
  /** Extra header content after the count (print: `.sum`). Receives the visible items of the column. */
  columnExtra?: (col: BoardColumn, items: readonly T[]) => ReactNode;
  emptyText: string;
  addText: string;
  onOpen: (id: string) => void;
  onAdd: (columnId: string) => void;
  onMove: (id: string, columnId: string, beforeId: string | null) => void;
  /** Tasks board only. */
  columnEditing?: {
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
    onAddColumn: () => Promise<boolean> | boolean;
  };
  /** id of the element describing the board (drag hint), → `aria-describedby`. */
  describedBy?: string;
}

/** Toggle the edge-fade classes of `.board-wrap` from the board's scroll position (imperative: no re-render). */
function updateFade(board: HTMLElement | null) {
  const wrap = board?.parentElement;
  if (!board || !wrap) return;
  const max = board.scrollWidth - board.clientWidth;
  wrap.classList.toggle("fade-l", board.scrollLeft > 4);
  wrap.classList.toggle("fade-r", max - board.scrollLeft > 4);
}

export function Board<T extends BoardItem>(props: BoardProps<T>) {
  const { mode, columns, visible, renderCard, columnExtra, emptyText, addText, onOpen, onAdd, onMove, columnEditing, describedBy } = props;
  const boardRef = useRef<HTMLElement | null>(null);
  const { drag, ghost, ghostRef, cardPointerDown, wasDragging } = useBoardDnd(boardRef, onMove);

  // edge fade: on resize of the board or of its content (columns added, cards changed)
  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateFade(el));
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    updateFade(el);
    return () => ro.disconnect();
  }, [columns.length]);

  const onCardKey = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if ((e.key !== "Enter" && e.key !== " ") || e.target !== e.currentTarget || e.repeat) return;
    e.preventDefault();
    if (!drag && !wasDragging()) onOpen(id);
  };

  const byId = new Map<string, T>();
  for (const items of visible.values()) for (const it of items) byId.set(it.id, it);
  const dragged = drag ? byId.get(drag.id) : undefined;

  /**
   * Entries to render in a column. While dragging, the original card stays at its place (hidden, `data-dragsrc`)
   * so the touched DOM node is never re-mounted, and a separate placeholder (`.ph`) shows the live drop position.
   */
  const entriesFor = (colId: string): Array<{ item: T; ph: boolean }> => {
    const base = (visible.get(colId) ?? []).map((item) => ({ item, ph: false }));
    if (!drag || !dragged || drag.colId !== colId) return base;
    const at = drag.beforeId ? base.findIndex((e) => e.item.id === drag.beforeId) : -1;
    const out = [...base];
    out.splice(at < 0 ? out.length : at, 0, { item: dragged, ph: true });
    return out;
  };

  return (
    <div className="board-wrap">
      <main
        className={`board${mode === "print" ? " pboard" : ""}`}
        id="board"
        ref={boardRef}
        aria-label={mode === "print" ? "Tabule tiskovin" : "Tabule úkolů"}
        aria-describedby={describedBy}
        onScroll={(e) => updateFade(e.currentTarget)}
      >
        {columns.map((c) => {
          const original = visible.get(c.id) ?? [];
          const entries = entriesFor(c.id);
          const shown = entries.filter((e) => e.ph || e.item.id !== drag?.id);
          const showEmpty = shown.length === 0 && !(drag && drag.touched.has(c.id));
          return (
            <section key={c.id} className={`col${drag?.overCol === c.id ? " over" : ""}`} data-col={c.id}>
              <div className="colh">
                {/* column titles are the h2 level between the page h1 and the card h3s */}
                {columnEditing ? (
                  <>
                    <h2 className="sr-only">{c.title}</h2>
                    <ColumnTitle title={c.title} onRename={(t) => columnEditing.onRename(c.id, t)} />
                  </>
                ) : (
                  <h2 className="t">{c.title}</h2>
                )}
                <span className="c">{original.length}</span>
                {columnExtra?.(c, original)}
                {columnEditing && (
                  <button
                    className="x"
                    type="button"
                    title="Smazat sloupec"
                    aria-label={`Smazat sloupec ${c.title}`}
                    onClick={() => !wasDragging() && columnEditing.onDelete(c.id)}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="list" data-list={c.id}>
                {entries.map(({ item: t, ph }) =>
                  ph ? (
                    <div key=" ph" className="card ph" aria-hidden="true">
                      {renderCard(t)}
                    </div>
                  ) : (
                    <div
                      key={t.id}
                      className="card"
                      data-id={t.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => onCardKey(e, t.id)}
                      {...(drag?.id === t.id ? { "data-dragsrc": "", style: { display: "none" } } : {})}
                      onPointerDown={(e) => {
                        const next = original[original.findIndex((x) => x.id === t.id) + 1]?.id ?? null;
                        cardPointerDown(e, t.id, c.id, next);
                      }}
                      onClick={() => {
                        if (!wasDragging()) onOpen(t.id);
                      }}
                    >
                      {renderCard(t)}
                    </div>
                  ),
                )}
                {showEmpty && <div className="empty-col">{emptyText}</div>}
              </div>
              <button className="add" type="button" data-addto={c.id} onClick={() => !wasDragging() && onAdd(c.id)}>
                {addText}
              </button>
            </section>
          );
        })}
        {columnEditing && (
          <button
            className="addcol"
            id="addCol"
            type="button"
            onClick={async () => {
              if (wasDragging()) return;
              const added = await columnEditing.onAddColumn();
              if (added) {
                // scroll fully right once the new column rendered (prototype setTimeout 0)
                setTimeout(() => {
                  if (boardRef.current) boardRef.current.scrollLeft = boardRef.current.scrollWidth;
                }, 0);
              }
            }}
          >
            + Sloupec
          </button>
        )}
        {ghost &&
          dragged &&
          createPortal(
            <div className="card ghost" ref={ghostRef} style={{ width: ghost.width, transform: ghost.transform }} data-id={ghost.id}>
              {renderCard(dragged)}
            </div>,
            document.body,
          )}
      </main>
    </div>
  );
}

/**
 * Inline-editable column title (contenteditable, Enter = save, empty = restore). Prototype §7.3.
 * The text is managed imperatively (no React children) so browser editing never fights React reconciliation.
 */
function ColumnTitle({ title, onRename }: { title: string; onRename: (title: string) => void }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== title) el.textContent = title;
  }, [title]);
  return (
    <span
      ref={ref}
      className="t"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label="Název sloupce"
      data-rename=""
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const v = (e.currentTarget.textContent ?? "").trim();
        if (v && v !== title) onRename(v);
        else e.currentTarget.textContent = title;
      }}
    />
  );
}
