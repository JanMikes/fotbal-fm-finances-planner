import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Budget } from "@/lib/types";
import { getDb } from "../db/client";
import { budget } from "../db/schema";
import { zMoney, type Ctx } from "../http";
import { notify } from "../notify";
import { mapBudget } from "./mappers";

const zMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/, "Měsíc ve formátu YYYY-MM.")
  .transform((s) => `${s.slice(0, 7)}-01`);

export const budgetSchema = z
  .object({
    spolek: zMoney.optional(),
    asAmount: zMoney.optional(),
    monthlyInstallment: zMoney.optional(),
    installmentFrom: zMonth.nullable().optional(),
  })
  .strict();

/** Current month (Europe/Prague) as "YYYY-MM-01". */
export function currentMonthStart(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}-01`;
}

export async function getBudget(): Promise<Budget> {
  const [row] = await getDb().select().from(budget).where(eq(budget.id, 1));
  return mapBudget(row);
}

/**
 * Partial update of the singleton. When a non-zero installment is saved and no start month is set (and none is
 * provided), installmentFrom is set to the current month (prototype behaviour, DECISIONS #2).
 */
export async function updateBudget(input: z.infer<typeof budgetSchema>, ctx: Ctx): Promise<Budget> {
  return getDb().transaction(async (tx) => {
    await tx.insert(budget).values({ id: 1 }).onConflictDoNothing();
    const [current] = await tx.select().from(budget).where(eq(budget.id, 1)).for("update");
    const patch: Partial<typeof budget.$inferInsert> = {};
    if (input.spolek !== undefined) patch.spolek = input.spolek ?? 0;
    if (input.asAmount !== undefined) patch.asAmount = input.asAmount ?? 0;
    if (input.monthlyInstallment !== undefined) patch.monthlyInstallment = input.monthlyInstallment ?? 0;
    if (input.installmentFrom !== undefined) patch.installmentFrom = input.installmentFrom;
    const installment = patch.monthlyInstallment ?? current.monthlyInstallment;
    const from = patch.installmentFrom !== undefined ? patch.installmentFrom : current.installmentFrom;
    if (installment > 0 && !from && input.installmentFrom === undefined) patch.installmentFrom = currentMonthStart();
    const [row] = Object.keys(patch).length
      ? await tx.update(budget).set(patch).where(eq(budget.id, 1)).returning()
      : [current];
    await notify(tx, ctx, "budget", "update", 1);
    return mapBudget(row);
  });
}
