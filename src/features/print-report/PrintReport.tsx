"use client";
/**
 * „Roční přehled tiskovin" — yearly print report (prototype.md §9.6 `openYear`, prompt.md §4.1).
 *
 * Same DOM / class names as the prototype so the ported CSS in prototype-app.css applies 1:1.
 * Mount it inside `#modalRoot` (a sibling of `.app`) so the print stylesheet (`body>.app{display:none}`) prints
 * only the report. `.yv` is fixed right below the main header (`.top`), which keeps the tabs usable — also when a
 * host wrapper creates its own containing block (transform). `Escape` closes it (window listener that ignores events
 * a layer — the year Select, the „⋯" menu — already handled, see components/ui/layers.ts).
 *
 * ≤760px the bar is one row: ← (icon), title, year, „⋯" menu with „Tisk / PDF" and close / reopen.
 *
 * Data: computed client-side from the store with `buildYearReport` (archived + active items of the year),
 * so close / reopen (optimistic store actions) and realtime refetches update it immediately.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Popover, Select, type SelectOption } from "@/components/ui";
import { formatDate, kcs, NBSP, nf, plural, pluralize, thousandsLabel } from "@/lib/format";
import { buildYearReport } from "@/lib/report";
import { useActions, useAppState } from "@/lib/store/react";
import type { PrintItem } from "@/lib/types";
import "./print-report.css";

export function PrintReport({ onBack }: { onBack: () => void }) {
  const state = useAppState();
  const actions = useActions();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const rootRef = useRef<HTMLDivElement>(null);

  const r = useMemo(
    () => buildYearReport({ items: state.printItems, types: state.printTypes, closures: state.closures, year }),
    [state.printItems, state.printTypes, state.closures, year],
  );
  const typeName = useMemo(() => new Map(state.printTypes.map((t) => [t.id, t.name])), [state.printTypes]);
  const closedYears = useMemo(() => new Set(state.closures.map((c) => c.year)), [state.closures]);
  const yearOptions = useMemo<SelectOption[]>(
    () => r.years.map((y) => ({ value: String(y), label: String(y), meta: closedYears.has(y) ? "uzavřeno" : undefined })),
    [r.years, closedYears],
  );
  const scale = useMemo(() => chartScale(r.total ? r.maxMonth : 0), [r.total, r.maxMonth]);

  // „⋯" menu (≤760px): Tisk / PDF + close / reopen
  const moreRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const t = setTimeout(() => document.querySelector<HTMLButtonElement>("#yvMore .yv-menu__it:not(:disabled)")?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(t);
  }, [moreOpen]);
  const fromMenu = (fn: () => void) => {
    setMoreOpen(false);
    moreRef.current?.focus({ preventScroll: true });
    fn();
  };

  // Sit right below the main header (prototype: yv.style.top = header bottom). Track header size changes.
  useLayoutEffect(() => {
    const el = rootRef.current;
    const header = document.querySelector<HTMLElement>(".top");
    if (!el) return;
    const place = () => {
      // top is relative to the containing block (the viewport, or a transformed host wrapper): measure it first
      el.style.top = "0px";
      const cbTop = el.getBoundingClientRect().top;
      el.style.top = Math.max(0, (header ? header.getBoundingClientRect().bottom : 0) - cbTop) + "px";
    };
    place();
    window.addEventListener("resize", place);
    const ro = header && typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    if (ro && header) ro.observe(header);
    return () => {
      window.removeEventListener("resize", place);
      ro?.disconnect();
    };
  }, []);

  // Escape closes the report (prototype escKey) — unless a layer (Select, menu) or a modal already handled it.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".ov")) return; // a modal on top owns Escape
      e.preventDefault();
      onBackRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeYear = () => {
    const n = r.itemCount;
    const what = `${pluralize(n, "položka", "položky", "položek")} za ${kcs(r.total)} se ${plural(n, "přesune", "přesunou", "přesune")} do archivu`;
    if (!confirm(`Uzavřít rok ${year}? ${what}.`)) return;
    // errors roll back optimistically and surface via snapshot.error (global toast)
    actions.closeYear(year).catch(() => {});
  };
  // prototype: reopening has no confirm (prototype.md §19.16)
  const reopenYear = () => {
    actions.reopenYear(year).catch(() => {});
  };

  const row = (t: PrintItem) => (
    <div className="yv-r" key={t.id}>
      <span className="nm">{t.title}</span>
      <span className="ty">{typeName.get(t.typeId) ?? "—"}</span>
      <span className="q">{t.quantity ? nf(t.quantity) + NBSP + "ks" : ""}</span>
      <span className={t.paidByClub ? "pr ok" : "pr"}>{kcs(t.price)}</span>
    </div>
  );
  const withItems = r.months.filter((m) => m.items.length);

  return (
    <div className="yv" id="yv" ref={rootRef} data-testid="print-report">
      <div className="bar yv-bar">
        <div className="sub">
          <button className="btn outline yv-back" id="yvBack" type="button" onClick={onBack}>
            <span className="yv-back__ic" aria-hidden="true">
              ←
            </span>
            <span className="yv-back__t"> Zpět na tiskoviny</span>
          </button>
          <h2 className="yv-t" id="yvTitle">
            <span>
              Roční přehled<span className="yv-t__x"> tiskovin</span>
            </span>
          </h2>
          <Select
            id="yrSel"
            variant="filter"
            aria-label="Rok"
            className="yv-year"
            value={String(year)}
            options={yearOptions}
            searchable={false}
            onChange={(v) => setYear(Number(v))}
          />
          <span className="yv-yr-print" aria-hidden="true">
            {year}
          </span>
          {r.closedAt ? <span className="yv-st">Uzavřeno {formatDate(r.closedAt)}</span> : null}
          <span className="yv-sp" />
          <button className="btn outline yv-act" id="yrPrint" type="button" onClick={() => window.print()}>
            Tisk / PDF
          </button>
          {r.closedAt ? (
            <button className="btn outline yv-act" id="yrOpen" type="button" onClick={reopenYear}>
              Znovu otevřít
            </button>
          ) : (
            <button className="btn primary yv-act" id="yrClose" type="button" disabled={r.itemCount === 0} onClick={closeYear}>
              Uzavřít rok {year}
            </button>
          )}
          <button
            ref={moreRef}
            className="btn outline icon yv-more"
            type="button"
            aria-label="Další akce"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls={moreOpen ? "yvMore" : undefined}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <span className="yv-dots" aria-hidden="true" />
          </button>
          <Popover
            anchor={moreRef}
            open={moreOpen}
            id="yvMore"
            role="dialog"
            label="Další akce"
            placement="bottom-end"
            className="yv-menu"
            trapFocus
            onClose={(reason) => {
              setMoreOpen(false);
              if (reason !== "outside") moreRef.current?.focus({ preventScroll: true });
            }}
          >
            <div className="yv-menu__list">
              <button type="button" className="yv-menu__it" onClick={() => fromMenu(() => window.print())}>
                <span className="yv-menu__ic yv-menu__ic--print" aria-hidden="true" />
                Tisk / PDF
              </button>
              {r.closedAt ? (
                <button type="button" className="yv-menu__it" onClick={() => fromMenu(reopenYear)}>
                  <span className="yv-menu__ic yv-menu__ic--open" aria-hidden="true" />
                  Znovu otevřít rok {year}
                </button>
              ) : (
                <button type="button" className="yv-menu__it" disabled={r.itemCount === 0} onClick={() => fromMenu(closeYear)}>
                  <span className="yv-menu__ic yv-menu__ic--close" aria-hidden="true" />
                  Uzavřít rok {year}
                </button>
              )}
            </div>
          </Popover>
        </div>
      </div>
      {/* scrollable region: focusable so keyboard users can scroll it (axe scrollable-region-focusable) */}
      <div className="yv-b" tabIndex={0} role="region" aria-labelledby="yvTitle">
        <section className="yv-kpi">
          <div className="kp main">
            <span>Celkem utraceno</span>
            <b>{kcs(r.total)}</b>
            <i>
              {pluralize(r.itemCount, "položka", "položky", "položek")} · {nf(r.quantity)}
              {NBSP}ks
            </i>
          </div>
          <div className="kp">
            <span>Zaplatil FK FM</span>
            <b className="g">{kcs(r.paid)}</b>
            <div className="kbar">
              <em style={{ width: `${r.paidPct}%` }} />
            </div>
            <i>{r.paidPct} % z celku</i>
          </div>
          <div className="kp">
            <span>Dluží FK FM</span>
            <b className="r">{kcs(r.owed)}</b>
            <div className="kbar r">
              <em style={{ width: `${r.owedPct}%` }} />
            </div>
            <i>{r.owedPct} % z celku</i>
          </div>
          <div className="kp">
            <span>Průměr na aktivní měsíc</span>
            <b>{kcs(r.avgPerActiveMonth)}</b>
            <i>{r.topMonth ? "Nejvíc: " + r.topMonth.name.toLowerCase() + " · " + kcs(r.topMonth.sum) : "—"}</i>
          </div>
        </section>
        <section className="yv-card yv-chart">
          <div className="yv-ch">
            <h2>Útrata po měsících</h2>
            <div className="lg">
              <span>
                <i className="g" />
                Zaplatil FK FM
              </span>
              <span>
                <i className="r" />
                Dluží FK FM
              </span>
            </div>
          </div>
          <div className="cols">
            {scale.ticks.length ? (
              <div className="yv-grid" aria-hidden="true">
                {scale.ticks.map((v) => (
                  <span className="yv-gl" key={v} style={{ bottom: `${(v / scale.max) * 100}%` }}>
                    <span className="yv-gl__l">{thousandsLabel(v)}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {r.months.map((m) => {
              const detail = m.sum ? `${kcs(m.sum)} (zaplatil FK FM ${kcs(m.paid)} · dluží FK FM ${kcs(m.owed)})` : "nic";
              return (
                <div className="mc" key={m.key} title={`${m.name}: ${detail}`}>
                  <span className="v" aria-hidden="true">
                    {m.sum ? thousandsLabel(m.sum) : ""}
                  </span>
                  <div className="st" style={{ height: `${(m.sum / scale.max) * 100}%` }}>
                    <em className="r" style={{ flex: m.owed }} />
                    <em className="g" style={{ flex: m.paid }} />
                  </div>
                  <span className="l" aria-hidden="true">
                    {m.abbr}
                  </span>
                  <span className="sr-only">{`${m.name}: ${detail}`}</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="yv-card yv-types">
          <h2>Podle typu média</h2>
          {r.types.length ? (
            r.types.map((t) => (
              <div className="tr" key={t.typeId ?? "—"}>
                <div className="tn">
                  <b>{t.name}</b>
                  <span>
                    {t.count}× · {nf(t.quantity)}{NBSP}ks
                  </span>
                </div>
                <div className="tb">
                  <em style={{ width: `${(t.sum / r.maxType) * 100}%` }} />
                </div>
                <span className="tv">{kcs(t.sum)}</span>
              </div>
            ))
          ) : (
            <p className="yv-e">Žádná data</p>
          )}
        </section>
        <section className="yv-card yv-list">
          <h2>Soupis položek</h2>
          {withItems.length ? (
            withItems.map((m) => (
              <div className="yv-m" key={m.key}>
                <div className="yv-mh">
                  <b>{m.name}</b>
                  <span className="o">{m.owed ? "dluh " + kcs(m.owed) : ""}</span>
                  <span>{kcs(m.sum)}</span>
                </div>
                {m.items.map(row)}
              </div>
            ))
          ) : (
            <p className="yv-e">V roce {year} nejsou žádné tiskoviny s datem realizace.</p>
          )}
          {r.noDateCount && !r.closedAt ? (
            <p className="yv-e">
              {pluralize(r.noDateCount, "tiskovina nemá", "tiskoviny nemají", "tiskovin nemá")} vyplněné datum realizace, a proto v přehledu{" "}
              {r.noDateCount === 1 ? "není" : "nejsou"}.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/**
 * Chart scale with round gridlines: ~4 steps of 1 / 2 / 2.5 / 5 × 10ⁿ; bars are drawn against `max` (the top
 * gridline), not against the largest month. `max` 0 (no data) → no gridlines, bars of height 0.
 */
function chartScale(maxValue: number): { max: number; ticks: number[] } {
  if (maxValue <= 0) return { max: 1, ticks: [] };
  const raw = maxValue / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  const count = Math.max(1, Math.ceil(maxValue / step - 1e-9));
  return { max: step * count, ticks: Array.from({ length: count }, (_, i) => step * (i + 1)) };
}
