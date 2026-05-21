CREATE TABLE "notification_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"routine_id" uuid,
	"habit_id" uuid,
	"time" text NOT NULL,
	"weekdays" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_schedules_subject_xor_check" CHECK ((
        ("notification_schedules"."routine_id" IS NOT NULL AND "notification_schedules"."habit_id" IS NULL)
        OR
        ("notification_schedules"."routine_id" IS NULL AND "notification_schedules"."habit_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_schedules_user_id_idx" ON "notification_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_schedules_routine_id_idx" ON "notification_schedules" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "notification_schedules_habit_id_idx" ON "notification_schedules" USING btree ("habit_id");--> statement-breakpoint
CREATE INDEX "notification_schedules_enabled_idx" ON "notification_schedules" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");