/** Board filtering, counts and month lists (prototype §7.1, §7.2, §7.6, §9.1, §9.2). */
import { ALL, GROUPS, GROUP_FILTERS } from "./constants";
import { kcs, monLab, monthKey } from "./format";
import type { BoardColumn, BoardId, PrintItem, PrintType, Task } from "./types";

export type MonthFilter = "all" | "none" | string; // "YYYY-MM"

export interface MonthOption {
  value: MonthFilter;
  label: string;
  /** tasks: count in month; print: Kč sum in month */
  value2?: number;
}

const bySort = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

/** Columns of one board in display order. */
export function columnsOf(columns: readonly BoardColumn[], board: BoardId): BoardColumn[] {
  return columns.filter((c) => c.boardId === board).sort(bySort);
}

/** Id of the last column of a board ("done" column), or null. */
export function lastColumnId(columns: readonly BoardColumn[], board: BoardId): string | null {
  const cols = columnsOf(columns, board);
  return cols.length ? cols[cols.length - 1].id : null;
}

/** Items of a column in display order. */
export function itemsInColumn<T extends { columnId: string; sortOrder: number }>(items: readonly T[], columnId: string): T[] {
  return items.filter((t) => t.columnId === columnId).sort(bySort);
}

/** Category belongs to group (prototype `inGroup`). „Vše" matches everything. */
export function inGroup(cat: string, group: string): boolean {
  return group === ALL || (GROUPS[group] ?? []).includes(cat);
}

/** Validate a stored group filter value. */
export function isValidGroupFilter(g: unknown): g is string {
  return typeof g === "string" && GROUP_FILTERS.includes(g);
}

function monthMatches(date: string | null, month: MonthFilter | undefined): boolean {
  if (!month || month === "all") return true;
  if (month === "none") return !date;
  return !!date && date.slice(0, 7) === month;
}

export interface TaskFilter {
  /** group name or "Vše" */
  filter: string;
  month: MonthFilter;
  mine: boolean;
  /** current identity (person id) */
  me: string | null;
  q: string;
}

/** Task visibility (prototype `visible(t)` tasks mode). */
export function taskVisible(t: Task, f: TaskFilter): boolean {
  if (!inGroup(t.category, f.filter)) return false;
  if (!monthMatches(t.dueDate, f.month)) return false;
  if (f.mine && t.leadId !== f.me && t.ownerId !== f.me) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!(t.title + " " + t.description + " " + t.category).toLowerCase().includes(q)) return false;
  }
  return true;
}

/** Group select counts: all tasks per group, ignoring month/search/mine. */
export function groupCounts(tasks: readonly Task[]): Array<{ group: string; count: number; label: string }> {
  return GROUP_FILTERS.map((g) => {
    const count = tasks.filter((t) => inGroup(t.category, g)).length;
    return { group: g, count, label: `${g} (${count})` };
  });
}

/** Months `from..to` relative to the current month as "YYYY-MM". */
function monthRange(now: Date, from: number, toExclusive: number): string[] {
  const out: string[] = [];
  for (let i = from; i < toExclusive; i++) out.push(monthKey(new Date(now.getFullYear(), now.getMonth() + i, 1)));
  return out;
}

/**
 * Task month select (prototype §7.6): previous + current + 11 next months + every month any task is due,
 * sorted; counts respect the group filter only. Includes "all" first and "none" last.
 */
export function taskMonthOptions(tasks: readonly Task[], group: string, now: Date = new Date()): MonthOption[] {
  const set = new Set(monthRange(now, -1, 12));
  for (const t of tasks) if (t.dueDate) set.add(t.dueDate.slice(0, 7));
  const months = [...set].sort();
  return [
    { value: "all", label: "Všechny měsíce" },
    ...months.map((m) => {
      const count = tasks.filter((t) => inGroup(t.category, group) && t.dueDate && t.dueDate.slice(0, 7) === m).length;
      return { value: m, label: monLab(m) + (count ? ` (${count})` : ""), value2: count };
    }),
    { value: "none", label: "Bez termínu" },
  ];
}

// ---------------------------------------------------------------- print board

export interface PrintFilter {
  /** print type id or "Vše" */
  typeId: string;
  month: MonthFilter;
  q: string;
}

/** Print item visibility (prototype §9.2). Archived items are never shown on the board. */
export function printVisible(item: PrintItem, typeName: string, f: PrintFilter): boolean {
  if (item.archived) return false;
  if (f.typeId !== ALL && item.typeId !== f.typeId) return false;
  if (!monthMatches(item.realizationDate, f.month)) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!(item.title + " " + item.description + " " + typeName).toLowerCase().includes(q)) return false;
  }
  return true;
}

/**
 * Type select options with counts. Archived items are EXCLUDED (DECISIONS #9 fixes the prototype bug).
 * First option value "Vše" labelled `Všechny typy (n)`.
 */
export function printTypeOptions(items: readonly PrintItem[], types: readonly PrintType[]): Array<{ value: string; label: string; count: number }> {
  const active = items.filter((i) => !i.archived);
  return [
    { value: ALL, label: `Všechny typy (${active.length})`, count: active.length },
    ...[...types].sort(bySort).map((t) => {
      const count = active.filter((i) => i.typeId === t.id).length;
      return { value: t.id, label: `${t.name} (${count})`, count };
    }),
  ];
}

/** Σ price (null → 0). */
export function sumPrices(items: readonly PrintItem[]): number {
  return items.reduce((s, i) => s + (i.price || 0), 0);
}

/**
 * Print month select (prototype §9.1): 2 previous + current + 5 next months + months of (non-archived) items;
 * label carries the Kč sum for the active type filter, e.g. `Říjen 2026 · 4 500 Kč`. Archived items excluded (DECISIONS #9).
 */
export function printMonthOptions(items: readonly PrintItem[], typeId: string, now: Date = new Date()): MonthOption[] {
  const active = items.filter((i) => !i.archived);
  const set = new Set(monthRange(now, -2, 6));
  for (const i of active) if (i.realizationDate) set.add(i.realizationDate.slice(0, 7));
  const months = [...set].sort();
  return [
    { value: "all", label: "Všechny měsíce" },
    ...months.map((m) => {
      const sum = sumPrices(
        active.filter((i) => (typeId === ALL || i.typeId === typeId) && i.realizationDate && i.realizationDate.slice(0, 7) === m),
      );
      return { value: m, label: monLab(m) + (sum ? " · " + kcs(sum) : ""), value2: sum };
    }),
    { value: "none", label: "Bez termínu" },
  ];
}

/** Red total box label: `Celkem` / `Celkem bez termínu` / `Celkem za Říjen 2026`. */
export function printTotalLabel(month: MonthFilter): string {
  if (!month || month === "all") return "Celkem";
  if (month === "none") return "Celkem bez termínu";
  return "Celkem za " + monLab(month);
}

/** Default category for a new task: first category of the active group, else „Celý klub". */
export function defaultTaskCategory(group: string): string {
  return group !== ALL && GROUPS[group]?.length ? GROUPS[group][0] : "Celý klub";
}
