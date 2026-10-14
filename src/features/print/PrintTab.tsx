"use client";
/** Tiskoviny tab: filter bar + board with the three fixed columns (prototype §9, DECISIONS #1). */
import { useState } from "react";
import { useUi } from "@/components/UiContext";
import { attachmentCounts } from "@/features/attachments/AttachmentBox";
import { Board } from "@/features/board/Board";
import { columnsOf, itemsInColumn, printVisible, sumPrices } from "@/lib/filters";
import { kcs } from "@/lib/format";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import type { PrintItem } from "@/lib/types";
import { PrintBar } from "./PrintBar";
import { PrintCard } from "./PrintCard";

const noop = () => undefined;

export function PrintTab() {
  const state = useAppState();
  const [prefs] = usePrefs();
  const actions = useActions();
  const { openPrint, openTypes, setReportOpen } = useUi();
  const [q, setQ] = useState("");

  const cols = columnsOf(state.columns, "print");
  const lastId = cols.length ? cols[cols.length - 1].id : null;
  const typeName = new Map(state.printTypes.map((t) => [t.id, t.name]));
  const filter = { typeId: prefs.prFilter, month: prefs.prMonth, q };
  const visible = new Map<string, PrintItem[]>(
    cols.map((c) => [c.id, itemsInColumn(state.printItems, c.id).filter((i) => printVisible(i, typeName.get(i.typeId) ?? "", filter))]),
  );
  const total = sumPrices([...visible.values()].flat());
  const counts = attachmentCounts(state.attachments, "print");

  return (
    <>
      <PrintBar q={q} onQ={setQ} total={total} onTypes={openTypes} onYear={() => setReportOpen(true)} />
      <Board<PrintItem>
        mode="print"
        columns={cols}
        visible={visible}
        emptyText="Žádné tiskoviny"
        addText="+ Přidat tiskovinu"
        columnExtra={(_c, items) => <span className="sum">{kcs(sumPrices(items))}</span>}
        renderCard={(i) => (
          <PrintCard item={i} typeName={typeName.get(i.typeId) ?? ""} inLastColumn={i.columnId === lastId} attachments={counts.get(i.id) ?? 0} />
        )}
        onOpen={(id) => openPrint(id)}
        onAdd={(colId) => openPrint(null, colId)}
        onMove={(id, colId, beforeId) => void actions.movePrintItem(id, colId, beforeId).catch(noop)}
      />
    </>
  );
}
