CREATE TABLE "routine_day_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"position" smallint NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_step_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "routine_day_steps" ADD CONSTRAINT "routine_day_steps_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_step_completions" ADD CONSTRAINT "routine_step_completions_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_step_completions" ADD CONSTRAINT "routine_step_completions_step_id_routine_day_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."routine_day_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_step_completions" ADD CONSTRAINT "routine_step_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routine_day_steps_routine_weekday_idx" ON "routine_day_steps" USING btree ("routine_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_day_steps_routine_weekday_position_unique" ON "routine_day_steps" USING btree ("routine_id","weekday","position");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_step_completions_step_user_date_unique" ON "routine_step_completions" USING btree ("step_id","user_id","date");--> statement-breakpoint
CREATE INDEX "routine_step_completions_routine_date_idx" ON "routine_step_completions" USING btree ("routine_id","date");--> statement-breakpoint
CREATE INDEX "routines_owner_user_id_idx" ON "routines" USING btree ("owner_user_id");