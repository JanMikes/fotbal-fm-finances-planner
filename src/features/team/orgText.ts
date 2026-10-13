/** Czech labels, colours and option lists of the org tree and the member / unit forms (pure, unit-tested). */
import { kcs, plural, pluralize } from "@/lib/format";
import type { SelectGroup, SelectOption } from "@/components/ui";
import type { BudgetColor, OrgNode } from "@/lib/types";

/** Person card: „3 úkoly" (open tasks the person is responsible for) — the number is rendered separately in `<b>`. */
export const taskWord = (n: number): string => plural(n, "úkol", "úkoly", "úkolů");

/** Unit card: „2 členové" (persons below the unit). */
export const memberWord = (n: number): string => plural(n, "člen", "členové", "členů");

/** Member form footer: „1 přiřazený úkol", „3 přiřazené úkoly", „0 přiřazených úkolů" (all columns). */
export function assignedTasksLabel(n: number): string {
  return pluralize(n, "přiřazený úkol", "přiřazené úkoly", "přiřazených úkolů");
}

/** Tooltip of the person stats row: „Řeší 3 rozpracované úkoly, vede 1 rozpracovaný úkol". */
export function personStatsTitle(act: number, lead: number): string {
  const open = (n: number) => pluralize(n, "rozpracovaný úkol", "rozpracované úkoly", "rozpracovaných úkolů");
  return `Řeší ${open(act)}, vede ${open(lead)}`;
}

/** Tooltip of the budget flag on a person card: „Budget 25 000 Kč — v budgetu". */
export function budgetFlagTitle(budget: number, color: BudgetColor): string {
  const state = color === "green" ? "v budgetu" : color === "red" ? "na dluh" : "budoucnost";
  return `Budget ${kcs(budget)} — ${state}`;
}

/**
 * Text colour of a unit card for its background: `lt` = navy text (light colours and the bright brand blue, where
 * white is below 4.5:1), `warm` = plain white (mid-tone colours where the light-blue secondary text would fail),
 * "" = default (light-blue secondary text on dark blues).
 */
const NAVY_TEXT = new Set(["#c4c8ce", "#4fbde4", "#d98a00", "#0099cf"]);
const WHITE_TEXT = new Set(["#63666b", "#c62f28", "#1f8a4c", "#6b4fa8"]);
export function unitInk(color: string | null | undefined): "lt" | "warm" | "" {
  const c = (color ?? "").trim().toLowerCase();
  if (NAVY_TEXT.has(c)) return "lt";
  if (WHITE_TEXT.has(c)) return "warm";
  return "";
}

/**
 * Background of a unit card. The palette green (#1f8a4c) carries white text at only 4.38:1, so cards use a slightly
 * deeper shade (5.38:1); every other colour is used as picked.
 */
export function unitBackground(color: string): string {
  return color.trim().toLowerCase() === "#1f8a4c" ? "#1a7a42" : color;
}

/** Nadřízený / Zařazení options: the empty option, then the groups „Kategorie" and „Členové" (role as meta + search keyword). */
export function parentSelectOptions(emptyLabel: string, options: { units: OrgNode[]; persons: OrgNode[] }): Array<SelectOption | SelectGroup> {
  const out: Array<SelectOption | SelectGroup> = [{ value: "", label: emptyLabel }];
  if (options.units.length) out.push({ label: "Kategorie", options: options.units.map((n) => ({ value: n.id, label: n.name })) });
  if (options.persons.length) {
    out.push({
      label: "Členové",
      options: options.persons.map((n) => ({ value: n.id, label: n.name, meta: n.role ?? undefined, keywords: n.role ?? undefined })),
    });
  }
  return out;
}
