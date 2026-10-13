-- Structural defaults (DECISIONS.md "Production starts empty"). Idempotent: safe to re-run.
INSERT INTO "boards" ("id") VALUES ('tasks'), ('print') ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "board_columns" ("board_id", "title", "sort_order")
SELECT 'tasks', v.title, v.ord
FROM (VALUES ('Nápady', 1), ('K řešení', 2), ('Probíhá', 3), ('Ke kontrole', 4), ('Hotovo', 5)) AS v(title, ord)
WHERE NOT EXISTS (SELECT 1 FROM "board_columns" WHERE "board_id" = 'tasks');
--> statement-breakpoint
INSERT INTO "board_columns" ("board_id", "title", "sort_order")
SELECT 'print', v.title, v.ord
FROM (VALUES ('Poptávka', 1), ('Ve výrobě', 2), ('Hotovo', 3)) AS v(title, ord)
WHERE NOT EXISTS (SELECT 1 FROM "board_columns" WHERE "board_id" = 'print');
--> statement-breakpoint
INSERT INTO "print_types" ("name", "sort_order")
SELECT v.name, v.ord
FROM (VALUES ('Letáky', 1), ('Vizitky', 2), ('Plakáty', 3), ('Bannery', 4), ('Roll-upy', 5), ('Samolepky', 6), ('Brožury', 7)) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM "print_types");
--> statement-breakpoint
-- Budget singleton 0 / 0 / 7500; the installment is counted from the go-live month (prototype behaviour).
INSERT INTO "budget" ("id", "spolek", "as_amount", "monthly_installment", "installment_from")
VALUES (1, 0, 0, 7500, date_trunc('month', now() AT TIME ZONE 'Europe/Prague')::date)
ON CONFLICT ("id") DO NOTHING;
