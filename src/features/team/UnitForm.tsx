"use client";
/** Unit (category) form „Kategorie" / „Nová kategorie" (prototype §10.11). */
import { useRef, useState } from "react";
import { Button, Field, fieldA11y, Modal, useCloseWhenDeleted } from "@/components/ui";
import { AVPAL, colorName, DEFAULT_UNIT_COLOR, UNIT_NAME_SUGGESTIONS } from "@/lib/constants";
import { changedFields, isEmptyPatch } from "@/lib/patch";
import { useActions, useAppState } from "@/lib/store/react";
import { parentOptions } from "@/lib/tree";
import { ParentSelect } from "./ParentSelect";

export function UnitForm({ id, parentId, onClose }: { id: string | null; parentId: string | null; onClose: () => void }) {
  const state = useAppState();
  const actions = useActions();
  const ex = id ? state.nodes.find((n) => n.id === id && n.kind === "unit") : undefined;
  useCloseWhenDeleted(!!id && !ex, onClose);

  const [init] = useState(() => ({
    name: ex?.name ?? "",
    color: ex?.color || DEFAULT_UNIT_COLOR,
    parent: ex ? (ex.parentId ?? "") : (parentId ?? ""),
  }));
  const [name, setName] = useState(init.name);
  const [color, setColor] = useState<string>(init.color);
  const [parent, setParent] = useState<string>(init.parent);
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
    onClose();
    const parentIdNew = parent || null;
    if (ex) {
      // only the changed fields: a concurrent edit (or a move in the tree) by someone else is kept
      const patch = changedFields(
        { name: n, color: color || null, parentId: parentIdNew },
        { name: init.name.trim(), color: init.color || null, parentId: init.parent || null },
      );
      if (!isEmptyPatch(patch)) void actions.updateNode(ex.id, patch).catch(() => {});
    } else {
      void actions.createNode({ kind: "unit", name: n, color: color || null, parentId: parentIdNew }).catch(() => {});
    }
  };

  const remove = () => {
    if (!ex) return;
    if (!window.confirm(`Smazat kategorii ${ex.name}? Vše pod ní se přesune o úroveň výš.`)) return;
    onClose();
    void actions.deleteNode(ex.id).catch(() => {});
  };

  const duplicate = () => {
    if (!ex) return;
    onClose();
    void actions.duplicateNode(ex.id).catch(() => {});
  };

  const nameError = nameErr ? "Vyplňte název" : null;

  return (
    <Modal
      title={ex ? "Kategorie" : "Nová kategorie"}
      onClose={onClose}
      portal
      testId="unit-modal"
      initialFocus={ex ? undefined : "#uName"}
      onSubmit={save}
      footStart={
        ex ? (
          <>
            <Button variant="danger" id="uDel" onClick={remove}>
              Smazat
            </Button>
            <Button variant="outline" id="uDup" onClick={duplicate}>
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
          <Button variant="primary" id="uOk" onClick={save}>
            {ex ? "Uložit" : "Přidat kategorii"}
          </Button>
        </>
      }
    >
      <div className="mb">
        <Field
          label="Název kategorie"
          htmlFor="uName"
          required
          wide
          error={nameError}
          hint="Pokud se název shoduje s kategorií úkolů, karta ukazuje počet rozpracovaných úkolů."
        >
          <input
            id="uName"
            ref={nameRef}
            list="uSug"
            value={name}
            placeholder="Např. Sociální sítě, Mládež, Web…"
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              if (nameErr && e.target.value.trim()) setNameErr(false);
            }}
            {...fieldA11y("uName", { hint: true, error: nameError, required: true })}
          />
          <datalist id="uSug">
            {UNIT_NAME_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Barva kategorie" group wide>
          <div className="avpick">
            {AVPAL.map((c) => (
              <label key={c} title={c}>
                <input type="radio" name="ucol" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={colorName(c)} />
                <i style={{ background: c }} />
              </label>
            ))}
          </div>
        </Field>
        <Field label="Zařazení ve struktuře (pod koho patří)" htmlFor="uBoss" wide>
          <ParentSelect id="uBoss" value={parent} onChange={setParent} emptyLabel="— nejvyšší úroveň —" options={opts} />
        </Field>
      </div>
    </Modal>
  );
}
