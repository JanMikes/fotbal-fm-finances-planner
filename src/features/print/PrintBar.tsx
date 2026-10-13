"use client";
/**
 * Tiskoviny filter bar (prototype §9.1): search, type select with counts, month select with Kč sums, „Typy médií",
 * „Roční přehled" (opens the yearly report) and the red „Celkem …" box. Archived items are excluded everywhere
 * (DECISIONS #9). One row from 900 px; on mobile the selects sit behind „Filtry", the two buttons get their own row
 * (they are actions, not filters) and the total a slim row. „/" focuses the search.
 */
import { Select } from "@/components/ui/Select";
import { FilterBar } from "@/features/board/FilterBar";
import { useSlashFocus } from "@/features/board/useSlashFocus";
import { ALL } from "@/lib/constants";
import { printMonthOptions, printTotalLabel, printTypeOptions } from "@/lib/filters";
import { kcs } from "@/lib/format";
import { useAppState, usePrefs } from "@/lib/store/react";

export const PRINT_BOARD_HINT_ID = "boardHint";

export function PrintBar({ q, onQ, total, onTypes, onYear }: { q: string; onQ: (q: string) => void; total: number; onTypes: () => void; onYear: () => void }) {
  const state = useAppState();
  const [prefs, updatePrefs] = usePrefs();
  useSlashFocus("pq");
  const types = printTypeOptions(state.printItems, state.printTypes);
  const month = prefs.prMonth || "all";
  const months = printMonthOptions(state.printItems, prefs.prFilter, new Date(), month);
  const active = (prefs.prFilter !== ALL ? 1 : 0) + (month !== "all" ? 1 : 0);
  return (
    <FilterBar
      id="pbar"
      label="Hledání a filtry tiskovin"
      active={active}
      search={
        <input
          className="search"
          id="pq"
          type="search"
          placeholder="Hledat…"
          aria-label="Hledat v tiskovinách"
          aria-keyshortcuts="/"
          autoComplete="off"
          value={q}
          onChange={(e) => onQ(e.target.value)}
        />
      }
      after={
        <>
          <div className="fbar-actions">
            <button className="btn outline" id="btnTypes" type="button" onClick={onTypes}>
              Typy médií
            </button>
            <button className="btn outline" id="btnYear" type="button" onClick={onYear}>
              Roční přehled
            </button>
          </div>
          <div className="ptot">
            <span id="ptotL">{printTotalLabel(month)}</span> <b id="ptot">{kcs(total)}</b>
          </div>
          <p className="sr-only" id={PRINT_BOARD_HINT_ID}>
            Karty přetahujte myší nebo podržením prstu. Kartu otevřete klávesou Enter, stav tiskoviny změníte v jejím detailu.
          </p>
        </>
      }
    >
      <Select
        id="ptype"
        variant="filter"
        className="fbar-sel"
        aria-label="Filtr typu média"
        sheetTitle="Typ média"
        value={prefs.prFilter}
        onChange={(v) => updatePrefs({ prFilter: v })}
        options={types.map((t) => ({ value: t.value, label: t.label }))}
      />
      <Select
        id="pmon"
        variant="filter"
        className="fbar-sel"
        aria-label="Měsíc"
        sheetTitle="Měsíc"
        value={month}
        onChange={(v) => updatePrefs({ prMonth: v })}
        options={months.map((m) => ({ value: m.value, label: m.label }))}
      />
    </FilterBar>
  );
}
