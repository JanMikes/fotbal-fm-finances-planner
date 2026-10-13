/** „Aktuální budget" box view-model (prototype §10.2 `cbRender`, DECISIONS #2). Pure. */
import type { BudgetInput } from "@/lib/api";
import { computeBudget } from "@/lib/budget";
import { monthKey, NBSP, parseDigitsOrZero, signedKc } from "@/lib/format";
import type { Budget, OrgNode } from "@/lib/types";

export type BudgetField = "spolek" | "asAmount" | "monthlyInstallment";

/** Typed values not saved yet (amount or raw text; null = emptied) override the stored numbers in the live computation. */
export type BudgetDraftValue = number | string | null;
export type BudgetDraft = Partial<Record<BudgetField, BudgetDraftValue>>;

export function applyDraft(budget: Budget, draft: BudgetDraft): Budget {
  const b = { ...budget };
  for (const k of Object.keys(draft) as BudgetField[]) {
    const v = draft[k];
    if (v !== undefined) b[k] = parseDigitsOrZero(v);
  }
  return b;
}

export interface BudgetView {
  sum: string;
  green: string;
  left: string;
  negative: boolean;
  months: number;
}

export function budgetView(budget: Budget, nodes: readonly OrgNode[], now: Date = new Date()): BudgetView {
  const s = computeBudget(budget, nodes, now);
  return { sum: signedKc(s.total), green: "−" + NBSP + signedKc(s.green), left: signedKc(s.left), negative: s.left < 0, months: s.months };
}

/**
 * PUT /api/budget payload for an edited input (a parsed amount, or raw text → digits only; empty = 0). The first non-zero installment also sets
 * `installmentFrom` to the current month when none is set yet (DECISIONS #2 — the server does the same,
 * sending it makes the optimistic state correct immediately).
 */
export function budgetPatch(field: BudgetField, input: BudgetDraftValue, budget: Budget, now: Date = new Date()): BudgetInput {
  const value = parseDigitsOrZero(input);
  const patch: BudgetInput = { [field]: value };
  if (field === "monthlyInstallment" && value > 0 && !budget.installmentFrom) patch.installmentFrom = monthKey(now);
  return patch;
}

/** MonthInput value ("YYYY-MM" | "") for the stored "YYYY-MM-01". */
export function monthInputValue(installmentFrom: string | null): string {
  return installmentFrom ? installmentFrom.slice(0, 7) : "";
}
