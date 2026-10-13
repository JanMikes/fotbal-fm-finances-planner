/** Due-date badge logic (prototype `dueHTML`, §7.5; UX round: relative labels, year when ≠ current year, sr text). */
import { capitalize, diffDays, formatDate, formatDateShort, formatRelativeDay, parseIsoDate } from "./dates";

export type DueClass = "" | "soon" | "late" | "done";

export interface DueInfo {
  /** CSS modifier for `.due` */
  cls: DueClass;
  /** Visible chip text: „Dnes", „Zítra", „Včera", „Za 3 dny", „Před 2 dny" (±6 days), else „15. 10." / „15. 1. 2027". */
  text: string;
  /** Tooltip, e.g. „Termín dokončení: 15. 10. 2026 — po termínu" / „… — za 3 dny". */
  title: string;
  /** Same information for screen readers / touch (render in `.sr-only` next to the chip). */
  srText: string;
  /** Days from today (negative = overdue). */
  diff: number;
}

/**
 * @param due "YYYY-MM-DD"
 * @param inLastColumn the item sits in the last column of its board (→ muted, absolute date, no state suffix)
 * @param now „today" (pass `useToday()` so chips refresh at midnight)
 * @param titlePrefix tooltip prefix: „Termín dokončení: " (tasks) / „Datum realizace: " (print)
 */
export function dueInfo(due: string, inLastColumn: boolean, now: Date = new Date(), titlePrefix = "Termín dokončení: "): DueInfo {
  const d = parseIsoDate(due);
  const diff = diffDays(d, now);
  const cls: DueClass = inLastColumn ? "done" : diff < 0 ? "late" : diff <= 3 ? "soon" : "";
  const rel = formatRelativeDay(d, now);
  const text = !inLastColumn && Math.abs(diff) <= 6 ? capitalize(rel) : formatDateShort(d, now);
  const suffix = inLastColumn ? "" : diff < 0 ? " — po termínu" : ` — ${rel}`;
  const title = titlePrefix + formatDate(d) + suffix;
  return { cls, text, title, srText: title, diff };
}
