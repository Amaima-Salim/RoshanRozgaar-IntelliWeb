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

`AI_MODE=live|fixtures|off` (default `off`). Set `AI_MODE=live` and `GROQ_API_KEY` to enable
live speech and understanding. Text and image tasks default to Groq; no Gemini key is required.
Provider failures, invalid output and quota limits fall back to manual input or deterministic summaries.
AI proposes drafts; people confirm them. AI never decides a price, booking, payment or trust score.

| Task                                               | Default provider                                                          | Fallback                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Onboarding, request and chat speech recognition    | Groq Whisper `whisper-large-v3-turbo`; automatically detects Urdu/English | Browser recognition where available, then taps/text; chat retains audio |
| Profile extraction and request drafting            | Local rules, then Groq `openai/gpt-oss-20b`                               | Tap/typed fields                                                        |
| Chat translation                                   | Groq `openai/gpt-oss-20b`                                                 | Original transcript/audio                                               |
| Review drafting and bilingual reputation summaries | Groq `openai/gpt-oss-20b`; summaries validated against stored statistics  | Original review and deterministic summary                               |
| CNIC OCR                                           | Groq `qwen/qwen3.8-27b` vision; extracted fields are editable drafts      | Manual entry; NADRA check remains a fictional demo registry             |
| Offer amount drafting                              | Local number parser; no external model                                    | Price chips and typed amount                                            |
| Spoken instructions                                | Prerecorded app audio, optional Azure/Gemini TTS, then browser speech     | Visible bilingual text                                                  |

`GROQ_MODEL` and `GROQ_VISION_MODEL` override the default models. `AI_TEXT_PROVIDER=gemini` and/or
`AI_VISION_PROVIDER=gemini`, with `GEMINI_API_KEY`, explicitly select the previous Gemini integration.
There is no silent switch to a different provider. `TTS_PROVIDER=azure|gemini` is independent;
Groq does not provide Urdu speech generation here. The updated microphone consent text uses live/browser
speech instead of the older recording, which names the previous understanding provider.

Groq JSON object mode is validated again with each task's Zod schema. Calls have bounded output,
timeouts and no automatic retries. Images are sent inline from the server; no public image URL is created.
Provider documentation: [text/JSON](https://console.groq.com/docs/structured-outputs),
[speech recognition](https://console.groq.com/docs/speech-to-text),
[vision](https://console.groq.com/docs/vision).

**Data:** speech clips, their transcript text, request descriptions and review text are sent only for their task.
Account names, phones, emails and addresses are not added to language-model prompts, but spoken/typed
content can itself contain personal details. CNIC OCR necessarily sends the selected card images and their
printed personal details to the configured vision provider. Use fictional cards and team voices for demos.

`AI_MODE=fixtures` uses recorded stand-ins and displays **Simulated AI**; it makes no live provider calls.
`AI_MODE=off` keeps the tap/text marketplace path available. Fixed recorded spoken guidance still plays.

### Live service verification

Verified locally on 2026-11-10: live request/profile drafting, Urdu→English translation, review drafting,
grounded summary phrasing, English/Urdu prerecorded prompt transcription, and rejection of a non-CNIC icon.
Gmail SMTP authentication passed without sending mail. An authenticated `/api/ai/draft-request` returned
HTTP 200 with `source: "llm"` and `simulated: false`; an unauthenticated call returned HTTP 401.
These are smoke checks, not measured accuracy on user recordings or real CNICs.

Run `npm run services:check` (or append `ai` / `smtp`) after configuring `.env.local`.
This exercises the actual app AI functions with synthetic text, a prerecorded app prompt, and a non-CNIC app icon.
SMTP verification authenticates with Gmail without sending a message. Errors do not print keys or message bodies.
A passing SMTP check does not prove inbox delivery; request a code through the login screen to test delivery.

## Third-party services (non-AI)

- **Google OAuth** (sign-in; scopes `openid email profile` only, no Gmail API access). Needs `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET`; redirect URI `<APP_URL>/api/auth/callback/google`. Hidden when the values are missing or
  `AUTH_MODE=mock`.
- **Gmail SMTP** (sign-in code emails via Nodemailer, a dedicated project Gmail + App Password). Needs `GMAIL_USER` /
  `GMAIL_APP_PASSWORD`. Hidden when the values are missing or `AUTH_MODE=mock`.

- **OpenStreetMap tiles via Leaflet** (results map; no API key). Tiles are fetched by the customer's browser from
  `tile.openstreetmap.org` under the OSM tile usage policy, with the required attribution shown on the map. Only
  approximate (about 500 m) worker pins and the customer's own search circle are drawn. If tiles fail, the list still works.

_TODO: JazzCash sandbox and Easypaisa (Phase 7), Neon, Vercel._

## AI coding assistants

This project is being built with **Claude Code (Anthropic, Claude Opus 5.5)** as an AI coding assistant.

**OpenAI Codex** also assisted with the landing page installation guidance, live Groq text/vision integration,
provider and workflow tests, and live AI/Gmail service verification.

- **Claude:** scaffolding, the database schema and constraints, auth wiring, UI components, tests and documentation,
  working phase by phase from the team's written plan.
- **The team:** product decisions and the implementation plan, the Figma designs, review of every change, Urdu copy,
  manual testing and the demo.

All code is reviewed and run by the team. _TODO: expand with specifics per phase._

## Seeded, simulated, and mocked

| Item                                             | Real or simulated                                                                                                                 | How to tell in the UI                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Seeded booking for Naveed Akhtar                 | **Fictional, seeded**: one confirmed 2-hour job starting when the seed ran, so he shows as engaged                                | "Demo data" tag                                       |
| Workers (24), customers (3), demo worker         | **Fictional, seeded** (`is_seeded = true`); names invented, phones use the fake `0300-0000XXX` pattern, emails use `@example.com` | "Demo data" tag on seeded content                     |
| Area locations (8 areas in Islamabad/Rawalpindi) | **Approximate** centroids, written from general map knowledge, not surveyed                                                       | —                                                     |
| Demo phone login + one-tap demo accounts         | **Mock**: a fixed code, no SMS is sent                                                                                            | "Demo login — no real SMS is sent" banner on `/login` |
| Email sign-in code (E2E server only)             | **Stubbed**: the local test server (`RR_E2E=1`, refused on any deployment) emails nothing and always issues `424242`              | Never reachable in a normal run                       |
| Email sign-in code (development, no Gmail)       | The code is printed to the server console instead of emailed                                                                      | "Dev mode — the code is in the server log"            |
| Sign-in                                          | Sign-in is **not identity verification**; there is no "verified" badge anywhere                                                   | —                                                     |
| Payments                                         | _Not built yet (Phase 7). When built: sandbox/demo only, no real money; refunds and payouts not implemented._                     | "Test mode" banner                                    |
| Figma designs                                    | Pre-made designs, use allowed per D-22. _TODO: who made them, when, and whether AI-assisted._                                     | —                                                     |

### Worker identity check (CNIC OCR + demo NADRA)

`/w/verify`: the worker photographs their CNIC, AI reads it (Groq vision by default; a draft they correct), and the details go
through a **demo NADRA check** against a built-in fake registry. This is **not** NADRA and not real identity
verification; results read "Matched in demo check". Demo records (CNIC / name / date of birth):
`61101-1234567-1` Muhammad Ahmed Khan 1990-04-12 · `35202-2345678-2` Ayesha Bibi 1988-11-03 ·
`61101-9876543-3` Usman Ali 1995-07-21 · `37404-5566778-1` Bilal Hussain 1985-01-30. Any other number returns
"not found". API: `POST /api/worker/verification/scan`, `GET|POST /api/worker/verification`.

## Hacking-window statement

All project-specific code was written after the official start of the hackathon. _TODO: exact start time and the time
of the first commit._ Open-source libraries are credited below.

## Known limitations

- Groq live smoke checks use synthetic inputs; they do not establish Urdu speech-recognition accuracy or translation quality for real users. Optional Gemini/Azure providers still need their own credentials and validation.
- Fixed guidance has prerecorded audio. Dynamic spoken text and the updated microphone consent fall back to browser speech when Azure/Gemini TTS is not configured; some browsers have no Urdu voice.
- Requests accept text, voice and photo attachments; AI drafting uses text/transcribed speech, not the attached photo.
- Worker photos are not shown to customers yet.
- Seeded reviews and completed jobs are fictional demo data, labelled accordingly; some workers intentionally have no reviews.
- The Figma comparison for the request, results and profile screens (rows 07–09) has not been done.
- The Figma comparison for the booking screens (rows 11–13: accept, conflict, job pages) has not been done; they are built from the written spec and `docs/03` patterns.
- Reviews and reputation (Phase 6) are implemented. Payments, full offline support and final polish remain incomplete. Booking exists as the accept screen (`/c/offer/[id]`, `/w/offer/[id]`) and job pages (`/c/job/[id]`, `/w/job/[id]`); offers are made in chat (Phase 4).
- Phase 4 chat: the Figma comparison for the chat and offer screens (row 10) has not been done; they are built from the written spec. Groq transcripts and translation have live synthetic smoke checks; Urdu↔English quality for real conversations has not been measured. Offer drafts use local rules only. Chat is polled every 4 s, not pushed. The offer composer offers a fixed set of start tiles and durations (1–4 h) plus a free date-time picker.
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
