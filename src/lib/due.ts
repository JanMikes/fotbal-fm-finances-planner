/** Due-date badge logic (prototype `dueHTML`, §7.5). */
import { formatDate, formatDayMonth, parseIsoDate } from "./format";

export type DueClass = "" | "soon" | "late" | "done";

export interface DueInfo {
  /** CSS modifier for `.due` */
  cls: DueClass;
  /** "Dnes" | "Zítra" | "15. 10." */
  text: string;
  /** Tooltip, e.g. "Termín dokončení: 15. 10. 2026 — po termínu" */
  title: string;
  /** Days from today (negative = overdue). */
  diff: number;
}

/**
 * @param due "YYYY-MM-DD"
 * @param inLastColumn the item sits in the last column of its board (→ muted)
 * @param titlePrefix tooltip prefix; prototype uses "Termín dokončení: " on both boards
 */
export function dueInfo(due: string, inLastColumn: boolean, now: Date = new Date(), titlePrefix = "Termín dokončení: "): DueInfo {
  const d = parseIsoDate(due);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 864e5);
  const cls: DueClass = inLastColumn ? "done" : diff < 0 ? "late" : diff <= 3 ? "soon" : "";
  const text = diff === 0 ? "Dnes" : diff === 1 ? "Zítra" : formatDayMonth(d);
  const title = titlePrefix + formatDate(d) + (!inLastColumn && diff < 0 ? " — po termínu" : "");
  return { cls, text, title, diff };
}
