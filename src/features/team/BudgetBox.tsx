"use client";
/** „Aktuální budget" collapsible box (prototype §10.2) + „od [měsíc]" installment start (DECISIONS #2). */
import { useEffect, useRef, useState } from "react";
import { cbFmt } from "@/lib/format";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import { applyDraft, budgetPatch, budgetView, monthInputValue, type BudgetDraft, type BudgetField } from "./budgetModel";

const SAVE_DELAY = 300;

export function BudgetBox() {
  const state = useAppState();
  const actions = useActions();
  const [prefs, updatePrefs] = usePrefs();
  const [draft, setDraft] = useState<BudgetDraft>({});
  const timers = useRef<Partial<Record<BudgetField, ReturnType<typeof setTimeout>>>>({});
  /** Typed values not sent yet (300 ms debounce) — flushed on blur, unmount and `pagehide`. */
  const unsent = useRef<BudgetDraft>({});
  const budgetRef = useRef(state.budget);
  useEffect(() => {
    budgetRef.current = state.budget;
  });

  const open = prefs.curBudOpen;
  const view = budgetView(applyDraft(state.budget, draft), state.nodes);

  const flush = (field: BudgetField, text: string, keepalive = false) => {
    clearTimeout(timers.current[field]);
    delete timers.current[field];
    delete unsent.current[field];
    void actions.updateBudget(budgetPatch(field, text, budgetRef.current), { keepalive }).catch(() => {});
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  const onInput = (field: BudgetField, text: string) => {
    setDraft((d) => ({ ...d, [field]: text }));
    unsent.current[field] = text;
    clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => flush(field, text), SAVE_DELAY);
  };

  const onBlur = (field: BudgetField) => {
    const text = unsent.current[field];
    if (text !== undefined) flush(field, text);
    // re-render formatted from the stored value (formatting on blur only)
    setDraft((d) => {
      const n = { ...d };
      delete n[field];
      return n;
    });
  };

  // never drop a typed value: send pending edits when the box unmounts (tab switch) or the page is hidden/closed
  useEffect(() => {
    const flushAll = (keepalive: boolean) => {
      for (const k of Object.keys(unsent.current) as BudgetField[]) {
        const text = unsent.current[k];
        if (text !== undefined) flushRef.current(k, text, keepalive);
      }
    };
    const onPageHide = () => flushAll(true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushAll(false);
    };
  }, []);

  const value = (field: BudgetField) => draft[field] ?? cbFmt(state.budget[field]);

  const input = (field: BudgetField, id: string) => (
    <input id={id} inputMode="numeric" placeholder="0" value={value(field)} onChange={(e) => onInput(field, e.target.value)} onBlur={() => onBlur(field)} />
  );

  return (
    <section className="curbud" id="curBud">
      <button type="button" className="cb-h" id="cbToggle" aria-expanded={open} onClick={() => updatePrefs({ curBudOpen: !open })}>
        <span className="cb-k">
          Aktuální budget <small>zbývá</small>
        </span>
        <span className={"cb-tot" + (view.negative ? " cb-neg" : "")} id="cbTot">
          {view.left}
        </span>
        <span className="cb-ch" aria-hidden="true">
          ▾
        </span>
      </button>
      <div className="cb-b" id="cbBody" hidden={!open}>
        <label className="cb-row">
          <span className="cb-l">Spolek</span>
          <span className="cb-in">
            {input("spolek", "cbSpolek")}
            <span>Kč</span>
          </span>
        </label>
        <label className="cb-row">
          <span className="cb-l">AS</span>
          <span className="cb-in">
            {input("asAmount", "cbAS")}
            <span>Kč</span>
          </span>
        </label>
        <div className="cb-row cb-sub">
          <span className="cb-l">Celkem</span>
          <span className="cb-v" id="cbSum">
            {view.sum}
          </span>
        </div>
        <div className="cb-row cb-sub">
          <span className="cb-l">
            <i className="cb-dot" />V budgetu
          </span>
          <span className="cb-v" id="cbGreen">
            {view.green}
          </span>
        </div>
        <div className="cb-row tm-pay">
          <span className="cb-l tm-pay-l">
            <label htmlFor="cbPay">Splátka</label>
            <span className="tm-from">
              <label htmlFor="cbFrom">od</label>
              <input
                id="cbFrom"
                type="month"
                aria-label="Splátka od měsíce"
                value={monthInputValue(state.budget.installmentFrom)}
                onChange={(e) => void actions.updateBudget({ installmentFrom: e.target.value || null }).catch(() => {})}
              />
            </span>
          </span>
          <span className="cb-in">{input("monthlyInstallment", "cbPay")}</span>
        </div>
        <div className="cb-row cb-left">
          <span className="cb-l">Zbývá</span>
          <span className={"cb-v" + (view.negative ? " cb-neg" : "")} id="cbLeft">
            {view.left}
          </span>
        </div>
      </div>
    </section>
  );
}
