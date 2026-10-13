"use client";
/** Inner content of a task card (prototype §7.4 `cardHTML`, tasks mode). The `.card` wrapper is rendered by <Board>. */
import { Avatar } from "@/components/ui/Avatar";
import { DueChip } from "@/features/board/DueChip";
import type { OrgNode, Task } from "@/lib/types";

export function TaskCard({ task, nodes, inLastColumn, attachments }: { task: Task; nodes: readonly OrgNode[]; inLastColumn: boolean; attachments: number }) {
  return (
    <>
      <span className="cat">{task.category}</span>
      <h3>{task.title}</h3>
      {task.description ? <p>{task.description}</p> : null}
      <div className="ft">
        <span className="ppl">
          <Avatar nodes={nodes} id={task.leadId} lead />
          <Avatar nodes={nodes} id={task.ownerId} />
        </span>
        {task.dueDate ? <DueChip date={task.dueDate} inLastColumn={inLastColumn} /> : null}
        {attachments > 0 ? <span className="att">Přílohy {attachments}</span> : null}
      </div>
    </>
  );
}
