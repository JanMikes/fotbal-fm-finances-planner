"use client";
/**
 * Due / realisation date chip (prototype §7.5 `dueHTML`): grey, `.soon` ≤ 3 days, `.late` overdue, `.done` in the last
 * column. Always shows the date; before it a state „Po termínu" (overdue) or „Dnes" / „Zítra" / „Za 3 dny" (within
 * 6 days) — `.due-st`. The full date + state is in the tooltip and, for touch / screen readers, in a sibling
 * `.sr-only`. `useToday()` re-renders the chip at local midnight.
 */
import { useToday } from "@/components/ui/useToday";
import { DUE_SEP, dueInfo } from "@/lib/due";

export function DueChip({ date, inLastColumn, prefix = "Termín dokončení: " }: { date: string; inLastColumn: boolean; prefix?: string }) {
  const today = useToday();
  const d = dueInfo(date, inLastColumn, today, prefix);
  return (
    <>
      <span className={`due ${d.cls}`} title={d.title} aria-hidden="true">
        {d.state ? (
          <span className="due-st">
            {d.state}
            {DUE_SEP}
          </span>
        ) : null}
        {d.date}
      </span>
      <span className="sr-only">{d.srText}</span>
    </>
  );
}
