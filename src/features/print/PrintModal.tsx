"use client";
/** Print item modal „Tiskovina" / „Nová tiskovina" (prototype §8, print mode). */
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DELETED_NOTICE, useCloseWhenDeleted } from "@/components/ui/useCloseWhenDeleted";
import {
  AttachmentBox,
  applyAttachmentDraft,
  attachmentsOf,
  draftIsEmpty,
  emptyDraft,
  revokeDraft,
  type AttachmentDraft,
} from "@/features/attachments/AttachmentBox";
import { uuid } from "@/lib/api";
import { ALL } from "@/lib/constants";
import { columnsOf } from "@/lib/filters";
import { formatDate, parseDigits } from "@/lib/format";
import { changedFields, isEmptyPatch } from "@/lib/patch";
import { useActions, useAppState, usePrefs, useStore } from "@/lib/store/react";

type PrintForm = {
  typeId: string;
  columnId: string;
  title: string;
  realizationDate: string;
  description: string;
  quantity: string;
  price: string;
  paid: boolean;
};

/** Form values → API fields (shared by the save payload and the „unchanged" baseline). */
function printFields(f: PrintForm) {
  return {
    typeId: f.typeId,
    columnId: f.columnId,
    title: f.title.trim(),
    description: f.description.trim(),
    realizationDate: f.realizationDate || null,
    quantity: parseDigits(f.quantity),
    price: parseDigits(f.price),
    paidByClub: f.paid,
  };
}

export function PrintModal({
  id,
  columnId,
  onClose,
  onOpenItem,
}: {
  id: string | null;
  columnId?: string;
  onClose: () => void;
  onOpenItem: (id: string) => void;
}) {
  const state = useAppState();
  const [prefs] = usePrefs();
  const actions = useActions();
  const store = useStore();
  const cols = columnsOf(state.columns, "print");
  const types = [...state.printTypes].sort((a, b) => a.sortOrder - b.sortOrder);

  const [savedId, setSavedId] = useState<string | null>(null);
  const currentId = id ?? savedId;
  const ex = currentId ? state.printItems.find((t) => t.id === currentId) : undefined;

  const [init] = useState((): PrintForm => {
    const t = id ? state.printItems.find((x) => x.id === id) : undefined;
    return {
      typeId: t?.typeId ?? (prefs.prFilter !== ALL ? prefs.prFilter : types[0]?.id ?? ""),
      columnId: t?.columnId ?? (columnId && cols.some((c) => c.id === columnId) ? columnId : cols[0]?.id ?? ""),
      title: t?.title ?? "",
      realizationDate: t?.realizationDate ?? "",
      description: t?.description ?? "",
      quantity: t?.quantity != null ? String(t.quantity) : "",
      price: t?.price != null ? String(t.price) : "",
      paid: t?.paidByClub ?? false,
    };
  });
  const [f, setF] = useState(init);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const [draft, setDraft] = useState<AttachmentDraft>(emptyDraft);
  const [titleErr, setTitleErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (id) return;
    const t = setTimeout(() => titleRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [id]);

  // deleted elsewhere while open → close with a notice (instead of turning into a „new" form)
  useCloseWhenDeleted(!!currentId && !ex, onClose);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; // (re)mount — React dev mode runs effects twice
    return () => {
      mounted.current = false;
    };
  }, []);
  const close = () => {
    if (mounted.current) onClose();
  };

  const creator = ex?.createdBy ? state.nodes.find((n) => n.id === ex.createdBy && n.kind === "person") : undefined;

  const save = async () => {
    const title = f.title.trim();
    if (!title) {
      setTitleErr(true);
      titleRef.current?.focus();
      return;
    }
    const fields = printFields(f);
    setBusy(true);
    let targetId = currentId;
    try {
      if (targetId && ex) {
        // only the changed fields: a concurrent edit (or a card move) by someone else is kept
        const patch = changedFields(fields, printFields(init));
        if (!isEmptyPatch(patch)) await actions.updatePrintItem(targetId, patch);
      } else {
        targetId = uuid();
        await actions.createPrintItem({ ...fields, id: targetId, createdBy: prefs.me });
      }
    } catch {
      if (mounted.current) setBusy(false);
      return;
    }
    const rest = await applyAttachmentDraft(actions, "print", targetId, draft);
    if (draftIsEmpty(rest)) return close();
    // some attachments failed: find out what was saved — and whether the item still exists
    await store.load();
    if (!store.getSnapshot().state?.printItems.some((t) => t.id === targetId)) {
      revokeDraft(rest);
      store.notify(DELETED_NOTICE);
      return close();
    }
    if (!mounted.current) return revokeDraft(rest);
    if (!ex) setSavedId(targetId); // the item exists now — further saves update it
    setDraft(rest); // keep only what failed, so „Uložit" retries it
    setBusy(false);
  };

  const duplicate = async () => {
    if (!ex) return;
    try {
      const res = await actions.duplicatePrintItem(ex.id, prefs.me);
      onOpenItem(res.printItem.id);
    } catch {
      /* toast */
    }
  };

  const remove = () => {
    if (!ex || !window.confirm("Opravdu smazat tiskovinu?")) return;
    onClose();
    void actions.deletePrintItem(ex.id).catch(() => undefined);
  };

  return (
    <Modal
      title={ex ? "Tiskovina" : "Nová tiskovina"}
      onClose={onClose}
      testId="print-modal"
      foot={
        <>
          <span className="meta">{ex && creator ? `Založil(a) ${creator.name}, ${formatDate(ex.createdAt)}` : ""}</span>
          {ex && (
            <>
              <button className="btn danger" id="del" type="button" onClick={remove}>
                Smazat
              </button>
              <button className="btn outline" id="dup" type="button" onClick={duplicate}>
                Duplikovat
              </button>
            </>
          )}
          <button className="btn outline" data-close2="" type="button" onClick={onClose}>
            Zrušit
          </button>
          <button className="btn primary" id="ok" type="button" disabled={busy} onClick={save}>
            {ex ? "Uložit" : "Přidat tiskovinu"}
          </button>
        </>
      }
    >
      <div className="mb">
        <div className="f">
          <label htmlFor="fCat">Typ média</label>
          <select id="fCat" value={f.typeId} onChange={(e) => set("typeId", e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor="fCol">Stav</label>
          <select id="fCol" value={f.columnId} onChange={(e) => set("columnId", e.target.value)}>
            {cols.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor="fTitle">
            Název <span className="req">*</span>
          </label>
          <input
            ref={titleRef}
            id="fTitle"
            value={f.title}
            placeholder="Např. Letáky na nábor, 500 ks"
            style={titleErr ? { borderColor: "#b3261e" } : undefined}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className="f">
          <label htmlFor="fDue">Datum realizace</label>
          <input id="fDue" type="date" value={f.realizationDate} onChange={(e) => set("realizationDate", e.target.value)} />
        </div>
        <div className="f w">
          <label htmlFor="fDesc">Popis</label>
          <textarea id="fDesc" placeholder="Co je potřeba udělat, termíny, formáty…" value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="fQty">Počet ks</label>
          <input id="fQty" inputMode="numeric" value={f.quantity} placeholder="Např. 500" onChange={(e) => set("quantity", e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="fPrice">Cena (Kč)</label>
          <input id="fPrice" inputMode="numeric" value={f.price} placeholder="Např. 4 500" onChange={(e) => set("price", e.target.value)} />
        </div>
        <div className="f">
          <span className="lbl">Zaplaceno FK FM</span>
          <div className="budc">
            <label>
              <input type="radio" name="fPaid" value="ano" checked={f.paid} onChange={() => set("paid", true)} />
              <i style={{ background: "#1f8a4c" }} />
              Ano
            </label>
            <label>
              <input type="radio" name="fPaid" value="ne" checked={!f.paid} onChange={() => set("paid", false)} />
              <i style={{ background: "#c62f28" }} />
              Ne
            </label>
          </div>
        </div>
        <div className="f w">
          <span className="lbl">Přílohy a odkazy</span>
          <AttachmentBox existing={attachmentsOf(state.attachments, "print", currentId)} draft={draft} onChange={setDraft} />
        </div>
      </div>
    </Modal>
  );
}
