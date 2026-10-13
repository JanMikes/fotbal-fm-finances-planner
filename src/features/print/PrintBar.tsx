"use client";
/**
 * Tiskoviny filter bar (prototype §9.1): type select with counts, month select with Kč sums, search,
 * „Typy médií", „Uzavřít rok" and the red „Celkem …" box. Archived items are excluded everywhere (DECISIONS #9).
 */
import { printMonthOptions, printTotalLabel, printTypeOptions } from "@/lib/filters";
import { kcs } from "@/lib/format";
import { useAppState, usePrefs } from "@/lib/store/react";

export function PrintBar({ q, onQ, total, onTypes, onYear }: { q: string; onQ: (q: string) => void; total: number; onTypes: () => void; onYear: () => void }) {
  const state = useAppState();
  const [prefs, updatePrefs] = usePrefs();
  const types = printTypeOptions(state.printItems, state.printTypes);
  const month = prefs.prMonth || "all";
  const months = printMonthOptions(state.printItems, prefs.prFilter, new Date(), month);
  return (
    <div className="bar" id="pbar">
      <div className="sub">
        <select className="search fsel" id="ptype" aria-label="Filtr typu média" value={prefs.prFilter} onChange={(e) => updatePrefs({ prFilter: e.target.value })}>
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select className="search fsel" id="pmon" aria-label="Měsíc" value={month} onChange={(e) => updatePrefs({ prMonth: e.target.value })}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <input className="search" id="pq" type="search" placeholder="Hledat v tiskovinách…" value={q} onChange={(e) => onQ(e.target.value)} />
        <button className="btn outline" id="btnTypes" type="button" onClick={onTypes}>
          Typy médií
        </button>
        <button className="btn outline" id="btnYear" type="button" onClick={onYear}>
          Uzavřít rok
        </button>
        <div className="ptot">
          <span id="ptotL">{printTotalLabel(month)}</span> <b id="ptot">{kcs(total)}</b>
        </div>
      </div>
    </div>
  );
}
