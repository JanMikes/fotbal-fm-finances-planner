"use client";
/** Income modal „Příjem" / „Nový příjem" (Tiskoviny): name, description, paid date, amount, payer. */
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCloseWhenDeleted } from "@/components/ui/useCloseWhenDeleted";
import { uuid } from "@/lib/api";
import { PAYERS } from "@/lib/constants";
import { formatDate, isoDay, parseDigits } from "@/lib/format";
import { changedFields, isEmptyPatch } from "@/lib/patch";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import type { IncomePayer } from "@/lib/types";

type IncomeForm = {
  title: string;
  description: string;
  paidDate: string;
  amount: string;
  payer: IncomePayer;
};

/** Form values → API fields (shared by the save payload and the „unchanged" baseline). */
function incomeFields(f: IncomeForm) {
  return {
    title: f.title.trim(),
    description: f.description.trim(),
    paidDate: f.paidDate || null,
    amount: parseDigits(f.amount),
    payer: f.payer,
  };
}

export function IncomeModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const state = useAppState();
  const [prefs] = usePrefs();
  const actions = useActions();
  const ex = id ? state.printIncomes.find((i) => i.id === id) : undefined;

  const [init] = useState((): IncomeForm => ({
    title: ex?.title ?? "",
    description: ex?.description ?? "",
    paidDate: ex ? (ex.paidDate ?? "") : isoDay(),
    amount: ex?.amount != null ? String(ex.amount) : "",
    payer: ex?.payer ?? "spolek",
  }));
  const [f, setF] = useState(init);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const [titleErr, setTitleErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (id) return;
    const t = setTimeout(() => titleRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [id]);

  // deleted elsewhere while open → close with a notice
  useCloseWhenDeleted(!!id && !ex, onClose);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const creator = ex?.createdBy ? state.nodes.find((n) => n.id === ex.createdBy && n.kind === "person") : undefined;

  const save = async () => {
    if (!f.title.trim()) {
      setTitleErr(true);
      titleRef.current?.focus();
      return;
    }
    const fields = incomeFields(f);
    setBusy(true);
    try {
      if (ex) {
        // only the changed fields: a concurrent edit by someone else is kept
        const patch = changedFields(fields, incomeFields(init));
        if (!isEmptyPatch(patch)) await actions.updatePrintIncome(ex.id, patch);
      } else {
        await actions.createPrintIncome({ ...fields, id: uuid(), createdBy: prefs.me });
      }
    } catch {
      if (mounted.current) setBusy(false);
      return;
    }
    if (mounted.current) onClose();
  };

  const remove = () => {
    if (!ex || !window.confirm("Opravdu smazat příjem?")) return;
    onClose();
    void actions.deletePrintIncome(ex.id).catch(() => undefined);
  };

  return (
    <Modal
      title={ex ? "Příjem" : "Nový příjem"}
      onClose={onClose}
      testId="income-modal"
      foot={
        <>
          <span className="meta">{ex && creator ? `Založil(a) ${creator.name}, ${formatDate(ex.createdAt)}` : ""}</span>
          {ex && (
            <button className="btn danger" id="incDel" type="button" onClick={remove}>
              Smazat
            </button>
          )}
          <button className="btn outline" type="button" onClick={onClose}>
            Zrušit
          </button>
          <button className="btn primary" id="incOk" type="button" disabled={busy} onClick={save}>
            {ex ? "Uložit" : "Přidat příjem"}
          </button>
        </>
      }
    >
      <div className="mb">
        <div className="f w">
          <label htmlFor="incTitle">
            Název položky <span className="req">*</span>
          </label>
          <input
            ref={titleRef}
            id="incTitle"
            value={f.title}
            placeholder="Např. Příspěvek sponzora na letáky"
            style={titleErr ? { borderColor: "#b3261e" } : undefined}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className="f w">
          <label htmlFor="incDesc">Popis položky</label>
          <textarea id="incDesc" value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="incDate">Zaplaceno dne</label>
          <input id="incDate" type="date" value={f.paidDate} onChange={(e) => set("paidDate", e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="incAmount">Hodnota položky (Kč)</label>
          <input id="incAmount" inputMode="numeric" value={f.amount} placeholder="Např. 4 500" onChange={(e) => set("amount", e.target.value)} />
        </div>
        <div className="f w">
          <span className="lbl">Kdo platil</span>
          <div className="budc">
            {PAYERS.map((p) => (
              <label key={p.value}>
                <input type="radio" name="incPayer" value={p.value} checked={f.payer === p.value} onChange={() => set("payer", p.value)} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
