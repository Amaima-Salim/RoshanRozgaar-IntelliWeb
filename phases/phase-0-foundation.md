# Phase 0 — Foundation

**Goal:** a running, tested skeleton with no product features yet: app, database with the booking and payment safety constraints, Better Auth with the demo phone login, Urdu/English RTL/LTR, a **responsive AppShell** (desktop NavBar / phone TopBar + BottomTabs), design tokens and base components from Figma, and CI.

**Prerequisites:** D-01…D-06, D-14, D-22 confirmed (or defaults accepted) in `docs/00` §6; the official hackathon start has passed (commit history must begin after it); Figma access works (`docs/11`).
**Read:** `implementation.md`, `docs/00`, `docs/01` (§1–§3, §7), `docs/02` (all), `docs/03` (all), `docs/05` (§1–§3), `docs/07` (§1–§3, §7), `docs/11` (all).

## Tasks
1. **Scaffold** Next.js (App Router) + TypeScript (`strict`, `noUncheckedIndexedAccess`) + Tailwind at current stable versions (pinned). Alias `@/*`. ESLint + Prettier. Scripts: `dev, build, start, lint, typecheck, test, test:e2e, db:migrate, db:seed, db:reset`.
2. **Repo hygiene:** `CLAUDE.md` and `AGENTS.md` (seed text in `implementation.md` §9), `DECISIONS.md` (log D-01…D-06, D-22, D-29), `.gitignore` (**`.env*` except `.env.example`, `client_secret_*.json`, `*.pem`**), `.env.example` (`docs/02` §8), `docker-compose.yml` (Postgres + volume), and a README stub with every heading from `docs/10` §4 (content can be TODO, but the AI-assistant disclosure and the seeded/mocked table exist from day one).
3. **Config:** `src/lib/config` with Zod-validated env. Missing AI/Google/Gmail/payment values degrade gracefully; a missing `SESSION_SECRET` in production crashes; an invalid `PAYMENTS_MODE` or a non-sandbox payment URL crashes.
4. **Database:** Drizzle schema for **all** tables in `docs/02` §3 (incl. `payments`) plus the hand-written SQL migration (btree_gist, `jobs_no_overlap`, `jobs_one_live_per_request`, `jobs_time_order`, both `payments_*` indexes). Use a pooled driver with real transactions. Verify `btree_gist` on Neon and Docker.
5. **Auth base (D-12, D-23):** Better Auth with the Drizzle adapter, DB sessions, `SESSION_SECRET`, trusted origins = `APP_URL`; user model mapped to `users` with `role`/`phone`/`language` additional fields (`role` `input:false`). **Demo phone login** (`docs/05` §3) with fixed `MOCK_OTP_CODE`, rate limits and the "Demo login — no real SMS" banner; one-tap demo accounts. `src/lib/auth/guards.ts` with `getSession()` / `requireRole()`; middleware redirecting `/w/*` and `/c/*` by role. Google and email OTP come in Phase 1; leave their buttons out.
6. **Seed (part 1):** deterministic, idempotent `db:seed`: areas (approximate centroids, `is_approximate`), 3 demo customers, 1 un-onboarded demo worker, 24 fictional workers with schedules (`is_seeded`), edge cases 1, 2, 4, 6 from `docs/01` §7. Print a summary.
7. **i18n/RTL:** `ur.json`/`en.json`, language provider + toggle (cookie + user), `<html lang dir>`, logical utilities only, self-hosted Noto Nastaliq Urdu / Noto Sans Arabic / Inter, Asia/Karachi time helpers, PKR formatter.
8. **Design tokens:** pull the Figma variables and text styles (`docs/11` §2) into CSS custom properties + the Tailwind theme (colors, spacing, radii, breakpoints `sm 360 / md 768 / xl 1280`, container max 1200).
9. **Base components** (from the Figma Design System page): Button, Tile (+ selected), Pill/Badge set, Banner set, MicButton (states stubbed), SpeakButton (hides without audio), WorkerCard (static props), Toast, Skeleton, ErrorState, EmptyState, StatusPill. **AppShell:** NavBar (≥768) and TopBar + BottomTabs + sticky footer slot (<768), RTL/LTR aware. A dev-only `/dev/components` gallery showing each component at 360 and 1440.
10. **Pages:** landing + role choice `/` and `/login` (demo phone + demo accounts) matching Figma rows 01–02 at both widths.
11. **API foundations:** response/error helpers per `docs/02` §7; `requestId` logging with redaction; `/api/health` (DB ping, no secrets).
12. **Tests + CI:** Vitest (unit + integration with a throwaway schema), Playwright projects `desktop` (1440) and `phone` (Pixel 5), `@axe-core/playwright`, GitHub Actions with a Postgres service. Add a smoke test, i18n key parity, the **integration test proving two overlapping `confirmed` jobs are rejected (23P01) while adjacent jobs succeed**, a test that the payment unique indexes reject a second `pending`, and a test that `role` can't be set through the client.
13. **Manifest stub only** (`docs/09` §2) with original placeholder icons. **No service worker** (Phase 8).

## Acceptance
- [ ] `npm run lint && npm run typecheck && npm test` pass; E2E smoke passes on `desktop` and `phone`
- [ ] `npm run db:reset && npm run db:seed` works from a clean clone with `docker compose up -d db`
- [ ] Overlap and payment-index integration tests pass against real Postgres
- [ ] Demo phone login and demo accounts work; wrong OTP and rate limit behave; role redirects work
- [ ] `/`, `/login`, gallery: no horizontal scroll at 360, correct NavBar/TopBar switch at 768, language toggle flips `dir`/`lang`, axe zero serious/critical (both languages, both projects)
- [ ] `/api/health` OK with DB up; clear failure with DB down; no secrets
- [ ] README stub has the AI-assistant disclosure, seeded/mocked table (demo login, fictional seed) and AI services header; `.gitignore` covers `client_secret_*.json`

## Out of scope
Google/email sign-in, onboarding/discovery/chat/booking/payment UI, service worker, real AI calls.

## STOP AND ASK
`btree_gist` unavailable · D-05/D-06/D-14/D-22 unconfirmed · start time not confirmed · Figma not reachable · tempted to add a feature not in this file.

## Commits
`chore: scaffold`, `feat(db): schema and constraints`, `feat(auth): better-auth demo login`, `feat(ui): tokens, components, app shell`, `test: foundation`.
