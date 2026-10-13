"use client";
/**
 * Generic kanban board (prototype §7.3 / §9.3) used by Úkoly and Tiskoviny.
 * DOM / class names follow the prototype so the ported CSS applies:
 *   main.board[.pboard] > section.col[data-col] > (.colh > .t .c [.sum] [.x]) + (.list[data-list] > .card[data-id]…) + button.add
 *   + button.addcol (tasks only)
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BoardColumn } from "@/lib/types";
import { useBoardDnd } from "./useBoardDnd";

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
}

export function Board<T extends BoardItem>(props: BoardProps<T>) {
  const { mode, columns, visible, renderCard, columnExtra, emptyText, addText, onOpen, onAdd, onMove, columnEditing } = props;
  const boardRef = useRef<HTMLElement | null>(null);
  const { drag, ghost, ghostRef, cardPointerDown, wasDragging } = useBoardDnd(boardRef, onMove);

  const byId = new Map<string, T>();
  for (const items of visible.values()) for (const it of items) byId.set(it.id, it);
  const dragged = drag ? byId.get(drag.id) : undefined;

  /** Items to render in a column, with the dragged card placed at the live placeholder position. */
  const itemsFor = (colId: string): readonly T[] => {
    const base = visible.get(colId) ?? [];
    if (!drag || !dragged) return base;
    const rest = base.filter((t) => t.id !== drag.id);
    if (drag.colId !== colId) return rest;
    const i = drag.beforeId ? rest.findIndex((t) => t.id === drag.beforeId) : -1;
    const out = [...rest];
    out.splice(i < 0 ? out.length : i, 0, dragged);
    return out;
  };

  return (
    <main className={`board${mode === "print" ? " pboard" : ""}`} id="board" ref={boardRef}>
      {columns.map((c) => {
        const original = visible.get(c.id) ?? [];
        const items = itemsFor(c.id);
        const showEmpty = items.length === 0 && !(drag && drag.touched.has(c.id));
        return (
          <section key={c.id} className={`col${drag?.overCol === c.id ? " over" : ""}`} data-col={c.id}>
            <div className="colh">
              {columnEditing ? (
                <ColumnTitle title={c.title} onRename={(t) => columnEditing.onRename(c.id, t)} />
              ) : (
                <span className="t">{c.title}</span>
              )}
              <span className="c">{original.length}</span>
              {columnExtra?.(c, original)}
              {columnEditing && (
                <button className="x" type="button" title="Smazat sloupec" onClick={() => !wasDragging() && columnEditing.onDelete(c.id)}>
                  ×
                </button>
              )}
            </div>
            <div className="list" data-list={c.id}>
              {items.map((t, idx) => (
                <div
                  key={t.id}
                  className={`card${drag?.id === t.id ? " ph" : ""}`}
                  data-id={t.id}
                  onPointerDown={(e) => {
                    const next = items[idx + 1]?.id ?? null;
                    cardPointerDown(e, t.id, c.id, next);
                  }}
                  onClick={() => {
                    if (!wasDragging()) onOpen(t.id);
                  }}
                >
                  {renderCard(t)}
                </div>
              ))}
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
