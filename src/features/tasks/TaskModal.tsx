"use client";
/**
 * Task modal „Úkol" / „Nový úkol" (prototype §8). Fullscreen on mobile (Modal CSS). Ctrl/Cmd+Enter saves; a new task
 * focuses Název (desktop); a missing title shows an inline error. Saving PATCHes only the changed fields.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Field, fieldA11y } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Select, type SelectGroup, type SelectOption } from "@/components/ui/Select";
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
import { CATEGORY_OPTGROUPS, CATS } from "@/lib/constants";
import { columnsOf, defaultTaskCategory } from "@/lib/filters";
import { formatDateWithRelative } from "@/lib/dates";
import { changedFields, isEmptyPatch } from "@/lib/patch";
import { useActions, useAppState, usePrefs, useStore } from "@/lib/store/react";
import { personsInOrder } from "@/lib/tree";

type TaskForm = { category: string; columnId: string; title: string; dueDate: string; description: string; leadId: string; ownerId: string };

const TITLE_REQUIRED = "Vyplňte název úkolu";
const CATEGORY_GROUPS: SelectGroup[] = CATEGORY_OPTGROUPS.map((g) => ({ label: g.label, options: g.options.map((c) => ({ value: c, label: c })) }));

/** Form values → API fields (shared by the save payload and the „unchanged" baseline). */
function taskFields(f: TaskForm) {
  return {
    category: f.category,
    columnId: f.columnId,
    title: f.title.trim(),
    description: f.description.trim(),
    dueDate: f.dueDate || null,
    leadId: f.leadId || null,
    ownerId: f.ownerId || null,
  };
}

export function TaskModal({
  id,
  columnId,
  onClose,
  onOpenTask,
}: {
  id: string | null;
  columnId?: string;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const state = useAppState();
  const [prefs] = usePrefs();
  const actions = useActions();
  const store = useStore();
  const today = useToday();
  const cols = columnsOf(state.columns, "tasks");
  const persons = personsInOrder(state.nodes);
  const personOptions: SelectOption[] = [{ value: "", label: "— nevybráno —" }, ...persons.map((p) => ({ value: p.id, label: p.name, meta: p.role ?? undefined }))];

  // after a successful create (e.g. an upload failed afterwards) the modal behaves as „existing"
  const [savedId, setSavedId] = useState<string | null>(null);
  const currentId = id ?? savedId;
  const ex = currentId ? state.tasks.find((t) => t.id === currentId) : undefined;

  const [init] = useState((): TaskForm => {
    const t = id ? state.tasks.find((x) => x.id === id) : undefined;
    const cat = t ? t.category : defaultTaskCategory(prefs.filter);
    return {
      category: CATS.includes(cat) ? cat : CATEGORY_OPTGROUPS[0].options[0],
      columnId: t?.columnId ?? (columnId && cols.some((c) => c.id === columnId) ? columnId : cols[0]?.id ?? ""),
      title: t?.title ?? "",
      dueDate: t?.dueDate ?? "",
      description: t?.description ?? "",
      leadId: t?.leadId ?? "",
      ownerId: t?.ownerId ?? "",
    };
  });
  const [f, setF] = useState(init);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const [draft, setDraft] = useState<AttachmentDraft>(emptyDraft);
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The date field holds text that is not a date („Datum nerozpoznáno") — saving is blocked until it is fixed. */
  const [dateBad, setDateBad] = useState(false);
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
    if (dateBad) {
      document.getElementById("fDue")?.focus(); // its hint says „Datum nerozpoznáno"
      return;
    }
    const fields = taskFields(f);
    setBusy(true);
    let targetId = currentId;
    try {
      if (targetId && ex) {
        // only the changed fields: a concurrent edit (or a card move) by someone else is kept
        const patch = changedFields(fields, taskFields(init));
        if (!isEmptyPatch(patch)) await actions.updateTask(targetId, patch);
      } else {
        targetId = uuid();
        await actions.createTask({ ...fields, id: targetId, createdBy: prefs.me });
      }
    } catch {
      if (mounted.current) setBusy(false); // the error toast shows the server message; keep the modal open
      return;
    }
    const rest = await applyAttachmentDraft(actions, "task", targetId, draft);
    if (draftIsEmpty(rest)) return close();
    // some attachments failed: find out what was saved — and whether the task still exists
    await store.load();
    if (!store.getSnapshot().state?.tasks.some((t) => t.id === targetId)) {
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
      const res = await actions.duplicateTask(ex.id, prefs.me);
      onOpenTask(res.task.id);
    } catch {
      /* toast */
    }
    if (mounted.current) setDupBusy(false);
  };

  const remove = () => {
    if (!ex || !window.confirm("Opravdu smazat úkol?")) return;
    onClose();
    void actions.deleteTask(ex.id).catch(() => undefined);
  };

  return (
    <Modal
      title={ex ? "Úkol" : "Nový úkol"}
      onClose={onClose}
      testId="task-modal"
      onSubmit={save}
      initialFocus={id ? undefined : "#fTitle"}
      meta={ex && creator ? `Založil(a) ${creator.name} · ${formatDateWithRelative(ex.createdAt, today)}` : undefined}
      footStart={
        ex ? (
          <>
            <Button variant="danger" id="del" className="mf-ic mf-ic--del" onClick={remove}>
              Smazat
            </Button>
            <Button variant="outline" id="dup" className="mf-ic mf-ic--dup" busy={dupBusy} onClick={duplicate}>
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
            {ex ? "Uložit" : "Vytvořit úkol"}
          </Button>
        </>
      }
    >
      <div className="mb">
        <Field label="Kategorie" htmlFor="fCat">
          <Select id="fCat" value={f.category} onChange={(v) => set("category", v)} options={CATEGORY_GROUPS} />
        </Field>
        <Field label="Stav" htmlFor="fCol">
          <Select id="fCol" value={f.columnId} onChange={(v) => set("columnId", v)} options={cols.map((c) => ({ value: c.id, label: c.title }))} />
        </Field>
        <Field label="Název úkolu" htmlFor="fTitle" required error={titleErr}>
          <input
            ref={titleRef}
            id="fTitle"
            value={f.title}
            placeholder="Např. Plakát na domácí zápas"
            autoComplete="off"
            {...fieldA11y("fTitle", { error: titleErr, required: true })}
            onChange={(e) => {
              set("title", e.target.value);
              if (titleErr && e.target.value.trim()) setTitleErr(null);
            }}
          />
        </Field>
        <Field label="Předpokládaný termín dokončení" htmlFor="fDue">
          <DateInput id="fDue" value={f.dueDate} onChange={(v) => set("dueDate", v)} onValidityChange={(ok) => setDateBad(!ok)} />
        </Field>
        <Field label="Popis" htmlFor="fDesc" wide>
          <textarea id="fDesc" placeholder="Co je potřeba udělat, termíny, formáty…" value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Zodpovědný vedoucí" htmlFor="fLead">
          <Select id="fLead" value={f.leadId} onChange={(v) => set("leadId", v)} options={personOptions} />
        </Field>
        <Field label="Zodpovědný za úkol" htmlFor="fOwner">
          <Select id="fOwner" value={f.ownerId} onChange={(v) => set("ownerId", v)} options={personOptions} />
        </Field>
        <Field label="Přílohy a odkazy" wide group>
          <AttachmentBox existing={attachmentsOf(state.attachments, "task", currentId)} draft={draft} onChange={setDraft} />
        </Field>
      </div>
    </Modal>
  );
}
