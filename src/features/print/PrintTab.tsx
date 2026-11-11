"use client";
/**
 * Tiskoviny tab: filter bar + board with the three fixed columns (prototype §9, DECISIONS #1) + the „Příjmy" column.
 * „Celkem" = visible spending − visible incomes.
 */
import { useState } from "react";
import { useUi } from "@/components/UiContext";
import { attachmentCounts } from "@/features/attachments/AttachmentBox";
import { Board } from "@/features/board/Board";
import { columnsOf, incomeVisible, itemsInColumn, printVisible, sortIncomes, sumIncomes, sumPrices } from "@/lib/filters";
import { kcs } from "@/lib/format";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import type { PrintIncome, PrintItem } from "@/lib/types";
import { IncomeCard } from "./IncomeCard";
import { PrintBar } from "./PrintBar";
import { PrintCard } from "./PrintCard";

const noop = () => undefined;

export function PrintTab() {
  const state = useAppState();
  const [prefs] = usePrefs();
  const actions = useActions();
  const { openPrint, openIncome, openTypes, setReportOpen } = useUi();
  const [q, setQ] = useState("");

  const cols = columnsOf(state.columns, "print");
  const lastId = cols.length ? cols[cols.length - 1].id : null;
  const typeName = new Map(state.printTypes.map((t) => [t.id, t.name]));
  const filter = { typeId: prefs.prFilter, month: prefs.prMonth, q };
  const visible = new Map<string, PrintItem[]>(
    cols.map((c) => [c.id, itemsInColumn(state.printItems, c.id, (i) => i.realizationDate).filter((i) => printVisible(i, typeName.get(i.typeId) ?? "", filter))]),
  );
  const incomes = sortIncomes(state.printIncomes.filter((i) => incomeVisible(i, filter)));
  const spent = sumPrices([...visible.values()].flat());
  const received = sumIncomes(incomes);
  const counts = attachmentCounts(state.attachments, "print");

  return (
    <>
      <PrintBar q={q} onQ={setQ} spent={spent} received={received} onTypes={openTypes} onYear={() => setReportOpen(true)} />
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
        after={<IncomeColumn incomes={incomes} onOpen={openIncome} />}
      />
    </>
  );
}

/** „Příjmy" column: not a drop target, cards are not draggable (no `data-col` / `data-id`, see useBoardDnd). */
function IncomeColumn({ incomes, onOpen }: { incomes: readonly PrintIncome[]; onOpen: (id: string | null) => void }) {
  return (
    <section className="col income" data-testid="income-col">
      <div className="colh">
        <span className="t">Příjmy</span>
        <span className="c">{incomes.length}</span>
        <span className="sum">{kcs(sumIncomes(incomes))}</span>
      </div>
      <div className="list">
        {incomes.map((i) => (
          <div
            key={i.id}
            className="card"
            data-income={i.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(i.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(i.id);
              }
            }}
          >
            <IncomeCard income={i} />
          </div>
        ))}
        {incomes.length === 0 && <div className="empty-col">Žádné příjmy</div>}
      </div>
      <button className="add" type="button" id="addIncome" onClick={() => onOpen(null)}>
        + Přidat příjem
      </button>
    </section>
  );
}
