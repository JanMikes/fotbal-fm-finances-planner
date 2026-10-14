"use client";
/** Úkoly tab: filter bar + kanban board with editable columns (prototype §7). */
import { useState } from "react";
import { useUi } from "@/components/UiContext";
import { attachmentCounts } from "@/features/attachments/AttachmentBox";
import { Board } from "@/features/board/Board";
import { columnsOf, itemsInColumn, taskVisible } from "@/lib/filters";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import type { Task } from "@/lib/types";
import { TaskBar } from "./TaskBar";
import { TaskCard } from "./TaskCard";

const noop = () => undefined;

export function TasksTab() {
  const state = useAppState();
  const [prefs] = usePrefs();
  const actions = useActions();
  const { openTask } = useUi();
  const [q, setQ] = useState("");

  const cols = columnsOf(state.columns, "tasks");
  const lastId = cols.length ? cols[cols.length - 1].id : null;
  const filter = { filter: prefs.filter, month: prefs.month, mine: prefs.mine, me: prefs.me, q };
  const visible = new Map<string, Task[]>(cols.map((c) => [c.id, itemsInColumn(state.tasks, c.id).filter((t) => taskVisible(t, filter))]));
  const counts = attachmentCounts(state.attachments, "task");

  return (
    <>
      <TaskBar q={q} onQ={setQ} />
      <Board<Task>
        mode="tasks"
        columns={cols}
        visible={visible}
        emptyText="Žádné úkoly"
        addText="+ Přidat úkol"
        renderCard={(t) => <TaskCard task={t} nodes={state.nodes} inLastColumn={t.columnId === lastId} attachments={counts.get(t.id) ?? 0} />}
        onOpen={(id) => openTask(id)}
        onAdd={(colId) => openTask(null, colId)}
        onMove={(id, colId, beforeId) => void actions.moveTask(id, colId, beforeId).catch(noop)}
        columnEditing={{
          onRename: (id, title) => void actions.renameColumn(id, title).catch(noop),
          onDelete: (id) => {
            if (cols.length <= 1) {
              window.alert("Musí zůstat alespoň jeden sloupec.");
              return;
            }
            const n = state.tasks.filter((t) => t.columnId === id).length;
            if (n && !window.confirm(`Sloupec obsahuje ${n} úkolů. Přesunout je do prvního sloupce a sloupec smazat?`)) return;
            void actions.deleteColumn(id).catch(noop);
          },
          onAddColumn: () => {
            const t = window.prompt("Název sloupce", "Nový sloupec");
            const title = t?.trim();
            if (!title) return false; // whitespace-only names are rejected (DECISIONS #9)
            void actions.createColumn(title).catch(noop);
            return true;
          },
        }}
      />
    </>
  );
}
