# Phase 1 — Real Sign-in: Google + Email OTP (Gmail)

**Goal:** add Google sign-in and email OTP (sent from a project Gmail account) on top of the Phase 0 Better Auth setup, with role choice and account linking. The demo phone login and demo accounts stay, so the app never depends on Google or Gmail.

**Prerequisites:** Phase 0 accepted; D-24, D-25, D-28 confirmed; the human has supplied the items below.
**Read:** `implementation.md`, `docs/05` (all), `docs/03` (§2–§5), `docs/07` (§1–§3, §7), `docs/11` (rows 01–03).

**Human supplies (STOP AND ASK when a task needs a missing one):**
1. Google OAuth client values: copy them from the downloaded `client_secret_*.json` into `.env.local` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). **Never copy the JSON into the repo.** Redirect URIs `http://localhost:3000/api/auth/callback/google` and the deploy URL equivalent; consent screen "In production" before the demo.
2. Dedicated project Gmail address + 16-character App Password (`GMAIL_USER`, `GMAIL_APP_PASSWORD`).
3. The D-28 answer from the organizers.

## Tasks
1. **Config:** `AUTH_MODE=full|mock`, Google and Gmail variables. With `mock` or missing values, hide those buttons. Test that the secrets never appear in client bundles.
2. **Google:** Better Auth Google provider, scopes `openid email profile`; branded button per Google guidelines with Urdu/English labels; prefill `users.name`.
3. **Email OTP:** Better Auth email-OTP plugin (6 digits, 10 min, ≤ 5 attempts, ≥ 60 s resend, per-email + per-IP limits). `src/lib/email` Nodemailer Gmail transport (Node runtime) + bilingual template. "Code sent" only after SMTP accepts; failures → `EMAIL_SEND_FAILED` with alternatives offered. Codes never logged; a dev-console fallback only in development.
4. **Sign-in UI (Figma 02, 03; both widths):** role tabs (desktop) / role param (phone). Worker: Google + demo phone keypad; email under "More options". Customer: Google + email code. The OTP entry screen has 6 boxes, the expiry, a resend timer and an honest error card. A note: "Sign-in is not identity verification."
5. **Role + onboarding routing:** a new user without a role → role chooser → `POST /api/me/role` (once, server-side) → `/w/onboarding` or `/c/onboarding`.
6. **Linking:** same verified email → one user; never on unverified email; phone-only accounts never linked; placeholder `@phone.invalid` emails never mailed.
7. **Security:** trusted origins, cookie flags, sign-out invalidates the session and clears client caches; auth routes rate-limited.
8. **Tests** (`docs/08` §3–§6): unit + integration (OTP paths, linking, send failure), authz with sessions from every method, E2E (worker demo phone; customer stubbed email OTP; role chooser) on both projects, axe. Manual Google test on localhost + deployed URL, recorded in the README.
9. **Docs:** README "Third-party services" (Google OAuth, Gmail SMTP), "Seeded/mocked" (demo phone OTP, demo accounts), the "not identity verification" note, Known limitation (Gmail ~500/day); `DECISIONS.md` (D-24, D-25, demo-phone implementation choice); `.env.example`.

## Acceptance
- [ ] New customer: Google and email OTP both reach onboarding; new worker: Google or demo phone; each picks a role once
- [ ] Wrong/expired/reused codes rejected; lockout after 5; resend throttled
- [ ] SMTP failure shows an honest error with alternatives; "Code sent" never appears for an unsent email
- [ ] `AUTH_MODE=mock` without Google/Gmail values: everything still runs
- [ ] No screen implies identity verification
- [ ] Desktop and phone layouts match Figma rows 02–03 (differences listed); all `docs/08` §1 gates pass

## Out of scope
Real SMS, passwords, magic links, other providers, Gmail API scopes, identity verification.

## STOP AND ASK
D-24/D-25/D-28 unconfirmed · values not supplied when needed · Google shows an unverified-app/verification screen · the installed Better Auth version lacks a needed plugin or option.

## Commits
`feat(auth): google sign-in`, `feat(auth): email otp via gmail`, `feat(auth): role chooser and linking`, `test(auth): otp limits and linking`, `docs: auth disclosure`.
