import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Budget } from "@/lib/types";
import { getDb } from "../db/client";
import { budget } from "../db/schema";
import { MAX_YEAR, MIN_YEAR, zMoney, type Ctx } from "../http";
import { notify } from "../notify";
import { currentMonthStart } from "../time";
import { mapBudget } from "./mappers";

export { currentMonthStart };

const zMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/, "Měsíc ve formátu YYYY-MM.")
  .refine((s) => {
    const y = Number(s.slice(0, 4));
    return y >= MIN_YEAR && y <= MAX_YEAR;
  }, `Měsíc musí být mezi roky ${MIN_YEAR} a ${MAX_YEAR}.`)
  .transform((s) => `${s.slice(0, 7)}-01`);

export const budgetSchema = z
  .object({
    spolek: zMoney.optional(),
    asAmount: zMoney.optional(),
    monthlyInstallment: zMoney.optional(),
    installmentFrom: zMonth.nullable().optional(),
  })
  .strict();

export async function getBudget(): Promise<Budget> {
  const [row] = await getDb().select().from(budget).where(eq(budget.id, 1));
  return mapBudget(row);
}

/**
 * Partial update of the singleton (only the provided fields change). `installmentFrom: null` means "no deduction
 * yet". When a non-zero `monthlyInstallment` is SAVED (present in the request) while no start month is stored and
 * none is provided, installmentFrom is set to the current month in Europe/Prague (DECISIONS #2). An explicitly
 * provided installmentFrom (a month or null) always wins; saving other fields never sets it.
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
    const savedInstallment = patch.monthlyInstallment;
    if (savedInstallment !== undefined && savedInstallment > 0 && !current.installmentFrom && input.installmentFrom === undefined) {
      patch.installmentFrom = currentMonthStart();
    }
    const [row] = Object.keys(patch).length
      ? await tx.update(budget).set(patch).where(eq(budget.id, 1)).returning()
      : [current];
    await notify(tx, ctx, "budget", "update", 1);
    return mapBudget(row);
  });
}
