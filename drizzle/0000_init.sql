CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_kind" text NOT NULL,
	"parent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"url" text,
	"storage_key" text,
	"size_bytes" bigint,
	"mime" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_parent_kind_check" CHECK ("attachments"."parent_kind" in ('task','print')),
	CONSTRAINT "attachments_kind_check" CHECK ("attachments"."kind" in ('file','link'))
);
--> statement-breakpoint
CREATE TABLE "board_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" numeric DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"spolek" integer DEFAULT 0 NOT NULL,
	"as_amount" integer DEFAULT 0 NOT NULL,
	"monthly_installment" integer DEFAULT 7500 NOT NULL,
	"installment_from" date,
	CONSTRAINT "budget_singleton" CHECK ("budget"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "org_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"info" text,
	"budget" integer,
	"budget_color" text DEFAULT 'blue' NOT NULL,
	"avatar_color" text,
	"areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"color" text,
	"parent_id" uuid,
	"sort_order" numeric DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_nodes_kind_check" CHECK ("org_nodes"."kind" in ('person','unit')),
	CONSTRAINT "org_nodes_budget_color_check" CHECK ("org_nodes"."budget_color" in ('blue','green','red')),
	CONSTRAINT "org_nodes_not_own_parent" CHECK ("org_nodes"."parent_id" is null or "org_nodes"."parent_id" <> "org_nodes"."id")
);
--> statement-breakpoint
CREATE TABLE "print_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"column_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"quantity" integer,
	"price" integer,
	"paid_by_club" boolean DEFAULT false NOT NULL,
	"realization_date" date,
	"archived" boolean DEFAULT false NOT NULL,
	"sort_order" numeric DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" numeric DEFAULT 0 NOT NULL,
	CONSTRAINT "print_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "print_year_closures" (
	"year" integer PRIMARY KEY NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"column_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"lead_id" uuid,
	"owner_id" uuid,
	"due_date" date,
	"sort_order" numeric DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_nodes" ADD CONSTRAINT "org_nodes_parent_id_org_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."org_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_items" ADD CONSTRAINT "print_items_column_id_board_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."board_columns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_items" ADD CONSTRAINT "print_items_type_id_print_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."print_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_items" ADD CONSTRAINT "print_items_created_by_org_nodes_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_board_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."board_columns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_org_nodes_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."org_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_org_nodes_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."org_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_org_nodes_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_parent_idx" ON "attachments" USING btree ("parent_kind","parent_id");--> statement-breakpoint
CREATE INDEX "board_columns_board_idx" ON "board_columns" USING btree ("board_id","sort_order");--> statement-breakpoint
CREATE INDEX "org_nodes_parent_idx" ON "org_nodes" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "print_items_column_idx" ON "print_items" USING btree ("column_id","sort_order");--> statement-breakpoint
CREATE INDEX "tasks_column_idx" ON "tasks" USING btree ("column_id","sort_order");