# 10 — Deployment, README, Demo, Submission

Read by: Phase 9 (fully). PRD-D1…D4.

## 1. Deployment
**A. Deployed URL (preferred):** Vercel + Neon free Postgres (pooled URL; `btree_gist` enabled). Set env vars in the host dashboard. HTTPS is automatic (needed for mic, geolocation, PWA, OAuth, gateway callbacks). Add the deploy domain to: Google OAuth redirect URIs, Better Auth trusted origins (`APP_URL`), the JazzCash sandbox Return URL.
**B. Local instance (mandatory fallback):** `docker compose up -d db` → `cp .env.example .env.local` → `npm ci` → `npm run db:migrate && npm run db:seed` → `npm run build && npm start`. Verify from a clean clone. Local fallback runs with `PAYMENTS_MODE=mock` (gateways cannot call back to localhost) and with Google enabled only if `http://localhost:3000` is registered.
Warm-up 10 minutes before judging: `/api/health`, each AI feature, one Google sign-in, one email OTP, one mock payment. Bring a phone hotspot.

## 2. Configuration checklist
All variables in `docs/02` §8. Production fails closed on missing `SESSION_SECRET`; missing AI/Google/Gmail/payment values degrade to fallbacks with visible labels.

## 3. Seed and reset
`npm run db:reset`, `npm run db:seed` (deterministic). The seed prints a summary (counts per trade, edge-case worker names, demo account list) for the presenter.

## 4. README template (every section required, all content truthful)
```markdown
# Roshan Rozgar (روزگار روشن)
One-paragraph pitch: the barrier it removes for workers and households.

## Live demo / how judges can run it
URL · demo accounts (Demo Worker, Demo Customer ×3) · demo phone OTP code · local run commands.
Works in any browser on desktop and phone; optional install as an app (PWA).

## What the app does — the five outcomes
Onboarding, Discovery, Communication, Booking, Trust for both roles (screenshots: desktop + phone).

## Setup (from a clean clone)
Prerequisites, env vars (.env.example), commands, test commands.

## Tech stack
Table with versions: framework, DB/ORM, auth, UI, maps, PWA, testing, hosting.

## AI services and tools used
Table: service/model | used for | free tier? | fallback | data sent | limitations. AI_MODE options. Whether fixtures were used in the demo.

## "What stops working if AI is removed?"
(table from docs/04 §9)

## Third-party services (non-AI)
Google sign-in (OAuth) · Gmail SMTP (email OTP) · JazzCash sandbox · Easypaisa (sandbox or demo) · OpenStreetMap tiles · Neon · Vercel.

## AI coding assistants
Which assistants (e.g. Claude) were used for what (scaffolding, domain logic, tests, UI, docs) and what humans did (architecture decisions, review, Urdu copy, testing, demo). All code reviewed and run by the team.

## Seeded, simulated, and mocked
Table: item | real or simulated | how to tell in the UI. Must include: fictional workers/customers/jobs/reviews (`is_seeded`), approximate area coordinates, demo phone OTP + demo accounts, sign-in is not identity verification, **payments: sandbox/demo only — no real money; refunds/payouts not implemented**, AI fixtures mode (if used), recorded demo audio, pre-made Figma designs (if used, per D-22).

## Hacking-window statement
All project-specific code written after <official start>; history begins <time>; OSS credited below.

## Known limitations
Urdu STT accuracy (measured), free-tier limits (Gemini, Groq, Gmail ~500/day), polling not push, approximate locations, no real payments or ID checks, single city, browser notes, offline = read-only, OAuth/gateway behavior in installed PWA.

## Architecture notes and trade-offs
Booking consistency (exclusion constraint + transaction + idempotency), ranking formula and limits, payment verification (hash + inquiry), why polling, why web-first + PWA enhancement.

## Security and privacy notes
Summary of docs/07 + free-tier AI data note.

## Credits and licenses
Libraries, fonts (Noto, Inter), icons, map tiles (© OpenStreetMap contributors), Figma design credit.

## Future work (not implemented)
Real SMS OTP, ID verification, live payments + payouts, push notifications, admin tools.
```

## 5. Demo script (5–7 min; adapt to the slot)
1. **(30 s) Problem:** the adda/word-of-mouth gap; name the five outcomes.
2. **(90 s) Worker onboarding on a phone:** sign in with the demo phone login (say "demo, no SMS"); speak in Urdu/Roman Urdu; read-back; profile complete; toggle available. Point out: no form.
3. **(90 s) Customer on a laptop browser:** Google sign-in; speak a problem in Roman Urdu; confirm the draft; ranked list with reasons + map; a busy worker excluded.
4. **(75 s) Communication + booking:** voice note with translation; offer card; worker accepts on the phone; worker engaged; try the same slot from a third session → conflict with alternatives.
5. **(60 s) Trust:** complete; customer review by taps + voice; the next customer sees the updated summary.
6. **(30 s) Payment (labelled test mode):** pay via JazzCash sandbox or demo; "Paid" after server verification; say "sandbox — no real money".
7. **(30 s) Reliability and honesty:** `AI_MODE=off` instance; switch to English (LTR); the README seeded/mocked table; optional: install as an app on the phone.

Rules: never call anything mocked "working"; name each mock when it appears (demo login, test-mode payments, no ID checks); narrate AI fallbacks if a call fails.

## 6. Judge Q&A drill
What stops working without AI? (docs/04 §9) · How is double-booking prevented? (constraint + transaction + idempotency; show the test) · Why these ranking weights? (transparent, versioned, explainable) · Why polling? · Trust without ID checks? (post-job evidence; no fake badges) · Urdu accuracy? (measured; read-back + tap fallback) · What data goes to AI providers? · Payments are out of scope — why include them? (disclosed sandbox only, never blocks the flow, server-verified) · Why web-first if workers use phones? (problem statement asks for a web platform; every screen is designed for phone width; PWA install for workers) · What is mocked? (README table).

## 7. Submission checklist
- [ ] Team registered; no composition changes
- [ ] Repo public; first commit after the start; no prior-project code; no secrets (`client_secret_*.json` absent)
- [ ] README complete with AI-assistant disclosure and the seeded/mocked table
- [ ] Deployed URL verified from another network/device **and** local fallback verified from a clean clone
- [ ] Demo accounts, seed and reset verified; Google consent screen "In production"
- [ ] Quality gates green; known failures documented
- [ ] Submitted ≥ 30 min before the deadline
