"use client";
/**
 * Úkoly filter bar (prototype §7.1): search, group select with counts, month select, „Jen moje úkoly", drag hint.
 * One row from 761 px (the hint only from 1280 px — it stays the board's description), collapsible „Filtry" on mobile.
 * „/" focuses the search.
 */
import { Select } from "@/components/ui/Select";
import { FilterBar } from "@/features/board/FilterBar";
import { useSlashFocus } from "@/features/board/useSlashFocus";
import { ALL } from "@/lib/constants";
import { groupCounts, taskMonthOptions } from "@/lib/filters";
import { useAppState, usePrefs } from "@/lib/store/react";

export const TASK_BOARD_HINT_ID = "boardHint";

export function TaskBar({ q, onQ }: { q: string; onQ: (q: string) => void }) {
  const state = useAppState();
  const [prefs, updatePrefs] = usePrefs();
  useSlashFocus("q");
  const groups = groupCounts(state.tasks);
  const month = prefs.month || "all";
  const months = taskMonthOptions(state.tasks, prefs.filter, new Date(), month);
  const active = (prefs.filter !== ALL ? 1 : 0) + (month !== "all" ? 1 : 0) + (prefs.mine ? 1 : 0);
  return (
    <FilterBar
      id="tbar"
      active={active}
      search={
        <input
          className="search"
          id="q"
          type="search"
          placeholder="Hledat v úkolech…"
          aria-label="Hledat v úkolech"
          aria-keyshortcuts="/"
          autoComplete="off"
          value={q}
          onChange={(e) => onQ(e.target.value)}
        />
      }
      after={
        <div className="hint" id={TASK_BOARD_HINT_ID}>
          Karty přetahujte myší nebo podržením prstu
          <span className="sr-only">. Kartu otevřete klávesou Enter, stav úkolu změníte v jeho detailu.</span>
        </div>
      }
    >
      <Select
        id="grp"
        variant="filter"
        className="fbar-sel"
        aria-label="Filtr kategorie"
        sheetTitle="Kategorie"
        value={prefs.filter}
        onChange={(v) => updatePrefs({ filter: v })}
        options={groups.map((g) => ({ value: g.group, label: g.label }))}
      />
      <Select
        id="mon"
        variant="filter"
        className="fbar-sel"
        aria-label="Filtr měsíce"
        sheetTitle="Měsíc"
        value={month}
        onChange={(v) => updatePrefs({ month: v })}
        options={months.map((m) => ({ value: m.value, label: m.label }))}
      />
      <label className="tog">
        <input type="checkbox" id="mine" checked={prefs.mine} onChange={(e) => updatePrefs({ mine: e.target.checked })} /> Jen moje úkoly
      </label>
    </FilterBar>
  );
}
