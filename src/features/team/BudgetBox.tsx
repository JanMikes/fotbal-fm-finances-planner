"use client";
/**
 * „Aktuální budget" collapsible box (prototype §10.2) + „od [měsíc]" installment start (DECISIONS #2).
 * Amounts are MoneyInputs (0 shows empty with placeholder „0"); every keystroke updates the live computation and
 * schedules a 300 ms debounced PUT; blur, unmount (tab switch) and `pagehide` (keepalive) flush what is pending.
 */
import { useEffect, useRef, useState } from "react";
import { MoneyInput, MonthInput } from "@/components/ui";
import { parseDigits } from "@/lib/format";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import { applyDraft, budgetPatch, budgetView, monthInputValue, type BudgetDraft, type BudgetDraftValue, type BudgetField } from "./budgetModel";

const SAVE_DELAY = 300;

export function BudgetBox() {
  const state = useAppState();
  const actions = useActions();
  const [prefs, updatePrefs] = usePrefs();
  const [draft, setDraft] = useState<BudgetDraft>({});
  const timers = useRef<Partial<Record<BudgetField, ReturnType<typeof setTimeout>>>>({});
  /** Typed values not sent yet (300 ms debounce; null = emptied) — flushed on blur, unmount and `pagehide`. */
  const unsent = useRef<BudgetDraft>({});
  const budgetRef = useRef(state.budget);
  useEffect(() => {
    budgetRef.current = state.budget;
  });

  const open = prefs.curBudOpen;
  const view = budgetView(applyDraft(state.budget, draft), state.nodes);

  const flush = (field: BudgetField, input: BudgetDraftValue, keepalive = false) => {
    clearTimeout(timers.current[field]);
    delete timers.current[field];
    delete unsent.current[field];
    void actions.updateBudget(budgetPatch(field, input, budgetRef.current), { keepalive }).catch(() => {});
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  const onInput = (field: BudgetField, n: number | null) => {
    setDraft((d) => ({ ...d, [field]: n }));
    unsent.current[field] = n;
    clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => flush(field, n), SAVE_DELAY);
  };

  const onBlur = (field: BudgetField) => {
    if (field in unsent.current) flush(field, unsent.current[field] ?? null);
    // show the stored (optimistically updated) value again; MoneyInput formats it („50 000")
    setDraft((d) => {
      const n = { ...d };
      delete n[field];
      return n;
    });
  };

  // never drop a typed value: send pending edits when the box unmounts (tab switch) or the page is hidden/closed
  useEffect(() => {
    const flushAll = (keepalive: boolean) => {
      for (const k of Object.keys(unsent.current) as BudgetField[]) flushRef.current(k, unsent.current[k] ?? null, keepalive);
    };
    const onPageHide = () => flushAll(true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushAll(false);
    };
  }, []);

  /** Shown amount: the unsaved typed value while there is one, else the stored number (realtime). */
  const value = (field: BudgetField): number | null => (field in draft ? parseDigits(draft[field]) : state.budget[field]);

  const money = (field: BudgetField, id: string) => (
    <MoneyInput id={id} value={value(field)} onChange={(n) => onInput(field, n)} onBlur={() => onBlur(field)} suffix="Kč" zeroAsEmpty />
  );

  return (
    <section className="curbud" id="curBud">
      <button
        type="button"
        className="cb-h"
        id="cbToggle"
        aria-expanded={open}
        aria-controls="cbBody"
        onClick={() => updatePrefs({ curBudOpen: !open })}
      >
        <span className="cb-k">
          Aktuální budget <small>zbývá</small>
        </span>
        <span className={"cb-tot" + (view.negative ? " cb-neg" : "")} id="cbTot">
          {view.left}
        </span>
        <span className="cb-ch" aria-hidden="true" />
      </button>
      <div className="cb-b" id="cbBody" hidden={!open}>
        <div className="cb-row">
          <label className="cb-l" htmlFor="cbSpolek">
            Spolek
          </label>
          <span className="cb-in">{money("spolek", "cbSpolek")}</span>
        </div>
        <div className="cb-row">
          <label className="cb-l" htmlFor="cbAS">
            AS
          </label>
          <span className="cb-in">{money("asAmount", "cbAS")}</span>
        </div>
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
          <label className="cb-l" htmlFor="cbPay">
            Splátka <small>měsíčně</small>
          </label>
          <span className="cb-in">{money("monthlyInstallment", "cbPay")}</span>
          <label className="tm-from-l" htmlFor="cbFrom">
            Splátky od
          </label>
          <span className="cb-in tm-from">
            <MonthInput
              id="cbFrom"
              compact
              placeholder="od měsíce…"
              aria-label="Splátka od měsíce"
              value={monthInputValue(state.budget.installmentFrom)}
              onChange={(ym) => void actions.updateBudget({ installmentFrom: ym || null }).catch(() => {})}
            />
          </span>
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
