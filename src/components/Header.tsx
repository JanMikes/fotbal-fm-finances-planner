"use client";
/** Navy header (prototype §6): logo, title, tabs, identity select „Přihlášen", „+ Nový úkol" / „+ Nová tiskovina". */
import { useEffect, useRef } from "react";
import { columnsOf } from "@/lib/filters";
import type { View } from "@/lib/prefs";
import { usePrefs, useStoreSnapshot } from "@/lib/store/react";
import { personsInOrder } from "@/lib/tree";
import { useUi } from "./UiContext";

const TABS: Array<{ view: View; label: string }> = [
  { view: "board", label: "Úkoly" },
  { view: "print", label: "Tiskoviny" },
  { view: "org", label: "Struktura týmu" },
];

export function Header() {
  const [prefs, updatePrefs] = usePrefs();
  const { state } = useStoreSnapshot();
  const ui = useUi();
  const ref = useRef<HTMLElement | null>(null);

  // publish the header bottom as `--fm-top-h` (the yearly report sits right below the header, prototype §9.6)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty("--fm-top-h", `${el.getBoundingClientRect().bottom}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onNew = () => {
    if (!state) return;
    ui.setReportOpen(false); // the prototype's modal replaces the report in #modalRoot
    if (prefs.view === "print") {
      ui.openPrint(null, columnsOf(state.columns, "print")[0]?.id);
      return;
    }
    if (prefs.view === "org") updatePrefs({ view: "board" }); // the org tab keeps „+ Nový úkol" and jumps to Úkoly
    ui.openTask(null, columnsOf(state.columns, "tasks")[0]?.id);
  };

  return (
    <header className="top" ref={ref}>
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-short.svg" alt="Fotbal FM" />
        <div>
          <h1>Marketingový plán úkolů</h1>
        </div>
      </div>
      <nav className="tabs" id="tabs">
        {TABS.map((t) => (
          <button
            key={t.view}
            type="button"
            data-view={t.view}
            className={prefs.view === t.view ? "on" : undefined}
            onClick={() => {
              ui.setReportOpen(false);
              updatePrefs({ view: t.view });
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tools">
        <IdentitySelect />
        <button className="btn primary" id="btnNew" type="button" onClick={onNew}>
          {prefs.view === "print" ? "+ Nová tiskovina" : "+ Nový úkol"}
        </button>
      </div>
    </header>
  );
}

function IdentitySelect() {
  const { state } = useStoreSnapshot();
  const [prefs, updatePrefs] = usePrefs();
  const persons = state ? personsInOrder(state.nodes) : [];
  return (
    <label className="who">
      <span>Přihlášen</span>
      <select
        id="me"
        value={prefs.me ?? ""}
        title={persons.length === 0 ? "Zatím nejsou žádní členové — přidejte je ve Struktuře týmu." : undefined}
        onChange={(e) => updatePrefs({ me: e.target.value || null })}
      >
        {persons.length === 0 && <option value="">—</option>}
        {persons.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
