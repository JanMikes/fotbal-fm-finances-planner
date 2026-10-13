"use client";
/**
 * Member form „Člen týmu" / „Nový člen" (prototype §10.10). Saves optimistically and closes at once; an edit sends
 * only the changed fields (`changedFields` against the values the form opened with).
 */
import { useRef, useState } from "react";
import { Button, Field, fieldA11y, Modal, MoneyInput, useCloseWhenDeleted } from "@/components/ui";
import { AREAS, AVPAL, BUDGET_COLORS, colorName } from "@/lib/constants";
import { changedFields, isEmptyPatch } from "@/lib/patch";
import { useActions, useAppState, usePrefs } from "@/lib/store/react";
import { assignedTaskCount, colorOf, inkOn, parentOptions } from "@/lib/tree";
import type { BudgetColor } from "@/lib/types";
import { assignedTasksLabel } from "./orgText";
import { ParentSelect } from "./ParentSelect";

interface FormValues {
  name: string;
  role: string;
  info: string;
  budget: number | null;
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
    budget: v.budget,
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
    budget: ex?.budget ?? null,
    color: ex ? ex.avatarColor || colorOf(state.nodes, ex.id) : "",
    budColor: ex?.budgetColor ?? "blue",
    parent: ex ? (ex.parentId ?? "") : (parentId ?? ""),
    areas: ex?.areas ?? [],
  }));
  const [name, setName] = useState(init.name);
  const [role, setRole] = useState(init.role);
  const [info, setInfo] = useState(init.info);
  const [budget, setBudget] = useState<number | null>(init.budget);
  const [color, setColor] = useState<string>(init.color);
  const [budColor, setBudColor] = useState<BudgetColor>(init.budColor);
  const [parent, setParent] = useState<string>(init.parent);
  const [areas, setAreas] = useState<string[]>(init.areas);
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

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

  const nameError = nameErr ? "Vyplňte jméno" : null;

  return (
    <Modal
      title={ex ? "Člen týmu" : "Nový člen"}
      onClose={onClose}
      portal
      testId="member-modal"
      initialFocus={ex ? undefined : "#mName"}
      onSubmit={save}
      meta={ex ? assignedTasksLabel(assignedTaskCount(ex.id, state.tasks)) : undefined}
      footStart={
        ex ? (
          <>
            {ex.id !== prefs.me && (
              <Button variant="danger" id="mDel" className="mf-ic mf-ic--del" onClick={remove}>
                Odebrat
              </Button>
            )}
            <Button variant="outline" id="mDup" className="mf-ic mf-ic--dup" onClick={duplicate}>
              Duplikovat
            </Button>
          </>
        ) : undefined
      }
      foot={
        <>
          <Button variant="outline" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" id="mOk" onClick={save}>
            {ex ? "Uložit" : "Přidat člena"}
          </Button>
        </>
      }
    >
      <div className="mb">
        <Field label="Jméno a příjmení" htmlFor="mName" required error={nameError}>
          <input
            id="mName"
            ref={nameRef}
            value={name}
            placeholder="Např. Jana Nováková"
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              if (nameErr && e.target.value.trim()) setNameErr(false);
            }}
            {...fieldA11y("mName", { error: nameError, required: true })}
          />
        </Field>
        <Field label="Role" htmlFor="mRole">
          <input id="mRole" value={role} placeholder="Např. Sociální sítě" autoComplete="off" onChange={(e) => setRole(e.target.value)} />
        </Field>
        <Field label="Krátká informace" htmlFor="mInfo" wide hint="Zobrazí se po kliknutí na „i“ na kartě člena.">
          <textarea
            id="mInfo"
            className="tm-info"
            value={info}
            placeholder="Např. kontakt, dostupnost, na co se obracet…"
            onChange={(e) => setInfo(e.target.value)}
            {...fieldA11y("mInfo", { hint: true })}
          />
        </Field>
        <Field label="Nadřízený" htmlFor="mBoss">
          <ParentSelect id="mBoss" value={parent} onChange={setParent} emptyLabel="— nikdo (vedení týmu) —" options={opts} />
        </Field>
        <Field label="Budget" htmlFor="mBud">
          <MoneyInput id="mBud" value={budget} onChange={setBudget} suffix="Kč" placeholder="Např. 25 000" />
        </Field>
        <Field label="Stav budgetu" group wide>
          <div className="budc">
            {BUDGET_COLORS.map((b) => (
              <label key={b.value}>
                <input type="radio" name="budc" value={b.value} checked={budColor === b.value} onChange={() => setBudColor(b.value)} />
                <i style={{ background: b.color }} />
                {b.label}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Barva profilu" group wide>
          <div className="avpick">
            {AVPAL.map((c) => (
              <label key={c} title={c}>
                <input type="radio" name="avc" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={colorName(c)} />
                <i style={{ background: c, color: inkOn(c).ink }} />
              </label>
            ))}
          </div>
        </Field>
        <Field label="Oblasti, na které se zaměřuje" group wide>
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
        </Field>
      </div>
    </Modal>
  );
}
