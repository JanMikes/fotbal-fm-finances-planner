"use client";
/** Task modal „Úkol" / „Nový úkol" (prototype §8). Fullscreen on mobile via the prototype CSS. */
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { AttachmentBox, applyAttachmentDraft, attachmentsOf, emptyDraft, type AttachmentDraft } from "@/features/attachments/AttachmentBox";
import { uuid } from "@/lib/api";
import { CATEGORY_OPTGROUPS, CATS } from "@/lib/constants";
import { columnsOf, defaultTaskCategory } from "@/lib/filters";
import { formatDate } from "@/lib/format";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import { personsInOrder } from "@/lib/tree";

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
  const cols = columnsOf(state.columns, "tasks");
  const persons = personsInOrder(state.nodes);

  // after a successful create (e.g. an upload failed afterwards) the modal behaves as „existing"
  const [savedId, setSavedId] = useState<string | null>(null);
  const currentId = id ?? savedId;
  const ex = currentId ? state.tasks.find((t) => t.id === currentId) : undefined;

  const [init] = useState(() => {
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
  const [titleErr, setTitleErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // new task: focus the title after 30 ms (prototype)
  useEffect(() => {
    if (id) return;
    const t = setTimeout(() => titleRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [id]);

  // the task was deleted elsewhere while open → close
  const vanished = !!id && !ex;
  useEffect(() => {
    if (vanished) onClose();
  }, [vanished, onClose]);

  const creator = ex?.createdBy ? state.nodes.find((n) => n.id === ex.createdBy && n.kind === "person") : undefined;

  const save = async () => {
    const title = f.title.trim();
    if (!title) {
      setTitleErr(true);
      titleRef.current?.focus();
      return;
    }
    const fields = {
      category: f.category,
      columnId: f.columnId,
      title,
      description: f.description.trim(),
      dueDate: f.dueDate || null,
      leadId: f.leadId || null,
      ownerId: f.ownerId || null,
    };
    setBusy(true);
    let targetId = currentId;
    try {
      if (targetId && ex) {
        await actions.updateTask(targetId, fields);
      } else {
        targetId = uuid();
        await actions.createTask({ ...fields, id: targetId, createdBy: prefs.me });
      }
    } catch {
      setBusy(false); // the error toast shows the server message; keep the modal open
      return;
    }
    try {
      await applyAttachmentDraft(actions, "task", targetId, draft);
      onClose();
    } catch {
      if (!ex) setSavedId(targetId); // the item exists now — further saves update it
      setDraft(emptyDraft()); // some attachments may have been saved — the refetched state shows which
      setBusy(false);
    }
  };

  const duplicate = async () => {
    if (!ex) return;
    try {
      const res = await actions.duplicateTask(ex.id, prefs.me);
      onOpenTask(res.task.id);
    } catch {
      /* toast */
    }
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
            {ex ? "Uložit" : "Vytvořit úkol"}
          </button>
        </>
      }
    >
      <div className="mb">
        <div className="f">
          <label htmlFor="fCat">Kategorie</label>
          <select id="fCat" value={f.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORY_OPTGROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </optgroup>
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
            Název úkolu <span className="req">*</span>
          </label>
          <input
            ref={titleRef}
            id="fTitle"
            value={f.title}
            placeholder="Např. Plakát na domácí zápas"
            style={titleErr ? { borderColor: "#b3261e" } : undefined}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className="f">
          <label htmlFor="fDue">Předpokládaný termín dokončení</label>
          <input id="fDue" type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </div>
        <div className="f w">
          <label htmlFor="fDesc">Popis</label>
          <textarea id="fDesc" placeholder="Co je potřeba udělat, termíny, formáty…" value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="fLead">Zodpovědný vedoucí</label>
          <select id="fLead" value={f.leadId} onChange={(e) => set("leadId", e.target.value)}>
            <option value="">— nevybráno —</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor="fOwner">Zodpovědný za úkol</label>
          <select id="fOwner" value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
            <option value="">— nevybráno —</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="f w">
          <span className="lbl">Přílohy a odkazy</span>
          <AttachmentBox existing={attachmentsOf(state.attachments, "task", currentId)} draft={draft} onChange={setDraft} />
        </div>
      </div>
    </Modal>
  );
}
