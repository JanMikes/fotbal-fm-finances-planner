/**
 * Due-date badge logic (prototype `dueHTML`, §7.5; UX round: the chip always shows the date, plus a visible state
 * near / past the date, so neither colour alone nor a relative word alone carries the meaning — WCAG 1.4.1).
 */
import { capitalize, diffDays, formatDate, formatDateShort, formatRelativeDay, parseIsoDate } from "./dates";

export type DueClass = "" | "soon" | "late" | "done";

export interface DueInfo {
  /** CSS modifier for `.due` */
  cls: DueClass;
  /** Visible state before the date: „Po termínu" (overdue), „Dnes" / „Zítra" / „Za 3 dny" (within 6 days), else "". */
  state: string;
  /** Visible date: „15. 10." / „15. 1. 2027" (year only when ≠ current year). */
  date: string;
  /** Whole chip text: „Po termínu · 23. 9.", „Za 2 dny · 15. 10.", „20. 10.". */
  text: string;
  /** Tooltip, e.g. „Termín dokončení: 15. 10. 2026 — po termínu" / „… — za 3 dny". */
  title: string;
  /** Same information for screen readers / touch (render in `.sr-only` next to the chip). */
  srText: string;
  /** Days from today (negative = overdue). */
  diff: number;
}

/** Separator between the state and the date (NBSP before, so the state never ends a line on its own). */
export const DUE_SEP = " · ";

/**
 * @param due "YYYY-MM-DD"
 * @param inLastColumn the item sits in the last column of its board (→ muted, date only, no state)
 * @param now „today" (pass `useToday()` so chips refresh at midnight)
 * @param titlePrefix tooltip prefix: „Termín dokončení: " (tasks) / „Datum realizace: " (print)
 */
export function dueInfo(due: string, inLastColumn: boolean, now: Date = new Date(), titlePrefix = "Termín dokončení: "): DueInfo {
  const d = parseIsoDate(due);
  const diff = diffDays(d, now);
  const cls: DueClass = inLastColumn ? "done" : diff < 0 ? "late" : diff <= 3 ? "soon" : "";
  const rel = formatRelativeDay(d, now);
  const state = inLastColumn ? "" : diff < 0 ? "Po termínu" : diff <= 6 ? capitalize(rel) : "";
  const date = formatDateShort(d, now);
  const suffix = inLastColumn ? "" : diff < 0 ? ` — po termínu (${rel})` : ` — ${rel}`;
  const title = titlePrefix + formatDate(d) + suffix;
  return { cls, state, date, text: state ? state + DUE_SEP + date : date, title, srText: title, diff };
}
