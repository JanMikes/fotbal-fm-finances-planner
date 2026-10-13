/** Yearly print report aggregation (prototype §9.6 `openYear`). Used by the API and usable client-side. */
import { MNAMES, MONTH_ABBR } from "./constants";
import type { PrintItem, PrintType, PrintYearClosure } from "./types";

export interface ReportMonth {
  /** 1..12 */
  month: number;
  /** „Leden" */
  name: string;
  /** „Led" … unique („Čvn"/„Čvc") */
  abbr: string;
  /** "YYYY-MM" */
  key: string;
  items: PrintItem[];
  /** Σ price */
  sum: number;
  /** Σ price of paid items */
  paid: number;
  /** sum − paid */
  owed: number;
}

export interface ReportType {
  typeId: string | null;
  /** type name, "—" when unknown */
  name: string;
  sum: number;
  count: number;
  quantity: number;
}

export interface YearReport {
  year: number;
  /** Years with any dated item ∪ current year, DESC. */
  years: number[];
  closedAt: string | null;
  /** Number of items (archived + active) with a realization date in the year. */
  itemCount: number;
  total: number;
  paid: number;
  owed: number;
  quantity: number;
  /** round(paid / total × 100), 0 when total is 0 */
  paidPct: number;
  owedPct: number;
  months: ReportMonth[];
  /** max(1, …month sums) — chart scale */
  maxMonth: number;
  activeMonths: number;
  /** round(total / activeMonths) or 0 */
  avgPerActiveMonth: number;
  /** first month with the highest sum, or null when nothing was spent */
  topMonth: { name: string; sum: number } | null;
  /** sorted by sum DESC */
  types: ReportType[];
  maxType: number;
  /** Non-archived items without a realization date (global, not per year). */
  noDateCount: number;
}

export function buildYearReport(args: {
  items: readonly PrintItem[];
  types: readonly PrintType[];
  closures: readonly PrintYearClosure[];
  year: number;
  now?: Date;
}): YearReport {
  const { items, types, closures, year } = args;
  const now = args.now ?? new Date();
  const currentYear = now.getFullYear();
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const bySort = (a: PrintItem, b: PrintItem) => a.sortOrder - b.sortOrder;

  const years = [...new Set([...items.filter((i) => i.realizationDate).map((i) => Number(i.realizationDate!.slice(0, 4))), currentYear])].sort(
    (a, b) => b - a,
  );
  const its = items.filter((i) => i.realizationDate && Number(i.realizationDate.slice(0, 4)) === year).sort(bySort);
  const noDateCount = items.filter((i) => !i.realizationDate && !i.archived).length;
  const price = (i: PrintItem) => i.price || 0;

  const total = its.reduce((s, i) => s + price(i), 0);
  const paid = its.filter((i) => i.paidByClub).reduce((s, i) => s + price(i), 0);
  const owed = total - paid;
  const quantity = its.reduce((s, i) => s + (i.quantity || 0), 0);

  const months: ReportMonth[] = MNAMES.map((name, idx) => {
    const key = `${year}-${String(idx + 1).padStart(2, "0")}`;
    const l = its.filter((i) => i.realizationDate!.slice(0, 7) === key);
    const sum = l.reduce((s, i) => s + price(i), 0);
    const p = l.filter((i) => i.paidByClub).reduce((s, i) => s + price(i), 0);
    return { month: idx + 1, name, abbr: MONTH_ABBR[idx], key, items: l, sum, paid: p, owed: sum - p };
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.sum));
  const activeMonths = months.filter((m) => m.sum > 0).length;
  const top = months.reduce((a, m) => (m.sum > a.sum ? m : a), months[0]);

  const typeMap = new Map<string, ReportType>();
  for (const i of its) {
    const name = typeName.get(i.typeId) ?? "—";
    const key = typeName.has(i.typeId) ? i.typeId : "—";
    const t = typeMap.get(key) ?? { typeId: typeName.has(i.typeId) ? i.typeId : null, name, sum: 0, count: 0, quantity: 0 };
    t.sum += price(i);
    t.count += 1;
    t.quantity += i.quantity || 0;
    typeMap.set(key, t);
  }
  const typeList = [...typeMap.values()].sort((a, b) => b.sum - a.sum);
  const paidPct = total ? Math.round((paid / total) * 100) : 0;

  return {
    year,
    years,
    closedAt: closures.find((c) => c.year === year)?.closedAt ?? null,
    itemCount: its.length,
    total,
    paid,
    owed,
    quantity,
    paidPct,
    owedPct: total ? 100 - paidPct : 0,
    months,
    maxMonth,
    activeMonths,
    avgPerActiveMonth: activeMonths ? Math.round(total / activeMonths) : 0,
    topMonth: top.sum ? { name: top.name, sum: top.sum } : null,
    types: typeList,
    maxType: Math.max(1, ...typeList.map((t) => t.sum)),
    noDateCount,
  };
}
