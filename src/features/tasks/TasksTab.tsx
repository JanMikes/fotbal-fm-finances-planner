"use client";
/** Úkoly tab: filter bar + kanban board with editable columns (prototype §7). */
import { useState } from "react";
import { useUi } from "@/components/UiContext";
import { attachmentCounts } from "@/features/attachments/AttachmentBox";
import { Board } from "@/features/board/Board";
import { BoardEmpty } from "@/features/board/BoardEmpty";
import { ALL } from "@/lib/constants";
import { columnsOf, itemsInColumn, taskVisible } from "@/lib/filters";
import { plural } from "@/lib/format";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import type { Task } from "@/lib/types";
import { TASK_BOARD_HINT_ID, TaskBar } from "./TaskBar";
import { TaskCard } from "./TaskCard";

const noop = () => undefined;

export function TasksTab() {
  const state = useAppState();
  const [prefs, updatePrefs] = usePrefs();
  const actions = useActions();
  const { openTask } = useUi();
  const [q, setQ] = useState("");

  const cols = columnsOf(state.columns, "tasks");
  const lastId = cols.length ? cols[cols.length - 1].id : null;
  const filter = { filter: prefs.filter, month: prefs.month, mine: prefs.mine, me: prefs.me, q };
  const visible = new Map<string, Task[]>(cols.map((c) => [c.id, itemsInColumn(state.tasks, c.id).filter((t) => taskVisible(t, filter))]));
  const counts = attachmentCounts(state.attachments, "task");
  const filtered = prefs.filter !== ALL || (prefs.month || "all") !== "all" || prefs.mine || q.trim() !== "";
  const nothingShown = [...visible.values()].every((items) => items.length === 0);

  const resetFilters = () => {
    updatePrefs({ filter: ALL, month: "all", mine: false });
    setQ("");
    document.getElementById("q")?.focus();
  };

  return (
    <>
      <TaskBar q={q} onQ={setQ} />
      <BoardEmpty show={filtered && nothingShown} text="Filtru neodpovídá žádný úkol." onReset={resetFilters} />
      <Board<Task>
        mode="tasks"
        columns={cols}
        visible={visible}
        emptyText="Žádné úkoly"
        addText="+ Přidat úkol"
        describedBy={TASK_BOARD_HINT_ID}
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
            const what = n === 1 ? "1 úkol. Přesunout ho" : `${n} ${plural(n, "úkol", "úkoly", "úkolů")}. Přesunout je`;
            if (n && !window.confirm(`Sloupec obsahuje ${what} do prvního sloupce a sloupec smazat?`)) return;
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
