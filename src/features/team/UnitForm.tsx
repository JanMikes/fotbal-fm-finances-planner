"use client";
/** Unit (category) form „Kategorie" / „Nová kategorie" (prototype §10.11). */
import { useEffect, useRef, useState } from "react";
import type { NodeInput } from "@/lib/api";
import { AVPAL, DEFAULT_UNIT_COLOR, UNIT_NAME_SUGGESTIONS } from "@/lib/constants";
import { useActions, useAppState } from "@/lib/store/react";
import { parentOptions } from "@/lib/tree";
import { ParentSelect } from "./ParentSelect";
import { TeamModal } from "./TeamModal";

export function UnitForm({ id, parentId, onClose }: { id: string | null; parentId: string | null; onClose: () => void }) {
  const state = useAppState();
  const actions = useActions();
  const ex = id ? state.nodes.find((n) => n.id === id && n.kind === "unit") : undefined;

  const [name, setName] = useState(ex?.name ?? "");
  const [color, setColor] = useState<string>(ex?.color || DEFAULT_UNIT_COLOR);
  const [parent, setParent] = useState<string>(ex ? (ex.parentId ?? "") : (parentId ?? ""));
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
    onClose();
    const parentIdNew = parent || null;
    if (ex) {
      const patch: NodeInput = { name: n, color: color || null };
      if ((ex.parentId ?? null) !== parentIdNew) patch.parentId = parentIdNew;
      void actions.updateNode(ex.id, patch).catch(() => {});
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

  return (
    <TeamModal
      title={ex ? "Kategorie" : "Nová kategorie"}
      onClose={onClose}
      footer={
        <>
          <span className="meta">Pokud se název shoduje s kategorií úkolů, karta ukazuje počet rozpracovaných úkolů.</span>
          {ex && (
            <>
              <button type="button" className="btn danger" id="uDel" onClick={remove}>
                Smazat
              </button>
              <button type="button" className="btn outline" id="uDup" onClick={duplicate}>
                Duplikovat
              </button>
            </>
          )}
          <button type="button" className="btn outline" onClick={onClose}>
            Zrušit
          </button>
          <button type="button" className="btn primary" id="uOk" onClick={save}>
            {ex ? "Uložit" : "Přidat kategorii"}
          </button>
        </>
      }
    >
      <div className="mb">
        <div className="f w">
          <label htmlFor="uName">
            Název kategorie <span className="req">*</span>
          </label>
          <input
            id="uName"
            ref={nameRef}
            list="uSug"
            value={name}
            placeholder="Např. Sociální sítě, Mládež, Web…"
            style={nameErr ? { borderColor: "#b3261e" } : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <datalist id="uSug">
            {UNIT_NAME_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="f w">
          <span className="lbl">Barva kategorie</span>
          <div className="avpick">
            {AVPAL.map((c) => (
              <label key={c} title={c}>
                <input type="radio" name="ucol" value={c} checked={color === c} onChange={() => setColor(c)} />
                <i style={{ background: c }} />
              </label>
            ))}
          </div>
        </div>
        <div className="f w">
          <label htmlFor="uBoss">Zařazení ve struktuře (pod koho patří)</label>
          <ParentSelect id="uBoss" value={parent} onChange={setParent} emptyLabel="— nejvyšší úroveň —" options={opts} />
        </div>
      </div>
    </TeamModal>
  );
}
