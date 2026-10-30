CREATE TABLE "print_incomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount" integer,
	"paid_date" date,
	"payer" text DEFAULT 'spolek' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_incomes_payer_check" CHECK ("print_incomes"."payer" in ('spolek','as'))
);
--> statement-breakpoint
ALTER TABLE "print_incomes" ADD CONSTRAINT "print_incomes_created_by_org_nodes_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_nodes"("id") ON DELETE set null ON UPDATE no action;