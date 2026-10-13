"use client";
/**
 * Org tree (prototype §10.4–10.7): nested `ul/li` with CSS connectors (`.tree`), person and unit cards.
 * Interaction is delegated to the `.org` container (TeamTab / useOrgDrag) via data attributes:
 * `data-uid`, `data-unit`, `data-sub` (+ button), `data-info` (i button). Each card's name is a real `<button>`
 * (keyboard: Tab + Enter/Space opens the form; the card shows the focus ring) — the card itself is not interactive,
 * so the „i" / „+" buttons are not nested inside another button.
 */
import { memo } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { CATS } from "@/lib/constants";
import { kcs } from "@/lib/format";
import { buildTree, peopleCount, personStats, unitTaskCount, type TreeNode } from "@/lib/tree";
import type { OrgNode, Task } from "@/lib/types";
import type { DropPos } from "./dropZone";
import { budgetFlagTitle, memberWord, personStatsTitle, taskWord, unitBackground, unitInk } from "./orgText";

export interface TreeDragView {
  /** Node being dragged (rendered as the dashed placeholder `.ph`). */
  dragId: string | null;
  /** Current drop target node + position (`.drop` / `.drop-before` / `.drop-after`). */
  overId: string | null;
  overPos: DropPos | null;
}

interface Props extends TreeDragView {
  nodes: OrgNode[];
  tasks: Task[];
  lastColumnId: string | null;
  /** Person whose info bubble is open (`aria-expanded` on its „i" button). */
  infoId: string | null;
}

export const OrgTree = memo(function OrgTree({ nodes, tasks, lastColumnId, dragId, overId, overPos, infoId }: Props) {
  const tree = buildTree(nodes);
  const ctx: Ctx = { nodes, tasks, lastColumnId, dragId, overId, overPos, infoId };
  return (
    <div className="tree" id="tree">
      <ul>
        {tree.map((t) => (
          <Branch key={t.node.id} t={t} root ctx={ctx} />
        ))}
      </ul>
    </div>
  );
});

interface Ctx extends TreeDragView {
  nodes: OrgNode[];
  tasks: Task[];
  lastColumnId: string | null;
  infoId: string | null;
}

function dragCls(id: string, ctx: Ctx): string {
  let c = "";
  if (ctx.dragId === id) c += " ph";
  if (ctx.overId === id) c += ctx.overPos === "child" ? " drop" : ctx.overPos ? " drop-" + ctx.overPos : "";
  return c;
}

function Branch({ t, root, ctx }: { t: TreeNode; root?: boolean; ctx: Ctx }) {
  return (
    <li>
      {t.node.kind === "unit" ? <UnitCard n={t.node} ctx={ctx} /> : <PersonCard n={t.node} root={!!root} ctx={ctx} />}
      {t.children.length > 0 && (
        <ul>
          {t.children.map((c) => (
            <Branch key={c.node.id} t={c} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PersonCard({ n, root, ctx }: { n: OrgNode; root: boolean; ctx: Ctx }) {
  const { act, lead } = personStats(n.id, ctx.tasks, ctx.lastColumnId);
  const bud = n.budgetColor === "green" ? " green" : n.budgetColor === "red" ? " red" : "";
  const infoOpen = ctx.infoId === n.id;
  return (
    <div className={"onode" + (root ? " root" : "") + dragCls(n.id, ctx)} data-uid={n.id}>
      <div className="hd">
        {/* decorative here: the name is right next to it */}
        <Avatar nodes={ctx.nodes} id={n.id} label={false} />
        <div>
          <button type="button" className="nm" title={n.name}>
            {n.name}
          </button>
          <div className="rl">{n.role || "Člen týmu"}</div>
        </div>
      </div>
      {n.areas.length > 0 && (
        <div className="ar">
          {n.areas.map((a) => (
            <span key={a}>{a}</span>
          ))}
        </div>
      )}
      <div className="st" title={personStatsTitle(act, lead)}>
        <span className="st-i">
          <b>{act}</b> {taskWord(act)}
        </span>
        <span className="st-i">
          vede <b>{lead}</b>
        </span>
        {n.budget ? (
          <span className={"bud" + bud} title={budgetFlagTitle(n.budget, n.budgetColor)}>
            {kcs(n.budget)}
          </span>
        ) : null}
      </div>
      {n.info ? (
        <button
          type="button"
          className="info has"
          data-info={n.id}
          title="Informace"
          aria-label={`Informace – ${n.name}`}
          aria-expanded={infoOpen}
          aria-controls={infoOpen ? "infoPop" : undefined}
        >
          i
        </button>
      ) : null}
      <button type="button" className="plus" data-sub={n.id} title="Přidat podřízeného" aria-label={`Přidat podřízeného – ${n.name}`}>
        +
      </button>
    </div>
  );
}

function UnitCard({ n, ctx }: { n: OrgNode; ctx: Ctx }) {
  const ppl = peopleCount(ctx.nodes, n.id);
  const tc = unitTaskCount(n.name, ctx.tasks, ctx.lastColumnId, CATS);
  const bg = n.color ? unitBackground(n.color) : null;
  const style = bg ? { background: bg, borderColor: bg } : undefined;
  const ink = unitInk(n.color);
  return (
    <div className={"onode unit" + (ink ? " " + ink : "") + dragCls(n.id, ctx)} data-uid={n.id} data-unit="1" style={style}>
      <span className="uk">Kategorie</span>
      <button type="button" className="un" title={n.name}>
        {n.name}
      </button>
      <div className="st">
        <span className="st-i">
          <b>{ppl}</b> {memberWord(ppl)}
        </span>
        {tc !== null && (
          <span className="st-i" title="Rozpracované úkoly v této kategorii">
            <b>{tc}</b> {taskWord(tc)}
          </span>
        )}
      </div>
      <button type="button" className="plus" data-sub={n.id} title="Přidat člena pod kategorii" aria-label={`Přidat člena do kategorie ${n.name}`}>
        +
      </button>
    </div>
  );
}
