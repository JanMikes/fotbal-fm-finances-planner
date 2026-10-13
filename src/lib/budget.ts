/** „Aktuální budget" computation (prototype §10.2 `cbRender`). */
import type { Budget, OrgNode } from "./types";

/** Months from `from` ("YYYY-MM" or "YYYY-MM-DD") to now, inclusive of the current month; 0 when unset or in the future. */
export function monthsSince(from: string | null | undefined, now: Date = new Date()): number {
  if (!from) return 0;
  const [y, m] = from.split("-").map(Number);
  if (!y || !m) return 0;
  return Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) + 1);
}

export interface BudgetSummary {
  /** Spolek + AS */
  total: number;
  /** Σ budgets of persons with budget colour green („V budgetu") */
  green: number;
  /** monthly installment × months since installmentFrom */
  installments: number;
  /** Zbývá = total − green − installments (may be negative) */
  left: number;
  months: number;
}

export function computeBudget(budget: Budget, nodes: readonly OrgNode[], now: Date = new Date()): BudgetSummary {
  const total = (budget.spolek || 0) + (budget.asAmount || 0);
  const green = nodes
    .filter((n) => n.kind === "person" && n.budgetColor === "green")
    .reduce((s, n) => s + (n.budget || 0), 0);
  const months = monthsSince(budget.installmentFrom, now);
  const installments = (budget.monthlyInstallment || 0) * months;
  return { total, green, installments, left: total - green - installments, months };
}
