"use client";
/** Due / realisation date chip (prototype §7.5 `dueHTML`): grey, `.soon` ≤ 3 days, `.late` overdue, `.done` in the last column. */
import { dueInfo } from "@/lib/due";

export function DueChip({ date, inLastColumn }: { date: string; inLastColumn: boolean }) {
  const d = dueInfo(date, inLastColumn);
  return (
    <span className={`due ${d.cls}`} title={d.title}>
      {d.text}
    </span>
  );
}
