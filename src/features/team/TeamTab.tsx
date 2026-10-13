"use client";
/**
 * Tab „Struktura týmu" (prototype §10): section header, „Aktuální budget" box, root drop zone, org tree with
 * drag & drop, member / unit forms and the read-only info bubble. Mounted by the app shell; uses the store only.
 *
 * Layout: ≥ 1200 px the budget box is a sticky right column (`team.css`). The root drop zone is the first child and
 * sticks to the top of the scrolling tab while a drag is running (it takes no space when idle).
 * Clicks are delegated: „i" → info bubble, „+" → new member under the card, anywhere else on a card (incl. its name
 * button, which is the keyboard path: Enter/Space) → edit form. Events from the portalled forms and popovers bubble
 * here through the React tree too; they never match `.onode` / `data-*`, so they are ignored.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { lastColumnId } from "@/lib/filters";
import { useActions, useAppState } from "@/lib/store/react";
import type { OrgNode } from "@/lib/types";
import { BudgetBox } from "./BudgetBox";
import { adoptCandidates, adoptConfirmText, dropToMove, type DropTarget } from "./dropZone";
import { InfoPopover } from "./InfoPopover";
import { MemberForm } from "./MemberForm";
import { OrgTree } from "./OrgTree";
import { UnitForm } from "./UnitForm";
import { horizontalScroller, useOrgDrag } from "./useOrgDrag";
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

  // a tree wider than the view opens centred (the top-level cards sit in the middle), once per mount
  const centred = useRef(false);
  const hasNodes = state.nodes.length > 0;
  useLayoutEffect(() => {
    const c = containerRef.current;
    if (centred.current || !hasNodes || !c) return;
    centred.current = true;
    const sx = horizontalScroller(c);
    if (sx.scrollWidth > sx.clientWidth) sx.scrollLeft = (sx.scrollWidth - sx.clientWidth) / 2;
  }, [hasNodes]);

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
      const id = ib.dataset.info;
      setInfo((cur) => (cur?.id === id ? null : { id, anchor: ib }));
      return;
    }
    const plus = t.closest<HTMLElement>("[data-sub]");
    if (plus?.dataset.sub) return open("member", null, plus.dataset.sub);
    const n = t.closest<HTMLElement>(".onode");
    if (n?.dataset.uid) open(n.dataset.unit ? "unit" : "member", n.dataset.uid);
  };

  const closeInfo = useCallback(() => setInfo(null), []);

  const infoNode = info ? state.nodes.find((n) => n.id === info.id) : undefined;

  return (
    <main className="org" id="org" ref={containerRef} onClick={onClick}>
      <div className={"rootzone" + (view.rootOver ? " drop" : "")} id="rootZone">
        Pusťte sem — bude na nejvyšší úrovni struktury
      </div>
      <div className="orgh">
        <div>
          <div className="kick">Marketingový tým</div>
          <h2>Struktura týmu</h2>
        </div>
        <div className="legend" role="group" aria-label="Vysvětlivky k barvám budgetu">
          <span className="lg-t">Budget</span>
          <span>
            <i className="lg-red" />
            Na dluh
          </span>
          <span>
            <i className="lg-green" />V budgetu
          </span>
          <span>
            <i className="lg-blue" />
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
      <OrgTree
        nodes={state.nodes}
        tasks={state.tasks}
        lastColumnId={lastColumnId(state.columns, "tasks")}
        dragId={view.dragId}
        overId={view.overId}
        overPos={view.overPos}
        infoId={info?.id ?? null}
      />
      {state.nodes.length === 0 && <p className="org-empty">{"Zatím tu nikdo není — začněte tlačítkem +\u00a0Přidat\u00a0člena."}</p>}
      <div id="oTip" ref={tipRef} />
      {info && infoNode?.info && <InfoPopover name={infoNode.name} info={infoNode.info} anchor={info.anchor} onClose={closeInfo} />}
      {modal?.kind === "member" && <MemberForm key={modal.seq} id={modal.id} parentId={modal.parentId} onClose={close} onOpenMember={(id) => open("member", id)} />}
      {modal?.kind === "unit" && <UnitForm key={modal.seq} id={modal.id} parentId={modal.parentId} onClose={close} />}
    </main>
  );
}
