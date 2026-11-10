-- Hand-written constraints Drizzle can't express (docs/02 §3). Committed and reviewed by hand.
-- The database, not application code, is the final arbiter of these invariants.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- BR-P4 / PRD-O4: a worker can never hold two live jobs with overlapping windows.
-- tstzrange is half-open [start, end), so back-to-back jobs are allowed.
ALTER TABLE jobs ADD CONSTRAINT jobs_no_overlap
  EXCLUDE USING gist (worker_id WITH =, tstzrange(start_at, end_at) WITH &&)
  WHERE (status IN ('confirmed', 'in_progress'));
--> statement-breakpoint
-- One request produces at most one booking.
CREATE UNIQUE INDEX jobs_one_live_per_request ON jobs (request_id)
  WHERE status IN ('confirmed', 'in_progress', 'completed');
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_time_order CHECK (end_at > start_at);
--> statement-breakpoint
-- docs/06 §4: at most one pending and one successful payment per job.
CREATE UNIQUE INDEX payments_one_pending ON payments (job_id) WHERE status = 'pending';
--> statement-breakpoint
CREATE UNIQUE INDEX payments_one_success ON payments (job_id)
  WHERE status IN ('succeeded', 'cash_confirmed');
