-- installment_from NULL = "no installment deducted yet" (no day-one −7 500 Kč on a fresh install).
-- The 0001 seed stored the go-live month; clear it while the budget is still untouched (Spolek/AS 0, default
-- installment). The app sets the month (Europe/Prague) when a non-zero installment is first saved, and the
-- "od [měsíc]" input can set it explicitly. Any explicitly edited budget is left as is. Idempotent.
ALTER TABLE "budget" ALTER COLUMN "installment_from" DROP DEFAULT;
--> statement-breakpoint
UPDATE "budget"
SET "installment_from" = NULL
WHERE "id" = 1 AND "spolek" = 0 AND "as_amount" = 0 AND "monthly_installment" = 7500 AND "installment_from" IS NOT NULL;
