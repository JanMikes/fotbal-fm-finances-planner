"use client";
/** „Typy médií" management dialog (prototype §9.5): rename (blur / Enter), delete (min 1, confirm + move), add. */
import { useRef, type CSSProperties } from "react";
import { Modal } from "@/components/ui/Modal";
import { useActions, useAppState } from "@/lib/store/react";

// inline styles copied verbatim from the prototype markup
const ROW_INPUT: CSSProperties = { border: "1px solid var(--grey-200)", borderRadius: 3, padding: "0 10px", minHeight: 40, fontSize: 15, fontWeight: 700, color: "var(--fm-navy)" };
const ROW_BTN: CSSProperties = { minHeight: 36, padding: "0 10px" };
const NEW_INPUT: CSSProperties = { border: "1px solid var(--grey-300)", borderRadius: 3, padding: "0 12px", minHeight: 44, fontSize: 15 };

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
    if (n && !window.confirm(`Typ „${name}“ používá ${n} tiskovin. Přesunout je pod „${rest[0].name}“ a typ smazat?`)) return;
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
      foot={
        <>
          <span className="meta">Přejmenování se propíše do všech tiskovin.</span>
          <button className="btn outline" data-close2="" type="button" onClick={onClose}>
            Hotovo
          </button>
        </>
      }
    >
      <div className="mb">
        <div className="f w">
          <div className="ulist" id="tl">
            {types.map((t) => (
              <div className="urow trow" key={`${t.id}:${t.name}`}>
                <input
                  data-ti={t.id}
                  defaultValue={t.name}
                  aria-label={`Typ ${t.name}`}
                  style={ROW_INPUT}
                  onBlur={(e) => rename(e.currentTarget, t.id, t.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(e.currentTarget, t.id, t.name);
                  }}
                />
                <span className="n">{countOf(t.id)} položek</span>
                <button className="btn outline" data-td={t.id} type="button" style={ROW_BTN} onClick={() => remove(t.id, t.name)}>
                  Smazat
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="f w">
          <label htmlFor="tNew">Nový typ</label>
          <div className="trow">
            <input
              ref={newRef}
              id="tNew"
              placeholder="Např. Pozvánky"
              style={NEW_INPUT}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            <button className="btn primary" id="tAdd" type="button" onClick={add}>
              Přidat
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
