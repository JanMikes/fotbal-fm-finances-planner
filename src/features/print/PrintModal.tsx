"use client";
/**
 * Print item modal „Tiskovina" / „Nová tiskovina" (prototype §8, print mode). Same behaviour as the task modal:
 * Ctrl/Cmd+Enter saves, a new item focuses Název (desktop), inline title error, PATCH of the changed fields only.
 * Počet / Cena are whole numbers (`number | null`, formatted „4 500" by MoneyInput).
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Field, fieldA11y } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { DELETED_NOTICE, useCloseWhenDeleted } from "@/components/ui/useCloseWhenDeleted";
import { useToday } from "@/components/ui/useToday";
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
import { formatDateWithRelative } from "@/lib/dates";
import { changedFields, isEmptyPatch } from "@/lib/patch";
import { useActions, useAppState, usePrefs, useStore } from "@/lib/store/react";
import "./print.css";

type PrintForm = {
  typeId: string;
  columnId: string;
  title: string;
  realizationDate: string;
  description: string;
  quantity: number | null;
  price: number | null;
  paid: boolean;
};

const TITLE_REQUIRED = "Vyplňte název tiskoviny";

/** Form values → API fields (shared by the save payload and the „unchanged" baseline). */
function printFields(f: PrintForm) {
  return {
    typeId: f.typeId,
    columnId: f.columnId,
    title: f.title.trim(),
    description: f.description.trim(),
    realizationDate: f.realizationDate || null,
    quantity: f.quantity,
    price: f.price,
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
  const today = useToday();
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
      quantity: t?.quantity ?? null,
      price: t?.price ?? null,
      paid: t?.paidByClub ?? false,
    };
  });
  const [f, setF] = useState(init);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const [draft, setDraft] = useState<AttachmentDraft>(emptyDraft);
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dupBusy, setDupBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

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
    if (busy) return;
    const title = f.title.trim();
    if (!title) {
      setTitleErr(TITLE_REQUIRED);
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
    if (!ex || dupBusy) return;
    setDupBusy(true);
    try {
      const res = await actions.duplicatePrintItem(ex.id, prefs.me);
      onOpenItem(res.printItem.id);
    } catch {
      /* toast */
    }
    if (mounted.current) setDupBusy(false);
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
      onSubmit={save}
      initialFocus={id ? undefined : "#fTitle"}
      meta={ex && creator ? `Založil(a) ${creator.name} · ${formatDateWithRelative(ex.createdAt, today)}` : undefined}
      footStart={
        ex ? (
          <>
            <Button variant="danger" id="del" onClick={remove}>
              Smazat
            </Button>
            <Button variant="outline" id="dup" busy={dupBusy} onClick={duplicate}>
              Duplikovat
            </Button>
          </>
        ) : undefined
      }
      foot={
        <>
          <Button variant="outline" data-close2="" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" id="ok" busy={busy} onClick={save}>
            {ex ? "Uložit" : "Přidat tiskovinu"}
          </Button>
        </>
      }
    >
      <div className="mb">
        <Field label="Typ média" htmlFor="fCat">
          <Select id="fCat" value={f.typeId} onChange={(v) => set("typeId", v)} options={types.map((t) => ({ value: t.id, label: t.name }))} />
        </Field>
        <Field label="Stav" htmlFor="fCol">
          <Select id="fCol" value={f.columnId} onChange={(v) => set("columnId", v)} options={cols.map((c) => ({ value: c.id, label: c.title }))} />
        </Field>
        <Field label="Název" htmlFor="fTitle" required error={titleErr}>
          <input
            ref={titleRef}
            id="fTitle"
            value={f.title}
            placeholder="Např. Letáky na nábor, 500 ks"
            autoComplete="off"
            {...fieldA11y("fTitle", { error: titleErr, required: true })}
            onChange={(e) => {
              set("title", e.target.value);
              if (titleErr && e.target.value.trim()) setTitleErr(null);
            }}
          />
        </Field>
        <Field label="Datum realizace" htmlFor="fDue">
          <DateInput id="fDue" value={f.realizationDate} onChange={(v) => set("realizationDate", v)} />
        </Field>
        <Field label="Popis" htmlFor="fDesc" wide>
          <textarea id="fDesc" placeholder="Co je potřeba udělat, termíny, formáty…" value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field
          label={
            <>
              Počet<span className="sr-only"> kusů</span>
            </>
          }
          htmlFor="fQty"
        >
          <MoneyInput id="fQty" value={f.quantity} onChange={(n) => set("quantity", n)} suffix="ks" placeholder="Např. 500" />
        </Field>
        <Field
          label={
            <>
              Cena<span className="sr-only"> v Kč</span>
            </>
          }
          htmlFor="fPrice"
        >
          <MoneyInput id="fPrice" value={f.price} onChange={(n) => set("price", n)} suffix="Kč" placeholder="Např. 4 500" />
        </Field>
        <Field label="Zaplaceno FK FM" group>
          <div className="budc paidc">
            <label>
              <input type="radio" name="fPaid" value="ano" checked={f.paid} onChange={() => set("paid", true)} />
              <i className="paidc-dot is-yes" aria-hidden="true" />
              Ano
            </label>
            <label>
              <input type="radio" name="fPaid" value="ne" checked={!f.paid} onChange={() => set("paid", false)} />
              <i className="paidc-dot is-no" aria-hidden="true" />
              Ne
            </label>
          </div>
        </Field>
        <Field label="Přílohy a odkazy" wide group>
          <AttachmentBox existing={attachmentsOf(state.attachments, "print", currentId)} draft={draft} onChange={setDraft} />
        </Field>
      </div>
    </Modal>
  );
}
