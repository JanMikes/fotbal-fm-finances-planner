"use client";
/** „Typy médií" management dialog (prototype §9.5): rename (blur / Enter), delete (min 1, confirm + move), add. */
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { plural, pluralize } from "@/lib/format";
import { useActions, useAppState } from "@/lib/store/react";
import "./print.css";

const noop = () => undefined;

export function PrintTypesModal({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const actions = useActions();
  const newRef = useRef<HTMLInputElement | null>(null);
  const types = [...state.printTypes].sort((a, b) => a.sortOrder - b.sortOrder);
  const countOf = (id: string) => state.printItems.filter((i) => i.typeId === id).length;

  const rename = (input: HTMLInputElement, id: string, old: string) => {
    const v = input.value.trim();
    if (v === old) {
      input.value = old;
      return;
    }
    if (!v || types.some((t) => t.id !== id && t.name === v)) {
      input.value = old; // empty or duplicate → revert silently
      return;
    }
    void actions.renamePrintType(id, v).catch(noop);
  };

  const remove = (id: string, name: string) => {
    if (types.length <= 1) {
      window.alert("Musí zůstat alespoň jeden typ.");
      return;
    }
    const n = countOf(id);
    const rest = types.filter((t) => t.id !== id);
    const what = n === 1 ? "1 tiskovinu. Přesunout ji" : `${n} ${plural(n, "tiskovinu", "tiskoviny", "tiskovin")}. Přesunout je`;
    if (n && !window.confirm(`Typ „${name}“ používá ${what} pod „${rest[0].name}“ a typ smazat?`)) return;
    void actions.deletePrintType(id).catch(noop);
  };

  const add = () => {
    const el = newRef.current;
    if (!el) return;
    const v = el.value.trim();
    if (!v) {
      el.focus();
      return;
    }
    if (!types.some((t) => t.name === v)) void actions.createPrintType(v).catch(noop);
    el.value = "";
    el.focus();
  };

  return (
    <Modal
      title="Typy médií"
      onClose={onClose}
      testId="types-modal"
      initialFocus="#tNew"
      meta="Přejmenování se propíše do všech tiskovin."
      foot={
        <Button variant="outline" data-close2="" onClick={onClose}>
          Hotovo
        </Button>
      }
    >
      <div className="mb">
        <ul className="ulist types-list" id="tl" aria-label="Typy médií">
          {types.map((t) => (
            <li className="urow trow" key={`${t.id}:${t.name}`}>
              <input
                className="ti-input"
                data-ti={t.id}
                defaultValue={t.name}
                aria-label={`Název typu ${t.name}`}
                autoComplete="off"
                onBlur={(e) => rename(e.currentTarget, t.id, t.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename(e.currentTarget, t.id, t.name);
                }}
              />
              <span className="n">{pluralize(countOf(t.id), "položka", "položky", "položek")}</span>
              <Button variant="ghost" size="sm" className="ti-del" data-td={t.id} aria-label={`Smazat typ ${t.name}`} onClick={() => remove(t.id, t.name)}>
                Smazat
              </Button>
            </li>
          ))}
        </ul>
        <Field label="Nový typ" htmlFor="tNew" wide>
          <div className="types-new">
            <input
              ref={newRef}
              id="tNew"
              className="ti-new"
              placeholder="Např. Pozvánky"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            <Button variant="primary" id="tAdd" onClick={add}>
              Přidat
            </Button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
