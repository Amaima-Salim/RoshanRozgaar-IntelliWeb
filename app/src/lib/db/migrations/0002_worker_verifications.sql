CREATE TYPE "public"."verification_status" AS ENUM('demo_verified', 'mismatch', 'not_found');--> statement-breakpoint
CREATE TABLE "worker_verifications" (
	"worker_id" uuid PRIMARY KEY NOT NULL,
	"cnic_hash" text NOT NULL,
	"cnic_masked" text NOT NULL,
	"full_name" text NOT NULL,
	"father_name" text,
	"date_of_birth" text NOT NULL,
	"date_of_expiry" text,
	"front_media_id" uuid,
	"back_media_id" uuid,
	"ocr_source" text NOT NULL,
	"ocr_draft" jsonb,
	"status" "verification_status" NOT NULL,
	"nadra_provider" text DEFAULT 'demo' NOT NULL,
	"nadra_result" jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_verifications_cnic_hash_unique" UNIQUE("cnic_hash"),
	CONSTRAINT "worker_verifications_ocr_source" CHECK ("worker_verifications"."ocr_source" IN ('ai', 'fixtures', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "worker_verifications" ADD CONSTRAINT "worker_verifications_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_verifications" ADD CONSTRAINT "worker_verifications_front_media_id_media_id_fk" FOREIGN KEY ("front_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_verifications" ADD CONSTRAINT "worker_verifications_back_media_id_media_id_fk" FOREIGN KEY ("back_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;