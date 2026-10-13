"use client";
/**
 * Due / realisation date chip (prototype §7.5 `dueHTML`): grey, `.soon` ≤ 3 days, `.late` overdue, `.done` in the last
 * column. Text „Dnes" / „Za 3 dny" / „Před 2 dny" within ±6 days, else the short date; the full date + state
 * („po termínu", „za 3 dny") is in the tooltip and, for touch / screen readers, in a sibling `.sr-only`.
 * `useToday()` re-renders the chip at local midnight.
 */
import { useToday } from "@/components/ui/useToday";
import { dueInfo } from "@/lib/due";

export function DueChip({ date, inLastColumn, prefix = "Termín dokončení: " }: { date: string; inLastColumn: boolean; prefix?: string }) {
  const today = useToday();
  const d = dueInfo(date, inLastColumn, today, prefix);
  return (
    <>
      <span className={`due ${d.cls}`} title={d.title} aria-hidden="true">
        {d.text}
      </span>
      <span className="sr-only">{d.srText}</span>
    </>
  );
}
