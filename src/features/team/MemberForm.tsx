"use client";
/** Member form „Člen týmu" / „Nový člen" (prototype §10.10). */
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCloseWhenDeleted } from "@/components/ui/useCloseWhenDeleted";
import { AREAS, AVPAL, BUDGET_COLORS } from "@/lib/constants";
import { nf, parseDigits } from "@/lib/format";
import { changedFields, isEmptyPatch } from "@/lib/patch";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import { assignedTaskCount, colorOf, parentOptions } from "@/lib/tree";
import type { BudgetColor } from "@/lib/types";
import { ParentSelect } from "./ParentSelect";

interface FormValues {
  name: string;
  role: string;
  info: string;
  budget: string;
  color: string;
  budColor: BudgetColor;
  parent: string;
  areas: string[];
}

/** Form values → API fields (shared by the save payload and the „unchanged" baseline). */
function toFields(v: FormValues) {
  return {
    name: v.name.trim(),
    role: v.role.trim() || null,
    info: v.info.trim() || null,
    budget: parseDigits(v.budget),
    budgetColor: v.budColor,
    avatarColor: v.color || null,
    parentId: v.parent || null,
    areas: AREAS.filter((a) => v.areas.includes(a)),
  };
}

export function MemberForm({ id, parentId, onClose, onOpenMember }: { id: string | null; parentId: string | null; onClose: () => void; onOpenMember: (id: string) => void }) {
  const state = useAppState();
  const actions = useActions();
  const [prefs] = usePrefs();
  const ex = id ? state.nodes.find((n) => n.id === id && n.kind === "person") : undefined;
  useCloseWhenDeleted(!!id && !ex, onClose);

  // values when the form opened — the baseline for „send only what changed"
  const [init] = useState<FormValues>(() => ({
    name: ex?.name ?? "",
    role: ex?.role ?? "",
    info: ex?.info ?? "",
    budget: ex?.budget ? nf(ex.budget) : "",
    color: ex ? ex.avatarColor || colorOf(state.nodes, ex.id) : "",
    budColor: ex?.budgetColor ?? "blue",
    parent: ex ? (ex.parentId ?? "") : (parentId ?? ""),
    areas: ex?.areas ?? [],
  }));
  const [name, setName] = useState(init.name);
  const [role, setRole] = useState(init.role);
  const [info, setInfo] = useState(init.info);
  const [budget, setBudget] = useState(init.budget);
  const [color, setColor] = useState<string>(init.color);
  const [budColor, setBudColor] = useState<BudgetColor>(init.budColor);
  const [parent, setParent] = useState<string>(init.parent);
  const [areas, setAreas] = useState<string[]>(init.areas);
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ex) return;
    const t = setTimeout(() => nameRef.current?.focus(), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opts = parentOptions(state.nodes, ex?.id ?? null);

  const save = () => {
    const n = name.trim();
    if (!n) {
      setNameErr(true);
      nameRef.current?.focus();
      return;
    }
    const fields = toFields({ name, role, info, budget, color, budColor, parent, areas });
    onClose();
    if (ex) {
      // only the changed fields: a concurrent edit (or a move in the tree) by someone else is kept
      const patch = changedFields(fields, toFields(init));
      if (!isEmptyPatch(patch)) void actions.updateNode(ex.id, patch).catch(() => {});
    } else {
      void actions.createNode({ kind: "person", ...fields }).catch(() => {});
    }
  };

  const remove = () => {
    if (!ex) return;
    if (!window.confirm(`Odebrat ${ex.name}? Jeho úkoly zůstanou bez přiřazení a podřízení přejdou pod jeho nadřízeného.`)) return;
    onClose();
    void actions.deleteNode(ex.id).catch(() => {});
  };

  const duplicate = async () => {
    if (!ex) return;
    onClose();
    try {
      const res = await actions.duplicateNode(ex.id);
      const copy = res.nodes[0];
      if (copy) onOpenMember(copy.id);
    } catch {
      /* error shown by the store */
    }
  };

  return (
    <Modal
      title={ex ? "Člen týmu" : "Nový člen"}
      onClose={onClose}
      portal
      testId="member-modal"
      foot={
        <>
          <span className="meta">{ex ? `${assignedTaskCount(ex.id, state.tasks)} přiřazených úkolů` : ""}</span>
          {ex && ex.id !== prefs.me && (
            <button type="button" className="btn danger" id="mDel" onClick={remove}>
              Odebrat
            </button>
          )}
          {ex && (
            <button type="button" className="btn outline" id="mDup" onClick={duplicate}>
              Duplikovat
            </button>
          )}
          <button type="button" className="btn outline" onClick={onClose}>
            Zrušit
          </button>
          <button type="button" className="btn primary" id="mOk" onClick={save}>
            {ex ? "Uložit" : "Přidat člena"}
          </button>
        </>
      }
    >
      <div className="mb">
        <div className="f">
          <label htmlFor="mName">
            Jméno a příjmení <span className="req">*</span>
          </label>
          <input
            id="mName"
            ref={nameRef}
            value={name}
            placeholder="Např. Jana Nováková"
            style={nameErr ? { borderColor: "#b3261e" } : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="f">
          <label htmlFor="mRole">Role</label>
          <input id="mRole" value={role} placeholder="Např. Sociální sítě" onChange={(e) => setRole(e.target.value)} />
        </div>
        <div className="f w">
          <label htmlFor="mInfo">Krátká informace</label>
          <textarea id="mInfo" style={{ minHeight: 80 }} value={info} placeholder="Např. kontakt, dostupnost, na co se obracet…" onChange={(e) => setInfo(e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="mBud">Budget</label>
          <input id="mBud" inputMode="numeric" value={budget} placeholder="Např. 25 000" onChange={(e) => setBudget(e.target.value)} />
        </div>
        <div className="f w">
          <span className="lbl">Barva profilu</span>
          <div className="avpick">
            {AVPAL.map((c) => (
              <label key={c} title={c}>
                <input type="radio" name="avc" value={c} checked={color === c} onChange={() => setColor(c)} />
                <i style={{ background: c }} />
              </label>
            ))}
          </div>
        </div>
        <div className="f">
          <span className="lbl">Stav budgetu</span>
          <div className="budc">
            {BUDGET_COLORS.map((b) => (
              <label key={b.value}>
                <input type="radio" name="budc" value={b.value} checked={budColor === b.value} onChange={() => setBudColor(b.value)} />
                <i style={{ background: b.color }} />
                {b.label}
              </label>
            ))}
          </div>
        </div>
        <div className="f w">
          <label htmlFor="mBoss">Nadřízený</label>
          <ParentSelect id="mBoss" value={parent} onChange={setParent} emptyLabel="— nikdo (vedení týmu) —" options={opts} />
        </div>
        <div className="f w">
          <span className="lbl">Oblasti, na které se zaměřuje</span>
          <div className="chkgrid">
            {AREAS.map((a) => (
              <label key={a}>
                <input
                  type="checkbox"
                  value={a}
                  checked={areas.includes(a)}
                  onChange={(e) => setAreas((cur) => (e.target.checked ? [...cur, a] : cur.filter((x) => x !== a)))}
                />
                {a}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
