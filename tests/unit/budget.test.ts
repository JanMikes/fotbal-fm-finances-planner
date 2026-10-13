import { describe, expect, it } from "vitest";
import { computeBudget, monthsSince } from "@/lib/budget";
import { person, unit } from "./fixtures";

const now = new Date(2026, 9, 13);

describe("budget", () => {
  it("monthsSince is inclusive of the current month", () => {
    expect(monthsSince("2026-10", now)).toBe(1);
    expect(monthsSince("2026-10-01", now)).toBe(1);
    expect(monthsSince("2026-07-01", now)).toBe(4);
    expect(monthsSince("2025-10", now)).toBe(13);
    expect(monthsSince("2026-12", now)).toBe(0);
    expect(monthsSince(null, now)).toBe(0);
    expect(monthsSince("", now)).toBe(0);
  });

  it("Zbývá = Spolek + AS − green budgets − installment × months", () => {
    const nodes = [
      person({ budget: 25000, budgetColor: "green" }),
      person({ budget: 10000, budgetColor: "red" }),
      person({ budget: 5000, budgetColor: "blue" }),
      person({ budget: 3000, budgetColor: "green" }),
      unit({ budget: 99999, budgetColor: "green" }),
    ];
    const r = computeBudget({ spolek: 100000, asAmount: 20000, monthlyInstallment: 7500, installmentFrom: "2026-08-01" }, nodes, now);
    expect(r).toEqual({ total: 120000, green: 28000, installments: 22500, left: 69500, months: 3 });
  });

  it("can go negative", () => {
    const r = computeBudget({ spolek: 0, asAmount: 0, monthlyInstallment: 7500, installmentFrom: "2026-10-01" }, [], now);
    expect(r.left).toBe(-7500);
  });
});
