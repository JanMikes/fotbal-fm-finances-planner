"use client";
/**
 * Org tree (prototype §10.4–10.7): nested `ul/li` with CSS connectors (`.tree`), person and unit cards.
 * Interaction is delegated to the `.org` container (TeamTab / useOrgDrag) via data attributes:
 * `data-uid`, `data-unit`, `data-sub` (+ button), `data-info` (i button).
 */
import { memo } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { CATS } from "@/lib/constants";
import { kcs } from "@/lib/format";
import { buildTree, isLightColor, peopleCount, personStats, unitTaskCount, type TreeNode } from "@/lib/tree";
import type { OrgNode, Task } from "@/lib/types";
import type { DropPos } from "./dropZone";

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
}

export const OrgTree = memo(function OrgTree({ nodes, tasks, lastColumnId, dragId, overId, overPos }: Props) {
  const tree = buildTree(nodes);
  const ctx: Ctx = { nodes, tasks, lastColumnId, dragId, overId, overPos };
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
  return (
    <div className={"onode" + (root ? " root" : "") + dragCls(n.id, ctx)} data-uid={n.id} role="button" tabIndex={0}>
      <div className="hd">
        <Avatar nodes={ctx.nodes} id={n.id} />
        <div>
          <div className="nm">{n.name}</div>
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
      <div className="st">
        <span>
          <b>{act}</b>řeší
        </span>
        <span>
          <b>{lead}</b>vede
        </span>
        {n.budget ? (
          <span className={"bud" + bud} title="Budget">
            {kcs(n.budget)}
          </span>
        ) : null}
      </div>
      {n.info ? (
        <button type="button" className="info has" data-info={n.id} title="Informace" aria-label="Informace">
          i
        </button>
      ) : null}
      <button type="button" className="plus" data-sub={n.id} title="Přidat podřízeného" aria-label="Přidat podřízeného">
        +
      </button>
    </div>
  );
}

function UnitCard({ n, ctx }: { n: OrgNode; ctx: Ctx }) {
  const ppl = peopleCount(ctx.nodes, n.id);
  const tc = unitTaskCount(n.name, ctx.tasks, ctx.lastColumnId, CATS);
  const style = n.color ? { background: n.color, borderColor: n.color } : undefined;
  return (
    <div className={"onode unit" + (isLightColor(n.color) ? " lt" : "") + dragCls(n.id, ctx)} data-uid={n.id} data-unit="1" role="button" tabIndex={0} style={style}>
      <span className="uk">Kategorie</span>
      <span className="un">{n.name}</span>
      <div className="st">
        <span>
          <b>{ppl}</b>pod ní
        </span>
        {tc !== null && (
          <span>
            <b>{tc}</b>úkolů
          </span>
        )}
      </div>
      <button type="button" className="plus" data-sub={n.id} title="Přidat člena pod kategorii" aria-label="Přidat člena">
        +
      </button>
    </div>
  );
}
