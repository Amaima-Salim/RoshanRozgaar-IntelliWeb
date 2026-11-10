# Roshan Rozgar (روزگار روشن)

> **Status: Phase 0 (foundation).** The app skeleton, database, demo login and layout shell exist. None of the five
> outcomes is built yet. Sections marked _TODO_ are filled in as each phase lands; nothing below describes a feature
> that doesn't exist yet.

_TODO (Phase 9): one-paragraph pitch: the barrier the app removes for workers and households._

## Live demo / how judges can run it

_TODO: deployed URL._

Demo accounts (one tap on `/login`, or type the phone number on the keypad):

| Account                | Phone        | Notes                                                     |
| ---------------------- | ------------ | --------------------------------------------------------- |
| Ayesha Khan (customer) | 0300-0000001 | Fictional                                                 |
| Bilal Ahmed (customer) | 0300-0000002 | Fictional                                                 |
| Sana Malik (customer)  | 0300-0000003 | Fictional                                                 |
| Demo Worker            | 0300-0000010 | Starts **not onboarded**, so onboarding can be shown live |

Demo phone code: `123456` (the `MOCK_OTP_CODE` default). **No SMS is ever sent**, and the login screen says so.

Works in any modern browser on desktop and phone. _TODO (Phase 8): optional install as an app (PWA)._

## What the app does — the five outcomes

_TODO: Onboarding, Discovery, Communication, Booking, Trust for both roles, with desktop and phone screenshots._

## Setup (from a clean clone)

Prerequisites: Node.js ≥ 20.9 (developed on 24), Docker.

```bash
docker compose up -d db          # Postgres 17 on localhost:5433
cp .env.example .env.local       # then set SESSION_SECRET (openssl rand -base64 32)
npm ci
npm run db:migrate && npm run db:seed
npm run dev                      # http://localhost:3000
```

Reset the demo data: `npm run db:reset && npm run db:seed`.

Quality gates: `npm run lint && npm run typecheck && npm test && npm run test:e2e`.
Integration tests use `TEST_DATABASE_URL` (default `roshan_test` on the same server) and drop and recreate it on every run.
E2E needs Playwright browsers once: `npx playwright install chromium`. It builds and starts its own production server on
port 3200 (set `E2E_PORT` to change it).

## Tech stack

| Layer      | Choice                                           | Version               |
| ---------- | ------------------------------------------------ | --------------------- |
| Framework  | Next.js (App Router), React, TypeScript (strict) | 16.4.6, 19.3.1, 5.9.3 |
| Styling    | Tailwind CSS (tokens from the Figma file)        | 4.3.5                 |
| Database   | PostgreSQL + Drizzle ORM + postgres.js           | 17, 0.45.4, 4.1.0     |
| Auth       | Better Auth (DB sessions)                        | 1.7.19                |
| Validation | Zod                                              | 4.6.7                 |
| Testing    | Vitest, Playwright, axe-core                     | 5.1.0, 1.65.0, 4.14.0 |
| Hosting    | _TODO: Vercel + Neon_                            |                       |

## AI services and tools used

_No AI service is called by the app yet._ `AI_MODE` defaults to `off`. _TODO (Phase 2+): table of service/model, used
for, free tier, fallback, data sent, limitations._

## "What stops working if AI is removed?"

_TODO (from docs/04 §9 once the AI features exist)._

## Third-party services (non-AI)

- **Google OAuth** (sign-in; scopes `openid email profile` only, no Gmail API access). Needs `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET`; redirect URI `<APP_URL>/api/auth/callback/google`. Hidden when the values are missing or
  `AUTH_MODE=mock`.
- **Gmail SMTP** (sign-in code emails via Nodemailer, a dedicated project Gmail + App Password). Needs `GMAIL_USER` /
  `GMAIL_APP_PASSWORD`. Hidden when the values are missing or `AUTH_MODE=mock`.

_TODO: OpenStreetMap tiles (Phase 3), JazzCash sandbox and
Easypaisa (Phase 7), Neon, Vercel._

## AI coding assistants

This project is being built with **Claude Code (Anthropic, Claude Opus 5.5)** as an AI coding assistant.

- **Claude:** scaffolding, the database schema and constraints, auth wiring, UI components, tests and documentation,
  working phase by phase from the team's written plan.
- **The team:** product decisions and the implementation plan, the Figma designs, review of every change, Urdu copy,
  manual testing and the demo.

All code is reviewed and run by the team. _TODO: expand with specifics per phase._

## Seeded, simulated, and mocked

| Item                                             | Real or simulated                                                                                                                 | How to tell in the UI                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Workers (24), customers (3), demo worker         | **Fictional, seeded** (`is_seeded = true`); names invented, phones use the fake `0300-0000XXX` pattern, emails use `@example.com` | "Demo data" tag on seeded content                     |
| Area locations (8 areas in Islamabad/Rawalpindi) | **Approximate** centroids, written from general map knowledge, not surveyed                                                       | —                                                     |
| Demo phone login + one-tap demo accounts         | **Mock**: a fixed code, no SMS is sent                                                                                            | "Demo login — no real SMS is sent" banner on `/login` |
| Email sign-in code (E2E server only)             | **Stubbed**: the local test server (`RR_E2E=1`, refused on any deployment) emails nothing and always issues `424242`              | Never reachable in a normal run                       |
| Email sign-in code (development, no Gmail)       | The code is printed to the server console instead of emailed                                                                      | "Dev mode — the code is in the server log"            |
| Sign-in                                          | Sign-in is **not identity verification**; there is no "verified" badge anywhere                                                   | —                                                     |
| Payments                                         | _Not built yet (Phase 7). When built: sandbox/demo only, no real money; refunds and payouts not implemented._                     | "Test mode" banner                                    |
| Figma designs                                    | Pre-made designs, use allowed per D-22. _TODO: who made them, when, and whether AI-assisted._                                     | —                                                     |

## Hacking-window statement

All project-specific code was written after the official start of the hackathon. _TODO: exact start time and the time
of the first commit._ Open-source libraries are credited below.

## Known limitations

- Phase 0 only: none of the five outcomes is implemented yet.
- `btree_gist` (needed for the no-double-booking constraint) is verified on Docker Postgres; not yet verified on Neon.
- Area coordinates are approximate.
- Email codes are sent from a personal Gmail account, which allows about **500 emails per rolling 24 hours**. When the
  cap or SMTP fails, the app says no code was sent and offers Google or the demo phone login.
- Google sign-in: the consent screen must be set to "In production" before the demo (in "Testing" only listed test
  users can sign in). _TODO: manual Google test on localhost and on the deployed URL (result and date)._
- _TODO: Urdu STT accuracy (measured), free-tier limits, polling not push, single city, offline is read-only._

## Architecture notes and trade-offs

- **No double booking, enforced by the database:** a Postgres exclusion constraint (`jobs_no_overlap`) rejects any two
  confirmed or in-progress jobs for the same worker with overlapping time windows. Back-to-back jobs are allowed.
- **Payment integrity at the database level:** at most one pending and one successful payment per job (partial unique indexes).
- _TODO: ranking formula, payment verification, why polling, why web-first + PWA._

## Security and privacy notes

- Secrets live only in `.env.local` (git-ignored); `.env.example` lists names only. The Google `client_secret_*.json`
  is never committed (`.gitignore`).
- DB-backed sessions in `httpOnly`, `SameSite=Lax` cookies (`Secure` in production).
- _TODO: summary of docs/07 and the free-tier AI data note._

## Credits and licenses

- Fonts: Noto Nastaliq Urdu, Noto Sans Arabic, Inter (all SIL Open Font License), via `@fontsource`.
- Icons: Lucide (`lucide-react`, ISC License).
- Design: Figma file "Roshan Rozgar — Web App (Desktop + Mobile)". _TODO: designer credit._
- _TODO: full library list with licenses; © OpenStreetMap contributors once map tiles are used._

## Future work (not implemented)

Real SMS OTP, identity verification, live payments and payouts, push notifications, admin tools.
