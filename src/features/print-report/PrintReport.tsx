"use client";
/**
 * „Roční přehled tiskovin" — yearly print report (prototype.md §9.6 `openYear`, prompt.md §4.1).
 *
 * Same DOM / class names as the prototype so the ported CSS in prototype-app.css applies 1:1.
 * Mount it inside `#modalRoot` (a sibling of `.app`) so the print stylesheet (`body>.app{display:none}`) prints
 * only the report. `.yv` is fixed right below the main header (`.top`), which keeps the tabs usable — also when a
 * host wrapper creates its own containing block (transform). `Escape` closes it.
 *
 * Data: computed client-side from the store with `buildYearReport` (archived + active items of the year),
 * so close / reopen (optimistic store actions) and realtime refetches update it immediately.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDate, kcs, nf, thousandsLabel } from "@/lib/format";
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

  // Escape closes the report (prototype escKey).
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBackRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const closeYear = () => {
    if (!confirm(`Uzavřít rok ${year}? ${r.itemCount} položek za ${kcs(r.total)} se přesune do archivu.`)) return;
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
      <span className="q">{t.quantity ? nf(t.quantity) + " ks" : ""}</span>
      <span className={t.paidByClub ? "pr ok" : "pr"}>{kcs(t.price)}</span>
    </div>
  );
  const withItems = r.months.filter((m) => m.items.length);

  return (
    <div className="yv" id="yv" ref={rootRef} data-testid="print-report">
      <div className="bar yv-bar">
        <div className="sub">
          <button className="btn outline" id="yvBack" type="button" onClick={onBack}>
            ← Zpět na tiskoviny
          </button>
          <h2 className="yv-t">Roční přehled tiskovin</h2>
          <select
            className="search fsel"
            id="yrSel"
            aria-label="Rok"
            style={{ minWidth: 110 }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {r.years.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {r.closedAt ? <span className="yv-st">Uzavřeno {formatDate(r.closedAt)}</span> : null}
          <span className="yv-sp" />
          <button className="btn outline" id="yrPrint" type="button" onClick={() => window.print()}>
            Tisk / PDF
          </button>
          {r.closedAt ? (
            <button className="btn outline" id="yrOpen" type="button" onClick={reopenYear}>
              Znovu otevřít
            </button>
          ) : (
            <button className="btn primary" id="yrClose" type="button" disabled={r.itemCount === 0} onClick={closeYear}>
              Uzavřít rok {year}
            </button>
          )}
        </div>
      </div>
      <div className="yv-b">
        <section className="yv-kpi">
          <div className="kp main">
            <span>Celkem utraceno</span>
            <b>{kcs(r.total)}</b>
            <i>
              {r.itemCount} položek · {nf(r.quantity)} ks
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
            {r.months.map((m) => (
              <div className="mc" key={m.key} title={`${m.name}: ${kcs(m.sum)}`}>
                <span className="v">{m.sum ? thousandsLabel(m.sum) : ""}</span>
                <div className="st" style={{ height: `${(m.sum / r.maxMonth) * 100}%` }}>
                  <em className="r" style={{ flex: m.owed }} />
                  <em className="g" style={{ flex: m.paid }} />
                </div>
                <span className="l">{m.abbr}</span>
              </div>
            ))}
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
                    {t.count}× · {nf(t.quantity)} ks
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
            <p className="yv-e">{r.noDateCount} tiskovin nemá vyplněné datum realizace, a proto v přehledu nejsou.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
