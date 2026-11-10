/**
 * Database schema (docs/02 §3). Every table is defined here, including the ones
 * later phases fill, so constraints exist from day one.
 *
 * Better Auth tables (users, sessions, accounts, verifications, rate_limits) use
 * the property names Better Auth expects; columns are snake_case.
 * Constraints Drizzle can't express (exclusion, partial unique indexes) live in
 * the hand-written migration `0001_constraints.sql`.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const isSeeded = () => boolean("is_seeded").notNull().default(false);
const tstz = (name: string) => timestamp(name, { withTimezone: true });

// ── Enums ────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("user_role", ["worker", "customer"]);
export const languageEnum = pgEnum("language", ["ur", "en"]);
export const tradeEnum = pgEnum("trade", [
  "electrician",
  "plumber",
  "ac_technician",
  "carpenter",
  "mechanic",
]);
export const rateBasisEnum = pgEnum("rate_basis", ["per_visit", "per_hour", "per_job"]);
export const onboardingStatusEnum = pgEnum("onboarding_status", ["in_progress", "complete"]);
export const requestSourceEnum = pgEnum("request_source", ["voice", "text", "tap", "photo"]);
export const urgencyEnum = pgEnum("urgency", ["now", "today", "scheduled"]);
export const requestStatusEnum = pgEnum("request_status", [
  "open",
  "booked",
  "cancelled",
  "expired",
]);
export const conversationStatusEnum = pgEnum("conversation_status", [
  "open",
  "declined",
  "booked",
  "closed",
]);
export const messageKindEnum = pgEnum("message_kind", ["text", "voice", "offer", "system"]);
export const offerStatusEnum = pgEnum("offer_status", [
  "pending",
  "accepted",
  "countered",
  "declined",
  "withdrawn",
  "expired",
]);
export const jobStatusEnum = pgEnum("job_status", [
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
]);
export const paymentProviderEnum = pgEnum("payment_provider", [
  "jazzcash",
  "easypaisa",
  "cash",
  "mock",
]);
export const paymentModeEnum = pgEnum("payment_mode", ["sandbox", "mock", "cash"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "created",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "cash_reported_worker",
  "cash_reported_customer",
  "cash_confirmed",
]);
export const verificationStatusEnum = pgEnum("verification_status", [
  "demo_verified",
  "mismatch",
  "not_found",
]);
export const mediaKindEnum = pgEnum("media_kind", ["audio", "image"]);

// ── Better Auth ──────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // App fields (Better Auth additionalFields, input:false where clients must not set them)
  role: roleEnum("role"),
  // Urdu display name shown beside `name` on worker cards (docs/03 §4); DECISIONS.md D-34.
  nameUr: text("name_ur"),
  phone: text("phone").unique(),
  language: languageEnum("language").notNull().default("ur"),
  isSeeded: isSeeded(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    expiresAt: tstz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tstz("access_token_expires_at"),
    refreshTokenExpiresAt: tstz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** Better Auth rate-limit storage in the DB, so limits hold across serverless instances. */
export const rateLimits = pgTable("rate_limits", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ── Places and workers ───────────────────────────────────────────────────────
export const areas = pgTable("areas", {
  slug: text("slug").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameUr: text("name_ur").notNull(),
  city: text("city").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  isApproximate: boolean("is_approximate").notNull().default(true),
});

export const media = pgTable(
  "media",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: mediaKindEnum("kind").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationMs: integer("duration_ms"),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "media_size_cap",
      sql`(${t.kind} = 'audio' AND ${t.sizeBytes} <= 2097152 AND coalesce(${t.durationMs}, 0) <= 60000)
        OR (${t.kind} = 'image' AND ${t.sizeBytes} <= 1048576)`,
    ),
  ],
);

export const workerProfiles = pgTable(
  "worker_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    trade: tradeEnum("trade"),
    yearsExperience: smallint("years_experience"),
    indicativeRatePkr: integer("indicative_rate_pkr"),
    rateBasis: rateBasisEnum("rate_basis"),
    areaSlugs: text("area_slugs")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    baseLat: doublePrecision("base_lat"),
    baseLng: doublePrecision("base_lng"),
    isAvailable: boolean("is_available").notNull().default(false),
    onboardingStatus: onboardingStatusEnum("onboarding_status").notNull().default("in_progress"),
    photoMediaId: uuid("photo_media_id").references(() => media.id, { onDelete: "set null" }),
    profileSummaryUr: text("profile_summary_ur"),
    profileSummaryEn: text("profile_summary_en"),
    isSeeded: isSeeded(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "worker_years_range",
      sql`${t.yearsExperience} IS NULL OR ${t.yearsExperience} BETWEEN 0 AND 60`,
    ),
    check(
      "worker_rate_positive",
      sql`${t.indicativeRatePkr} IS NULL OR ${t.indicativeRatePkr} > 0`,
    ),
    // A profile can't be marked complete while a required field is missing (PRD-O1 "complete profile").
    check(
      "worker_complete_has_fields",
      sql`${t.onboardingStatus} <> 'complete' OR (${t.trade} IS NOT NULL AND ${t.yearsExperience} IS NOT NULL
        AND ${t.indicativeRatePkr} IS NOT NULL AND ${t.rateBasis} IS NOT NULL AND cardinality(${t.areaSlugs}) > 0)`,
    ),
    index("worker_profiles_trade_idx").on(t.trade),
  ],
);

/**
 * Worker identity-document check. DEMO ONLY: the NADRA step is an in-repo stand-in, so
 * `demo_verified` means "matched the demo registry", never a real NADRA confirmation.
 * The full CNIC number is not stored: only a keyed hash (duplicate detection) and a masked form.
 */
export const workerVerifications = pgTable(
  "worker_verifications",
  {
    workerId: uuid("worker_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    cnicHash: text("cnic_hash").notNull(),
    cnicMasked: text("cnic_masked").notNull(),
    fullName: text("full_name").notNull(),
    fatherName: text("father_name"),
    dateOfBirth: text("date_of_birth").notNull(),
    dateOfExpiry: text("date_of_expiry"),
    frontMediaId: uuid("front_media_id").references(() => media.id, { onDelete: "set null" }),
    backMediaId: uuid("back_media_id").references(() => media.id, { onDelete: "set null" }),
    ocrSource: text("ocr_source").notNull(), // "ai" | "fixtures" | "manual"
    ocrDraft: jsonb("ocr_draft"),
    status: verificationStatusEnum("status").notNull(),
    nadraProvider: text("nadra_provider").notNull().default("demo"),
    nadraResult: jsonb("nadra_result").notNull(),
    checkedAt: tstz("checked_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One identity document, one account.
    unique("worker_verifications_cnic_hash_unique").on(t.cnicHash),
    check("worker_verifications_ocr_source", sql`${t.ocrSource} IN ('ai', 'fixtures', 'manual')`),
  ],
);

export const workerSchedule = pgTable(
  "worker_schedule",
  {
    id: id(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
    isSeeded: isSeeded(),
  },
  (t) => [
    check("schedule_weekday_range", sql`${t.weekday} BETWEEN 0 AND 6`),
    check("schedule_minutes_range", sql`${t.startMin} >= 0 AND ${t.endMin} <= 1440`),
    check("schedule_start_before_end", sql`${t.startMin} < ${t.endMin}`),
    index("worker_schedule_worker_idx").on(t.workerId, t.weekday),
  ],
);

// ── Requests, conversations, offers ─────────────────────────────────────────
export const requests = pgTable(
  "requests",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trade: tradeEnum("trade").notNull(),
    summaryText: text("summary_text"),
    summaryLang: languageEnum("summary_lang"),
    source: requestSourceEnum("source").notNull(),
    photoMediaId: uuid("photo_media_id").references(() => media.id, { onDelete: "set null" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    areaSlug: text("area_slug")
      .notNull()
      .references(() => areas.slug),
    addressText: text("address_text"),
    startAt: tstz("start_at").notNull(),
    durationMin: integer("duration_min").notNull().default(120),
    urgency: urgencyEnum("urgency").notNull(),
    budgetPkr: integer("budget_pkr"),
    status: requestStatusEnum("status").notNull().default("open"),
    version: integer("version").notNull().default(1),
    isSeeded: isSeeded(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("request_duration_range", sql`${t.durationMin} BETWEEN 15 AND 720`),
    check("request_budget_positive", sql`${t.budgetPkr} IS NULL OR ${t.budgetPkr} > 0`),
    index("requests_customer_idx").on(t.customerId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: conversationStatusEnum("status").notNull().default("open"),
    isSeeded: isSeeded(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("conversations_request_worker_uq").on(t.requestId, t.workerId)],
);

export const offers = pgTable(
  "offers",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    proposerId: uuid("proposer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pricePkr: integer("price_pkr").notNull(),
    startAt: tstz("start_at").notNull(),
    durationMin: integer("duration_min").notNull(),
    noteText: text("note_text"),
    status: offerStatusEnum("status").notNull().default("pending"),
    respondedAt: tstz("responded_at"),
    isSeeded: isSeeded(),
    createdAt: createdAt(),
  },
  (t) => [
    check("offer_price_positive", sql`${t.pricePkr} > 0`),
    check("offer_duration_range", sql`${t.durationMin} BETWEEN 15 AND 720`),
    index("offers_conversation_idx").on(t.conversationId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    kind: messageKindEnum("kind").notNull(),
    bodyText: text("body_text"),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    transcriptText: text("transcript_text"),
    transcriptLang: languageEnum("transcript_lang"),
    translatedText: text("translated_text"),
    translatedLang: languageEnum("translated_lang"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),
    clientMsgId: text("client_msg_id").notNull(),
    isSeeded: isSeeded(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("messages_client_msg_uq").on(t.conversationId, t.clientMsgId),
    index("messages_conversation_seq_idx").on(t.conversationId, t.seq),
  ],
);

// ── Jobs ─────────────────────────────────────────────────────────────────────
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id),
    pricePkr: integer("price_pkr").notNull(),
    startAt: tstz("start_at").notNull(),
    endAt: tstz("end_at").notNull(),
    status: jobStatusEnum("status").notNull().default("confirmed"),
    version: integer("version").notNull().default(1),
    startedAt: tstz("started_at"),
    completionRequestedAt: tstz("completion_requested_at"),
    completedAt: tstz("completed_at"),
    cancelledAt: tstz("cancelled_at"),
    cancelReason: text("cancel_reason"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    isSeeded: isSeeded(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("job_price_positive", sql`${t.pricePkr} > 0`),
    index("jobs_worker_idx").on(t.workerId, t.status),
    index("jobs_customer_idx").on(t.customerId),
    // jobs_no_overlap, jobs_one_live_per_request, jobs_time_order: see 0001_constraints.sql
  ],
);

export const jobEvents = pgTable(
  "job_events",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fromStatus: jobStatusEnum("from_status"),
    toStatus: jobStatusEnum("to_status").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    reason: text("reason"),
    at: tstz("at").notNull().defaultNow(),
  },
  (t) => [index("job_events_job_idx").on(t.jobId)],
);

// ── Trust ────────────────────────────────────────────────────────────────────
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id),
    stars: smallint("stars").notNull(),
    sigOnTime: smallint("sig_on_time"),
    sigQuality: smallint("sig_quality"),
    sigFairPrice: smallint("sig_fair_price"),
    sigRespectful: smallint("sig_respectful"),
    voiceMediaId: uuid("voice_media_id").references(() => media.id, { onDelete: "set null" }),
    commentText: text("comment_text"),
    commentLang: languageEnum("comment_lang"),
    aiTags: jsonb("ai_tags"),
    aiSummaryEn: text("ai_summary_en"),
    aiSummaryUr: text("ai_summary_ur"),
    aiFlagged: boolean("ai_flagged").notNull().default(false),
    customerConfirmed: boolean("customer_confirmed").notNull().default(false),
    isSeeded: isSeeded(),
    createdAt: createdAt(),
  },
  (t) => [
    check("review_stars_range", sql`${t.stars} BETWEEN 1 AND 5`),
    check(
      "review_signals_binary",
      sql`coalesce(${t.sigOnTime}, 0) IN (0, 1) AND coalesce(${t.sigQuality}, 0) IN (0, 1)
        AND coalesce(${t.sigFairPrice}, 0) IN (0, 1) AND coalesce(${t.sigRespectful}, 0) IN (0, 1)`,
    ),
    index("reviews_worker_idx").on(t.workerId),
  ],
);

export const workerReputation = pgTable("worker_reputation", {
  workerId: uuid("worker_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  reviewCount: integer("review_count").notNull().default(0),
  avgStars: doublePrecision("avg_stars"),
  bayesStars: doublePrecision("bayes_stars"),
  jobsCompleted: integer("jobs_completed").notNull().default(0),
  repeatCustomers: integer("repeat_customers").notNull().default(0),
  signalRates: jsonb("signal_rates"),
  summaryEn: text("summary_en"),
  summaryUr: text("summary_ur"),
  summaryReviewCount: integer("summary_review_count"),
  summaryGeneratedAt: tstz("summary_generated_at"),
  updatedAt: updatedAt(),
});

// ── Payments (team extra, docs/06) ───────────────────────────────────────────
export const payments = pgTable(
  "payments",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    provider: paymentProviderEnum("provider").notNull(),
    mode: paymentModeEnum("mode").notNull(),
    // Copied server-side from jobs.price_pkr; never from a request body (BR-P11).
    amountPkr: integer("amount_pkr").notNull(),
    currency: text("currency").notNull().default("PKR"),
    txnRef: text("txn_ref").notNull().unique(),
    status: paymentStatusEnum("status").notNull().default("created"),
    providerCode: text("provider_code"),
    providerPayload: jsonb("provider_payload"),
    cashWorkerAt: tstz("cash_worker_at"),
    cashCustomerAt: tstz("cash_customer_at"),
    version: integer("version").notNull().default(1),
    isSeeded: isSeeded(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("payment_amount_positive", sql`${t.amountPkr} > 0`),
    check("payment_currency_pkr", sql`${t.currency} = 'PKR'`),
    index("payments_job_idx").on(t.jobId),
    // payments_one_pending, payments_one_success: see 0001_constraints.sql
  ],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  route: text("route").notNull(),
  response: jsonb("response").notNull(),
  createdAt: createdAt(),
});
