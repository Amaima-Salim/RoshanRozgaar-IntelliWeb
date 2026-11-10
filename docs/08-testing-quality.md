# 08 — Testing and Quality

Read by: Phases 5, 7, 8, 9 (fully); every phase runs its own acceptance tests. Reliability is scored, so test what can fail silently: availability, booking races, authz, payment integrity, AI fallbacks, responsive layouts.

## 1. Quality gates (every phase)
```
npm run lint && npm run typecheck && npm test && npm run test:e2e
```
CI (GitHub Actions): lint, typecheck, unit + integration tests against a Postgres service container (real migrations incl. constraints), build. E2E may run locally if CI minutes are short; record the last green run in the README.

## 2. Tooling
Vitest (unit + integration with a throwaway schema), Playwright with **two projects: `desktop` (Chrome 1440×900) and `phone` (Pixel 5 / 393×851, plus a 360-wide check)**, `@axe-core/playwright`, ESLint + Prettier, `tsc --noEmit`. **Never mock the database** for booking or payment tests.

## 3. Unit tests
`availability.isWorkerFree` (windows, edges, overlap, adjacency, toggle, Asia/Karachi weekday) · `ranking` (filters, monotonicity, Bayesian 0/1/50 reviews, budget, tie-break, reasons, no_match) · `geo` (Haversine, rounding) · `job-machine` (all allowed/disallowed transitions, terminal finality) · `payment-machine` · `payments/amount` + hash build/verify · `reputation` (stats, "no reviews", number validation of summaries) · Zod schemas (AI drafts reject out-of-range; number words "do hazar", "pandrah sau") · i18n key parity · auth: role immutability, OTP template both languages.

## 4. Integration tests (real Postgres)
**Booking (O4):** concurrent double-accept → exactly one job (`Promise.all`; 50 iterations, no flakes); idempotent replay; accept after withdraw/expire → `CONFLICT_STATE`; start vs cancel race; engaged worker leaves overlapping candidate lists and returns after cancel; adjacent bookings succeed; raw-SQL overlap rejected (23P01).
**Auth:** OTP happy path, expiry, 5-attempt lockout, reuse, resend throttle; send failure → `EMAIL_SEND_FAILED` (never success); same-email Google + OTP → one user; unverified email never links; every sign-in method passes the same guards.
**Payments:** tampered amount/ref/bad hash rejected; replayed callback idempotent; concurrent starts → one pending; second success impossible; non-owner → `FORBIDDEN`; not completed → `CONFLICT_STATE`; amount in body → `VALIDATION`; boot refuses non-sandbox config.
**Authz matrix:** table-driven test for every cell of `docs/07` §2 incl. IDOR on conversation, job, media, request, payment.
**Reviews:** completed only; one per job; stars 1–5; reputation updated in the same transaction.
**Uploads, rate limits:** as in `docs/07`.

## 5. AI tests
Contract tests replay recorded responses per feature; failure injection (timeout, 429, invalid JSON, empty transcript) → fallback used, UI not stuck; `AI_MODE=off` full-flow E2E; `AI_MODE=fixtures` shows the "Simulated AI" badge; prompt-injection corpus (English/Urdu/Roman Urdu) → no booking/price/payment/verification side effects; `npm run ai:eval` accuracy table for the README.

## 6. E2E (Playwright, both projects unless noted)
1. Worker onboarding via the tap path (no mic) → profile complete.
2. Worker onboarding with fake audio (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`) + AI fixtures (phone project).
3. **Full flow, two browser contexts:** customer request → ranked list → chat/offer → worker accepts → booked (worker engaged; a second customer no longer sees them) → start/complete → confirm → review → next customer sees the updated trust summary.
4. Payments (`PAYMENTS_MODE=mock`): mock success → "Paid"; failure → cash → both tap.
5. Sign-in: demo phone (worker), stubbed email OTP (customer), role chooser.
6. Language toggle keeps state; RTL ↔ LTR mirror; no clipped controls at 360 px; no horizontal scroll; desktop multi-column layouts render.
7. (Phase 8) Offline: banner, commit buttons disabled, refetch on reconnect.

## 7. Accessibility and usability
Automated axe on every route × both languages × both viewports (zero serious/critical). Manual: keyboard-only pass on desktop; TalkBack smoke test of onboarding and offer-accept on a phone; 200% zoom; contrast; reduced motion.
**Usability test (PRD-E2):** ≥ 3 non-team people (ideally one with limited literacy) attempt worker onboarding on a phone without help. Record completion, time and stumbling points; fix the top 3; write `docs/usability-notes.md`.

## 8. Performance budgets (soft)
First-route JS ≤ ~200 KB gzip where practical; LCP ≤ 2.5 s on throttled "Fast 3G + 4× CPU" for `/w/home` and `/c/request/new` (phone) and ≤ 2 s on desktop broadband; read APIs p95 ≤ 1 s locally; candidates ≤ 2 s; AI calls show "processing" instantly and finish ≤ 8 s or fall back. Lazy-load the map and recording code.

## 9. Pre-demo rehearsal
Fresh reset + seed; demo accounts log in; two devices (laptop for the customer, phone for the worker); mic works; AI keys and quotas healthy; `AI_MODE` set and disclosed; Google consent screen "In production"; JazzCash sandbox reachable (else switch to `PAYMENTS_MODE=mock` and say so); local fallback starts with one command; timed run within the slot.
