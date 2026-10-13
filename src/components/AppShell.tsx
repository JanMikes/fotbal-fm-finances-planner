"use client";
/**
 * PHASE-1 PLACEHOLDER app shell (header, tabs, identity select). Phase 2 replaces the <main> content with the
 * real boards / org view. Markup and class names follow prototype.md §2 / §6.
 */
import { StoreGate, StoreProvider, useAppState, usePrefs, useStoreSnapshot } from "@/lib/store/react";
import { personsInOrder } from "@/lib/tree";
import type { View } from "@/lib/prefs";

const TABS: Array<{ view: View; label: string }> = [
  { view: "board", label: "Úkoly" },
  { view: "print", label: "Tiskoviny" },
  { view: "org", label: "Struktura týmu" },
];

export function AppShell() {
  return (
    <StoreProvider>
      <div className="app">
        <Header />
        <StoreGate>
          <Placeholder />
        </StoreGate>
      </div>
      <div id="modalRoot" />
    </StoreProvider>
  );
}

function Header() {
  const [prefs, updatePrefs] = usePrefs();
  return (
    <header className="top">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-short.svg" alt="Fotbal FM" />
        <div>
          <h1>Marketingový plán úkolů</h1>
        </div>
      </div>
      <nav className="tabs" id="tabs">
        {TABS.map((t) => (
          <button key={t.view} type="button" className={prefs.view === t.view ? "on" : undefined} onClick={() => updatePrefs({ view: t.view })}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tools">
        <IdentitySelect />
        <button className="btn primary" id="btnNew" type="button">
          {prefs.view === "print" ? "+ Nová tiskovina" : "+ Nový úkol"}
        </button>
      </div>
    </header>
  );
}

function IdentitySelect() {
  const snap = useStoreSnapshot();
  const [prefs, updatePrefs] = usePrefs();
  const persons = snap.state ? personsInOrder(snap.state.nodes) : [];
  return (
    <label className="who">
      <span>Přihlášen</span>
      <select id="me" value={prefs.me ?? ""} onChange={(e) => updatePrefs({ me: e.target.value || null })}>
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

function Placeholder() {
  const state = useAppState();
  const [prefs] = usePrefs();
  return (
    <main className="board" id="board" data-phase1-placeholder="">
      <div className="app-msg">
        {prefs.view === "board" && `Úkoly: ${state.tasks.length}`}
        {prefs.view === "print" && `Tiskoviny: ${state.printItems.filter((i) => !i.archived).length}`}
        {prefs.view === "org" && `Struktura týmu: ${state.nodes.length} uzlů`}
      </div>
    </main>
  );
}
