"use client";
/**
 * Tab „Struktura týmu" (prototype §10): section header, „Aktuální budget" box, root drop zone, org tree with
 * drag & drop, member / unit forms and the read-only info bubble. Mounted by the app shell; uses the store only.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { lastColumnId } from "@/lib/filters";
import { useActions, useAppState } from "@/lib/store/react";
import type { OrgNode } from "@/lib/types";
import { BudgetBox } from "./BudgetBox";
import { adoptCandidates, adoptConfirmText, dropToMove, type DropTarget } from "./dropZone";
import { InfoPopover } from "./InfoPopover";
import { MemberForm } from "./MemberForm";
import { OrgTree } from "./OrgTree";
import { UnitForm } from "./UnitForm";
import { useOrgDrag } from "./useOrgDrag";
import "./team.css";

type ModalState = { kind: "member" | "unit"; id: string | null; parentId: string | null; seq: number } | null;

export function TeamTab() {
  const state = useAppState();
  const actions = useActions();
  const [modal, setModal] = useState<ModalState>(null);
  const [info, setInfo] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const containerRef = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<OrgNode[]>(state.nodes);
  const seq = useRef(0);
  useEffect(() => {
    nodesRef.current = state.nodes;
  });

  const open = useCallback((kind: "member" | "unit", id: string | null, parentId: string | null = null) => {
    setInfo(null);
    setModal({ kind, id, parentId, seq: ++seq.current });
  }, []);
  const close = useCallback(() => setModal(null), []);

  const onDrop = useCallback(
    (id: string, target: DropTarget) => {
      const nodes = nodesRef.current;
      const move = dropToMove(id, target, nodes);
      if (!move) return;
      const ppl = adoptCandidates(nodes, id, target);
      if (ppl.length) {
        const unit = nodes.find((n) => n.id === id)!;
        const tp = nodes.find((n) => n.id === move.parentId)!;
        if (window.confirm(adoptConfirmText(unit.name, tp.name, ppl))) move.adoptChildren = true;
      }
      void actions.moveNode(move).catch(() => {});
    },
    [actions],
  );

  const { view, justDragged } = useOrgDrag({ containerRef, tipRef, nodesRef, onDrop });

  // the info bubble closes on any pointerdown outside it / outside an „i" button, and on scroll of the tab
  useEffect(() => {
    if (!info) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.("#infoPop,[data-info]")) setInfo(null);
    };
    const c = containerRef.current;
    const onScroll = () => setInfo(null);
    document.addEventListener("pointerdown", onDown);
    c?.addEventListener("scroll", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      c?.removeEventListener("scroll", onScroll);
    };
  }, [info]);

  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (justDragged()) return;
    const t = e.target as HTMLElement;
    const ib = t.closest<HTMLElement>("[data-info]");
    if (ib?.dataset.info) {
      setInfo({ id: ib.dataset.info, anchor: ib });
      return;
    }
    const plus = t.closest<HTMLElement>("[data-sub]");
    if (plus?.dataset.sub) return open("member", null, plus.dataset.sub);
    const n = t.closest<HTMLElement>(".onode");
    if (n?.dataset.uid) open(n.dataset.unit ? "unit" : "member", n.dataset.uid);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter") return;
    const n = (e.target as HTMLElement).closest<HTMLElement>(".onode");
    if (n?.dataset.uid && e.target === n) open(n.dataset.unit ? "unit" : "member", n.dataset.uid);
  };

  const infoNode = info ? state.nodes.find((n) => n.id === info.id) : undefined;

  return (
    <main className="org" id="org" ref={containerRef} onClick={onClick} onKeyDown={onKeyDown}>
      <div className="orgh">
        <div>
          <div className="kick">Marketingový tým</div>
          <h2>Struktura týmu</h2>
        </div>
        <div className="legend" aria-label="Vysvětlivky k barvám budgetu">
          <span className="lg-t">Budget</span>
          <span>
            <i style={{ background: "#c62f28" }} />
            Na dluh
          </span>
          <span>
            <i style={{ background: "#1f8a4c" }} />V budgetu
          </span>
          <span>
            <i style={{ background: "var(--fm-blue)" }} />
            Budoucnost
          </span>
        </div>
        <div className="obtns">
          <button type="button" className="btn outline" id="addUnit" onClick={() => open("unit", null)}>
            + Kategorie
          </button>
          <button type="button" className="btn primary" id="addMember" onClick={() => open("member", null)}>
            + Přidat člena
          </button>
        </div>
      </div>
      <BudgetBox />
      <div className={"rootzone" + (view.rootOver ? " drop" : "")} id="rootZone">
        Pusťte sem — bude na nejvyšší úrovni struktury
      </div>
      <OrgTree
        nodes={state.nodes}
        tasks={state.tasks}
        lastColumnId={lastColumnId(state.columns, "tasks")}
        dragId={view.dragId}
        overId={view.overId}
        overPos={view.overPos}
      />
      {state.nodes.length === 0 && <p className="org-empty">{"Zatím tu nikdo není — začněte tlačítkem +\u00a0Přidat\u00a0člena."}</p>}
      <div id="oTip" ref={tipRef} />
      {info && infoNode?.info && <InfoPopover name={infoNode.name} info={infoNode.info} anchor={info.anchor} />}
      {modal?.kind === "member" && <MemberForm key={modal.seq} id={modal.id} parentId={modal.parentId} onClose={close} onOpenMember={(id) => open("member", id)} />}
      {modal?.kind === "unit" && <UnitForm key={modal.seq} id={modal.id} parentId={modal.parentId} onClose={close} />}
    </main>
  );
}
