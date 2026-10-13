"use client";
/** Úkoly filter bar (prototype §7.1): group select with counts, month select, search, „Jen moje úkoly", hint. */
import { groupCounts, taskMonthOptions } from "@/lib/filters";
import { useAppState, usePrefs } from "@/lib/store/react";

export function TaskBar({ q, onQ }: { q: string; onQ: (q: string) => void }) {
  const state = useAppState();
  const [prefs, updatePrefs] = usePrefs();
  const groups = groupCounts(state.tasks);
  const months = taskMonthOptions(state.tasks, prefs.filter);
  const month = prefs.month || "all";
  return (
    <div className="bar">
      <div className="sub">
        <select className="search fsel" id="grp" aria-label="Filtr kategorie" value={prefs.filter} onChange={(e) => updatePrefs({ filter: e.target.value })}>
          {groups.map((g) => (
            <option key={g.group} value={g.group}>
              {g.label}
            </option>
          ))}
        </select>
        <select className="search fsel" id="mon" aria-label="Filtr měsíce" value={month} onChange={(e) => updatePrefs({ month: e.target.value })}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <input className="search" id="q" type="search" placeholder="Hledat v úkolech…" value={q} onChange={(e) => onQ(e.target.value)} />
        <label className="tog">
          <input type="checkbox" id="mine" checked={prefs.mine} onChange={(e) => updatePrefs({ mine: e.target.checked })} /> Jen moje úkoly
        </label>
        <div className="hint">Karty přetahujte myší nebo podržením prstu</div>
      </div>
    </div>
  );
}
