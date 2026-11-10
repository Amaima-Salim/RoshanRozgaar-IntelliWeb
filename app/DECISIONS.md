# Decisions

Every non-obvious decision: what, why, alternatives. IDs D-01…D-29 come from the plan's decision register
(`docs/00` §6); D-30 onward were made during implementation.

## Confirmed by the team before Phase 0 (2026-11-10)

| ID   | Decision                                                                                                                                                                   | Status                               | Notes                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| D-01 | Next.js (App Router) + TypeScript strict + Tailwind CSS                                                                                                                    | Accepted                             | Pinned: Next 16.4.6, React 19.3.1, Tailwind 4.3.5                                                                        |
| D-02 | Neon Postgres (pooled) + Vercel; Docker Postgres locally                                                                                                                   | Accepted                             | Local: `postgres:17-alpine` on port 5433. `btree_gist` verified on Docker; **not yet verified on Neon** (no project yet) |
| D-03 | Drizzle ORM + hand-written SQL for constraints                                                                                                                             | Accepted                             | `src/lib/db/migrations/0001_constraints.sql`                                                                             |
| D-04 | Realtime by polling (4 s) with row versions                                                                                                                                | Accepted                             | Used from Phase 4                                                                                                        |
| D-05 | Islamabad + Rawalpindi; electrician, plumber, AC technician, carpenter, mechanic                                                                                           | Accepted (defaults)                  | 8 seeded areas, approximate centroids                                                                                    |
| D-06 | Urdu (RTL, default) + English toggle (LTR); Roman Urdu input                                                                                                               | Accepted (defaults)                  |                                                                                                                          |
| D-14 | Plan files not in the repo                                                                                                                                                 | Accepted                             | Team chose "keep out"; plan files live in the parent folder                                                              |
| D-22 | Pre-made Figma designs allowed                                                                                                                                             | Accepted                             | Team: Figma OK; credited in README                                                                                       |
| D-24 | Sign-in per role: worker = Google or demo phone (email code under "More options"); customer = Google or email code (demo phone under "More options"); demo accounts always | Accepted (Phase 1 start, 2026-11-10) | Team said "start phase 1"; treated as confirmation of the proposal                                                       |
| D-25 | OTP email via Gmail SMTP (Nodemailer + App Password, dedicated project Gmail, ~500/day)                                                                                    | Accepted (Phase 1 start, 2026-11-10) | Same                                                                                                                     |
| D-28 | Google client + Gmail App Password set up before the hackathon start                                                                                                       | **Unconfirmed with organizers**      | Configuration only, no project code; the values were **not yet in `.env.local`** at Phase 1 start                        |
| D-07 | "Nearby" = 10 km radius constant                                                                                                                                           | Accepted (Phase 3 start, 2026-11-10) | Team said "start phase 3"; treated as confirming the proposals D-07, D-08, D-09                                          |
| D-08 | "Available" = toggle ON (for ASAP) + inside weekly hours + no overlapping confirmed job; default duration 2 h                                                              | Accepted (Phase 3 start)             | Same                                                                                                                     |
| D-09 | One agreed fixed PKR amount per job via offer/counter; profile shows an indicative rate                                                                                    | Accepted (Phase 3 start)             | Same                                                                                                                     |
| D-29 | Web-first responsive; PWA is a Phase 8 enhancement                                                                                                                         | Accepted                             | Breakpoints 360 / 768 / 1280                                                                                             |

## Implementation decisions

### D-30 — `cacheComponents` disabled

- **Decision:** turn off the `cacheComponents` and `partialPrefetching` flags that `create-next-app` 16.4 enables by default.
- **Why:** nearly every page reads the session or the language cookie (the root `<html lang dir>` needs it), and the app's
  rule is to show server-confirmed state only. With Cache Components, every request read must sit behind `<Suspense>`
  or opt out per route, which adds friction and stale-cache risk with no benefit for this app.
- **Alternatives:** keep it on and use `use cache: private` + Suspense boundaries around session reads.

### D-31 — Demo phone login is a small custom Better Auth plugin (`docs/05` §3)

- **Decision:** `src/lib/auth/demo-phone.ts` adds `/demo-phone/send` and `/demo-phone/verify` endpoints that check
  `MOCK_OTP_CODE`, store a challenge in Better Auth's `verifications` table, and create a normal Better Auth session.
- **Why:** Better Auth's `phone-number` plugin generates a random code and, when a custom `verifyOTP` is supplied, skips
  its attempt counter, so the "≤ 5 attempts per challenge" rule would be lost. It also names the user column
  `phoneNumber` and builds the placeholder email from the phone number rather than `<id>@phone.invalid`.
- **Rules enforced:** 6-digit fixed code; challenge expires in 5 minutes; ≤ 5 wrong attempts then the challenge is
  deleted; ≥ 60 s between sends per phone; Better Auth's IP rate limit on both endpoints. No SMS is ever sent.
- **Alternatives:** the `phone-number` plugin with `sendOTP` as a no-op.

### D-32 — Better Auth tables written by hand in the Drizzle schema

- **Decision:** `users`, `sessions`, `accounts`, `verifications`, `rate_limits` are defined in `schema.ts` with the field
  names the installed Better Auth (1.7.19) reads from `@better-auth/core` `getAuthTables`, instead of the CLI output.
- **Why:** the published `@better-auth/cli` (1.4.21) lags the library (1.7.19). One migration path (drizzle-kit) keeps
  every table in one reviewed place. Integration tests run real Better Auth sign-ins against this schema.
- **Alternatives:** run the CLI generator and merge its output.

### D-33 — Job state machine vs. table statuses

- **Decision:** the plan's lifecycle (`docs/01` §5) spans three tables. `requests.status` covers open/booked/cancelled/
  expired; `conversations.status` covers open/declined/booked/closed; `offers.status` covers the negotiation; `jobs.status`
  holds only confirmed / in_progress / completed / cancelled (a job row exists only once an offer is accepted).
  "requested" and "negotiating" are derived states (request open, without/with a conversation). "rejected" is not a state:
  it is the `CONFLICT_STATE` error response.
- **Why:** this matches the data model in `docs/02` §3, which the exclusion constraint depends on. Phase 5 builds
  `job-machine.ts` on this mapping.

### D-34 — `users.name_ur`

- **Decision:** add a nullable `name_ur` column to `users`.
- **Why:** `docs/03` §4 asks WorkerCard to show the name in Urdu and English, and `docs/02` §3 has only one `name`.
- **Alternatives:** transliterate at render time (unreliable), or show one name only.

### D-35 — TypeScript 5.9, not 7

- **Decision:** pin `typescript@5.9.3`.
- **Why:** TypeScript 7 (the native rewrite) is current on npm, but Next 16 documents a 5.1+ minimum and `create-next-app`
  installs 5.x; the editor plugin and type-aware ESLint rules target the 5.x API. Avoids a hackathon-day toolchain risk.

### D-36 — Fonts self-hosted via `@fontsource`

- **Decision:** Noto Nastaliq Urdu (Urdu headings), Noto Sans Arabic (Urdu UI/body), Inter (English + numerals) from
  `@fontsource/*` packages, bundled with the app.
- **Why:** self-hosted per `docs/03` §3, and builds don't need network access to Google Fonts.
- **To do (Phase 8):** test legibility on a real low-end Android phone and record the result here.

### D-37 — Payment sandbox host allow-list

- **Decision:** `src/lib/config` refuses to boot if `JAZZCASH_BASE_URL` / `EASYPAISA_BASE_URL` is set to anything other
  than `https://sandbox.jazzcash.com.pk` / `https://easypaystg.easypaisa.com.pk`.
- **Why:** `docs/06` §1, no real money ever. **These hosts must be confirmed against the official integration guides in
  Phase 7** (the guides weren't supplied yet).

### D-38 — Seeded edge cases measured from G-9

- **Decision:** distance edge cases are placed relative to the G-9 centroid (Demo Customer 1's area). Edge case 1's
  worker sits about 14.0 km away; the edge case 6 twins share one base point and differ only in rate (Rs 1,000 vs Rs 1,600).
- **Why:** the seed summary prints these distances so the presenter knows what to expect.

### D-39 — Role routing: optimistic Proxy check + server guard

- **Decision:** `src/proxy.ts` only checks that a session cookie exists for `/w/*` and `/c/*` (redirects to `/login`);
  the real role and ownership check is `requireRole()` in the `/w` and `/c` layouts, which redirects a user with the
  wrong role to their own area and a user with no role to `/`.
- **Why:** Next 16 docs: Proxy is for optimistic checks, not full session management. API routes call the guards directly.

### D-40 — Design tokens are provisional (Figma unreachable in Phase 0)

- **What happened:** the Figma MCP connector refused calls ("tool call limit on the Starter plan") before any frame or
  variable could be read. `docs/11` says STOP AND ASK when Figma isn't reachable; the team was told, and Phase 0
  continued on everything that doesn't depend on Figma.
- **Decision:** tokens in `src/app/globals.css` use the values written in `docs/11` §2 (primary `#0F6B3E`, accent
  `#F2A900`, radii, touch sizes, breakpoints, container width). Every other colour is a placeholder chosen to pass
  WCAG AA and is marked as such. Components follow `docs/03` §4 patterns; `/` and `/login` are **not yet compared
  against Figma rows 01–02**.
- **To do when Figma is reachable:** pull the RR Color / RR Size variables and text styles, replace the placeholders,
  and compare `/`, `/login` and the gallery against frames 01–02 at 360 and 1440. One file changes for the tokens.

### D-41 — Phase 0 stubs for later phases

- `/api/me/role` (Phase 1 task 5) exists now because the landing page's role choice (Figma 01, a Phase 0 page) needs it
  for a new demo-phone user. `/api/me/language` backs the language toggle.
- Tab destinations (`/w/home`, `/w/chat`, `/w/profile`, `/c/request/new`, `/c/history`, `/c/chat`) are honest
  placeholders ("Coming next … built in a later phase") so role routing can be tested. Each is replaced by its phase.
- `/c/history` and `/c/chat`, `/w/chat` are index routes not listed in `docs/02` §2; they are the BottomTabs targets for
  "Bookings" and "Messages" (`docs/03` §2).

### D-42 — `AUTH_RATE_LIMIT=off` for E2E only

- **Decision:** a config switch that turns off Better Auth's per-IP limits. Playwright's web server sets it, because
  both viewports sign in many times from one IP within a minute. In a production build it is refused unless
  `RR_E2E=1` (the local E2E marker) is also set, and `RR_E2E=1` itself is refused on Vercel.
- **Not affected:** the per-phone rules (60 s resend, 5 attempts) are in the plugin itself and stay on; integration
  tests cover them.

### D-43 — E2E waits for hydration; runs on port 3200

- The root provider sets `html[data-hydrated="true"]` after mount; E2E waits for it before clicking (dev-mode compiles
  are slow and clicks before hydration are silently lost).
- E2E builds and starts a **production** server on port 3200 (`E2E_PORT`; port 3000 is often taken on the team's
  machines). Dev mode recompiled and hot-reloaded mid-test, which made the first test flaky. The dev-only component
  gallery is reachable in that build only because the E2E server sets `RR_E2E=1`; it 404s in any normal production run.

### D-47 — Email OTP sends through our own endpoint; onboarding stubs

- **Decision:** `POST /api/auth/email-code/send` awaits SMTP and returns `502 EMAIL_SEND_FAILED` on any failure.
  Better Auth's email-OTP plugin still stores/verifies codes (hashed, 10 min, 5 attempts) and signs the user in
  (`/sign-in/email-otp`). Every other `/email-otp/*` route returns 404.
- **Why:** the plugin's own send endpoint runs the mailer as a background task and swallows its errors, so it answers
  `success: true` for an unsent email (found by a failing test). "Code sent" must never be shown for an unsent email.
- **Alternatives:** configure a background-task handler (still fire-and-forget); fork the plugin.
- **Also:** a failed send deletes the stored code so the 60 s resend cooldown doesn't block a retry. Same-email linking
  relies on the plugin's lookup by email plus Google as a trusted provider (Google only links on a verified email);
  phone-only users have `@phone.invalid` emails, which are never mailed or matched.
- **Stubs:** `/w/onboarding` and `/c/onboarding` are `PhasePlaceholder` pages (Phase 2+ builds them); a new user's
  role choice now routes there, while existing users still land on `homeFor(role)`.
- **E2E stub:** with `RR_E2E=1` no mail is sent and the code is fixed (`424242`); the flag is already refused on
  deployments (D-42).
- **Demo phone implementation:** unchanged from D-31 (custom Better Auth plugin endpoints).

### D-48 — Phase 2 choices

- **Customer default area** is kept in a non-sensitive `rr_area` cookie (set by `POST /api/customer/onboarding`), not a new
  column: no migration, and it only prefills the request form in Phase 3. The customer's name and language go to `users`.
- **Voice extraction** runs rules first, the LLM second (docs/04 §4). The extract route takes only the step id and the
  transcript; it does not take "known answers" (not needed, and less data leaves the app). Allowed areas come from the DB.
- **Browser speech recogniser** runs beside the recorder as the fallback when server speech-to-text fails; it is used only
  if the server returns nothing.
- **`AI_MODE=fixtures`** replays a recorded transcript per step regardless of what was actually said, and says so with a
  persistent "Simulated AI" badge. It exists for the test server and keyless demos.
- **Rate limits** on `/api/ai/*`: 30 calls/min and 200/day per user, stored in the DB. The mode check comes first (503
  `AI_UNAVAILABLE` when off); the limiter is skipped only on the local E2E server (`RR_E2E=1`, refused on deployments).
  Found because repeated E2E voice runs on one shared demo account hit the old 12/min cap.
- **Spoken guide** (`src/lib/guide`): one registry of ids → bilingual texts. Each "Listen" button plays a file from
  `/public/audio/{ur,en}/<id>.mp3` when `audio-manifest.ts` lists it, else the browser voice, else hides; the full text in
  both languages is always available in an expandable panel. Audio-generation tool: decided in D-50.
- **Worker onboarding** keeps answers in memory until the read-back "Yes"; `PUT /api/worker/profile` saves everything in one
  transaction. A finished worker can reopen it with `/w/onboarding?edit=1`. Saving does not switch availability on.
- **Ranking prior:** the Bayesian average uses a prior mean of 3.5 stars with C = 3 (`ranking-config.ts`), so a worker
  with no reviews scores as average, not as zero. Version `RANKING_VERSION` in the same file.

### D-49 — Phase 3 choices

- **Results are rendered on the server** (`/c/request/[id]`) with the same `findCandidates` service the
  `GET /api/requests/[id]/candidates` route uses, so the page and the API cannot disagree. "Widen the radius"
  is a `?radius=20` link, not hidden state.
- **"This evening" = 18:00 today** (or in 30 minutes if that has passed); **"Tomorrow" = 10:00 tomorrow**
  (Asia/Karachi). A chosen time, not a window. Customers who want another time use "Pick a time".
- **Toggle vs scheduled time:** the availability toggle only removes a worker from "now" searches
  (D-08). A scheduled request is matched on weekly hours and booked jobs, so a worker with the toggle off can
  still appear for tomorrow; this is on purpose, not a bug.
- **Request drafting (AI-03) covers typed text only for now.** Rules first (trade and rough time keywords in
  English, Roman Urdu and Urdu script), Gemini only when the rules find no trade, output validated
  by a strict Zod schema, and the customer must press "Use this". Voice and photo drafting for requests are
  **not built yet** (photo is a Should; voice needs the customer-side recorder).
- **Maps:** Leaflet with OpenStreetMap tiles, no API key, loaded only on the results page, attribution shown.
  Pins use the rounded public coordinates (about 500 m); the exact base point never leaves the server.
- **Worker photos are not shown to customers yet:** media is owner-only until a phase adds a public
  conversation-scoped route, so cards use initials.
- **Typical price** on a worker profile is the mean of that worker's completed jobs, else the indicative rate.

### D-50 — Urdu voice models (speech to text and text to speech)

- **Chosen in a Claude Code session on 2026-11-10** at the team's request ("use Urdu voice models to communicate with
  the end user"); swap freely, it is one env var.
- **Text to speech:** `TTS_PROVIDER=azure` (default) uses Azure Speech neural voices `ur-PK-UzmaNeural` (or
  `AZURE_SPEECH_UR_VOICE=ur-PK-AsadNeural`), native Pakistani Urdu, MP3 output, free F0 tier. Needs
  `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`. `TTS_PROVIDER=gemini` is opt-in: Google's docs do not list Urdu as a
  supported TTS language (the model detects the language from the text), so expect a foreign accent; it reuses
  `GEMINI_API_KEY` and returns WAV (about 8x the size of Azure's MP3, so prefer Azure for the pre-generated files on
  mobile data). Not yet run against either live API.
- **Where it speaks:** every "Listen" guide button, the voice feedback messages, the onboarding read-back, the mic
  consent text and the customer's request draft. Order: pre-generated file → `POST /api/ai/speak` → browser
  `speechSynthesis` → hidden (text always on screen). `SpeakButton` uses the server model only when the call site
  passes `voiceModel`, and that is never done for text with names, phones, emails or addresses.
- **`POST /api/ai/speak`:** signed-in users only; POST so text never lands in a URL; text ≤ 600 chars; mode check →
  fixtures/no key (503, client falls back) → AI rate limits. 64-entry in-memory cache server side, object-URL
  cache client side. `AI_MODE=fixtures` never fakes audio.
- **Pre-generated prompts (done, 2026-11-10):** all 25 guide/feedback prompts in Urdu and English were generated with the
  free open-source `edge-tts` CLI (`npm run audio:generate -- --provider=edge`), voices `ur-PK-UzmaNeural` and
  `en-US-AvaNeural`, and committed under `/public/audio`. `edge-tts` calls Microsoft Edge's unofficial read-aloud
  service: fine for demo prompts, but not a supported API, so use Azure's official tier for anything live. To change a
  prompt's text, delete its file and run the command again. `npm run audio:generate` writes `/public/audio/{ur,en}/<id>.{wav,mp3}` for every guide
  id and fixed feedback message, then regenerates `audio-manifest.ts` from the files that exist. Nothing is
  committed until a real key has produced real audio.
- **Speech to text:** still Groq Whisper (`language=ur`). It is now shared by `useSpeechToText` and opened to customers for
  spoken requests (`purpose=request`; each role may only use its own purpose; fixtures replay a request transcript).
  The upload file name now follows the sniffed type, so Safari's `audio/mp4` is no longer sent as `.webm`.
- **Not built:** chat voice notes (Phase 4) reuse `useSpeechToText` but need media storage first.

## Derived UI states

States not drawn in Figma, derived from `docs/03` §4 patterns. Listed here as they are built.

- Login: wrong-code / expired / locked-out / resend-throttle error text (derived; `docs/05` §3 rules).
- Login: loading state on "Get code" / "Sign in" (Button `loading` keeps its width).
- Login: email entry, 6-box code entry with expiry and resend timer, "email could not be sent" card, Google failure line.
- Worker onboarding: the six steps, read-back, voice box states (listening / processing / heard / not understood), consent dialog, dashboard empty states (derived until compared with Figma 04–06).
- Customer onboarding: location denied / outside the service area notes (derived).
- Landing: role chooser for a signed-in user with no role yet (saving / error text).
- Booking (Phase 5): accept panel, success, conflict with alternatives, "offer no longer open", job page (all four
  statuses, cancel-with-reason, waiting states), customer bookings list, worker Engaged card (derived; Figma 11–13 not
  yet compared).
- All Phase 0 screens are derived until compared against Figma (D-40).

### D-55 — Phase 5 choices (booking and availability consistency)

- **Accepting is the booking** (D-11, unchanged). Nothing in the accept path reads or writes `payments`; the accept
  screen says "payment not needed to book". Phase 7 payments (JazzCash, Easypaisa, cash) are not touched.
- **Job states vs rows.** `jobs.status` only stores `confirmed → in_progress → completed | cancelled`. `requested`,
  `negotiating`, `declined` and `expired` live in the request / conversation / offer rows. `job-machine.ts` models the
  whole `docs/01` §5 table in one pure function and is tested cell by cell.
- **Bookings are serialised per worker with `SELECT … FOR UPDATE` on `worker_profiles`** (lock order: offer → request
  → worker). Found by the 50-round race test: with only the exclusion constraint, two parallel inserts each wait on the
  other's uncommitted row and Postgres aborts one with **deadlock 40P01** instead of a clean `23P01`. The lock makes the
  loser read the winner's committed job and get `CONFLICT_BOOKED`. The constraint stays as the final arbiter against any
  other writer (a raw-SQL test proves it).
- **Idempotency:** key stored as `userId:route:key` in `idempotency_keys`, guarded by a transaction advisory lock so two
  concurrent requests with one key both resolve to the same job. Failures are not stored, so a retry after a conflict
  asks the database again.
- **Availability re-check on accept** uses the same `checkWorkerFree` as discovery, so an offer outside the worker's
  weekly hours is rejected with `CONFLICT_STATE worker_outside_hours`, not just overlap.
- **Cancel:** reason required (stored as a code such as `plans_changed`, shown translated). The window is freed by the
  status change itself. The request becomes `cancelled` when the **customer** cancels and returns to `open` when the
  **worker** cancels, so the customer can pick someone else. Cancelling an `in_progress` job is refused.
- **Optimistic concurrency:** the client sends the `version` it saw; the update is
  `WHERE id AND version AND status`. Zero rows → `CONFLICT_STATE` with the current row.
- **Lazy expiry** (`expireStale`, no cron): offers pending longer than `OFFER_TTL_HOURS` and open requests with no
  request / message / offer activity for that long are expired when someone looks (accept, job pages, worker home).
- **The Accept button is a page, not a modal:** `/c/offer/[id]` and `/w/offer/[id]` restate the stored terms from the
  server, and the offer card (Phase 4) only needs to link its Accept button there. Alternatives after a lost race are
  shown to customers only.
- **Exact address** (`requests.address_text`) is returned only to the assigned worker, only from the job view.
- **Customer "Bookings" tab** (`/c/history`) now lists the customer's jobs (it was a placeholder).
- **Seed edge case 3** (nearby worker booked for the next 2 h) is Naveed Akhtar with a real request → conversation →
  offer → job chain, times relative to when the seed runs. Re-seed shortly before a demo.
- **Cancelling an open request** (`POST /api/requests/[id]/cancel`, customer only, reason required but not stored: the
  table has no column for it) closes its conversations and withdraws its pending offers.
- Not done here (other phases): offer create/counter/decline/withdraw routes and the offer card (Phase 4),
  payments (Phase 7), reviews (Phase 6). No system chat message is written on booking.

### D-56 — Phase 4 choices (chat, voice notes, offers)

- **Offers are rows, not just messages:** an `offers` row plus a `kind=offer` message in one transaction. A person has at
  most one pending offer: sending a new one withdraws their older pending one, and a counter marks the answered offer
  `countered` in the same transaction. Retrying the same `clientMsgId` returns the stored offer.
- **Accept is the Phase 5 page:** the card's Accept links to `/c|w/offer/[id]`; chat never books by itself.
- **AI-05 is rules only.** `draftOfferFromText` reads one amount (digits, Roman Urdu, Urdu words) in 100–1,000,000 PKR
  and returns nothing when there is none or it is ambiguous. There is no model to talk into a price ("set my price to 1"
  is just words). The draft only pre-selects a chip, is labelled AI, and nothing is sent until the sender presses Send.
- **AI-04 is best-effort:** the audio is always delivered. Transcript and translation come from Groq / Gemini through
  `src/lib/ai/chat.ts` (kept apart from `ai/index.ts`); on failure or `AI_MODE=off` the note stays audio-only.
- **Voice audio access:** `/api/media/[id]` serves a voice note to either participant of its conversation; everyone
  else gets 404.
- **Booked conversations stay writable** for text and voice (the worker and customer still need to coordinate), but
  new offers are only possible while the conversation is `open`.
- Voice notes: ≤ 60 s, ≤ 2 MB, type checked by magic bytes; rate limits: 30 texts / 10 voice notes / 20 offers per minute.

## Worker identity document check (CNIC OCR + DEMO NADRA)

- **OCR is a draft.** `ocrCnic` (`src/lib/ai/ocr.ts`) sends the card photos to Gemini vision, then `sanitizeCnicDraft`
  drops anything that is not a plausible CNIC number / real date. The worker edits and confirms every field; AI never
  decides trust. `AI_MODE=fixtures` replays a demo card, `off` / provider failure leaves the form for typing.
- **NADRA is a demo, not an integration.** `src/lib/verification/nadra-demo.ts` checks a small fake registry
  (`DEMO_REGISTRY`). Statuses are `demo_verified` / `mismatch` / `not_found` and the UI labels them DEMO everywhere:
  nothing says "NADRA verified". To go live, implement `NadraVerifier` and return it from `getNadraVerifier()`.
- **Privacy.** The full CNIC number is not stored: only a keyed HMAC (so one card cannot back two accounts) and a
  masked form. Card photos are private `media` rows (owner-only through `/api/media/[id]`).
- **Not wired into ranking/booking.** `demo_verified` is shown to the worker only; no trust score uses it yet.
- Demo CNICs and flow: see README "Seeded, simulated, and mocked".

### D-57 — Sign-in only worked on exactly `APP_URL` in development

- **What was wrong:** nothing in `.env.local`, the migrations or the OTP code. Phone OTP, email OTP, Google redirect and
  the demo accounts all worked at `http://localhost:3000`. Opened as `http://127.0.0.1:3000` or a LAN address (a phone
  on the same Wi-Fi), the dev server returned 403 for its own JS chunks (Next's `allowedDevOrigins`), so the page never
  hydrated and every sign-in button did nothing, with no error shown. Separately, Better Auth only trusted `APP_URL`,
  so a POST from any other origin that carried a session cookie got `INVALID_ORIGIN`.
- **Fix:** `allowedDevOrigins` in `next.config.ts` (dev server only) and `trustedOriginsFor()` in
  `src/lib/auth/origins.ts`, which in non-production also trusts `localhost`, `127.0.0.1`, `[::1]` and private LAN
  ranges on the app's own port. Production trusts `APP_URL` only. A foreign origin is still refused.
- **Still true:** the per-IP limit of 5 code requests per minute applies to the demo accounts too (each click is one
  send plus one verify), so a sixth click inside a minute shows "too many requests". That is the limit working.

### D-58 — Phase 6 choices (trust and reviews)

- **No schema change.** `reviews` and `worker_reputation` already existed. Reputation is recomputed from source rows
  (reviews, completed jobs) with the reputation row locked, in the review transaction and on confirm-complete.
- **Bayesian score:** C = 3 pseudo-reviews at prior mean 3.5 (`ranking-config.ts`), stored as `bayes_stars`.
- **Signal percentages** show only with at least 3 answers per signal; "how to improve" uses the weakest signal under 80%.
- **AI-06** is a draft the customer edits or removes; the server re-checks tags against the enum and the client can only
  raise `flagged`. **AI-07** runs after commit, every number (digits, Urdu digits, number words) must be in the data and
  no verification claim is allowed, else the plain data template shows without an AI label.
- **Flagged-review policy (default, final policy still to be confirmed by the team):** stars and signals count, the flag
  is stored, the comment is hidden from the public list and the AI summary. Seeded reviews are counted and labelled Demo.
- **Seed:** 45 completed jobs with reviews through the real request→job chain; edge 1 excellent, edge 5 mixed.

## Live Groq and Gmail OTP (2026-11-10)

The user selected Groq using the existing key and Gmail email codes using the existing Better Auth system.
Text understanding and CNIC OCR now default to Groq; Gemini remains explicitly selectable. Whisper detects
Urdu/English instead of forcing Urdu. JSON is schema validated; omitted/null profile lists become empty
without inventing values. Text uses a low reasoning effort and a 2048-token response cap; vision uses
768 output tokens to fit the configured account's quota. No automatic retries or fallback to another
external provider. Existing tap/text and deterministic fallbacks remain. Urdu TTS uses existing recordings,
optional Azure/Gemini or browser speech. Updated consent does not play the obsolete provider recording.
Gmail SMTP authentication can be checked without sending mail via `npm run services:check smtp`; inbox
delivery must be tested by requesting a code on the login screen. Real NADRA is still not connected.
