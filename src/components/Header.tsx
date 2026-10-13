"use client";
/**
 * Navy header (prototype §6): logo, title, tabs, identity select „Přihlášen", „+ Nový úkol" / „+ Nová tiskovina".
 *
 * Layout (components.css): ≥1181px one row · 761–1180px two rows (brand + tools / tabs) · ≤760px a compact brand
 * row (logo, short title, avatar select, „+" icon button) above the tabs. Accessible names never change with the
 * viewport: the long title / tab label / button text stay in the DOM (visually hidden where shortened).
 */
import { useEffect, useMemo, useRef } from "react";
import { columnsOf } from "@/lib/filters";
import { ini } from "@/lib/format";
import type { View } from "@/lib/prefs";
import { usePrefs, useStoreSnapshot } from "@/lib/store/react";
import { colorOf, isLightColor, personsInOrder } from "@/lib/tree";
import { Select, type SelectOption } from "./ui";
import { useUi } from "./UiContext";

const TABS: Array<{ view: View; label: string; short?: string }> = [
  { view: "board", label: "Úkoly" },
  { view: "print", label: "Tiskoviny" },
  { view: "org", label: "Struktura týmu", short: "Tým" },
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
        <h1>
          <span className="brand-long">Marketingový plán úkolů</span>
          <span className="brand-short" aria-hidden="true">
            Marketing
          </span>
        </h1>
      </div>
      <nav className="tabs" id="tabs" aria-label="Sekce aplikace">
        {TABS.map((t) => {
          const on = prefs.view === t.view;
          return (
            <button
              key={t.view}
              type="button"
              data-view={t.view}
              className={on ? "on" : undefined}
              aria-current={on ? "page" : undefined}
              onClick={() => {
                ui.setReportOpen(false);
                updatePrefs({ view: t.view });
              }}
            >
              {t.short ? (
                <>
                  <span className="tab-long">{t.label}</span>
                  <span className="tab-short" aria-hidden="true">
                    {t.short}
                  </span>
                </>
              ) : (
                t.label
              )}
            </button>
          );
        })}
      </nav>
      <div className="tools">
        <IdentitySelect />
        <button className="btn primary" id="btnNew" type="button" onClick={onNew} disabled={!state}>
          <span className="bn-plus">+</span>
          <span className="bn-text"> {prefs.view === "print" ? "Nová tiskovina" : "Nový úkol"}</span>
        </button>
      </div>
    </header>
  );
}

function IdentitySelect() {
  const { state } = useStoreSnapshot();
  const [prefs, updatePrefs] = usePrefs();
  const nodes = state?.nodes;
  const persons = useMemo(() => (nodes ? personsInOrder(nodes) : []), [nodes]);
  const options = useMemo<SelectOption[]>(
    () => persons.map((p) => ({ value: p.id, label: p.name, meta: p.role ?? undefined, keywords: p.role ?? undefined })),
    [persons],
  );
  const empty = persons.length === 0;
  const placeholder = !state ? "Načítám…" : "Žádní členové";

  return (
    <div className="who-box">
      <label className="who-l" htmlFor="me">
        Přihlášen
      </label>
      <Select
        id="me"
        variant="onDark"
        aria-label="Přihlášen"
        sheetTitle="Přihlášen jako"
        className="who-sel"
        value={prefs.me ?? ""}
        options={options}
        disabled={empty}
        placeholder={placeholder}
        title={state && empty ? "Zatím nejsou žádní členové — přidejte je ve Struktuře týmu." : undefined}
        onChange={(v) => updatePrefs({ me: v || null })}
        renderValue={(opt) =>
          opt && nodes ? (
            <>
              <WhoAvatar color={colorOf(nodes, opt.value)} name={opt.label} />
              <span className="fm-select__value">{opt.label}</span>
            </>
          ) : (
            <span className="fm-select__value fm-select__ph">{placeholder}</span>
          )
        }
      />
    </div>
  );
}

/** Decorative avatar inside the identity trigger (the trigger's text already carries the name). */
function WhoAvatar({ color, name }: { color: string; name: string }) {
  return (
    <span className="av who-av" aria-hidden="true" style={{ background: color, color: isLightColor(color) ? "var(--fm-navy)" : "#fff" }}>
      {ini(name)}
    </span>
  );
}
