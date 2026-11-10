# Roshan Rozgar (روزگار روشن) — Implementation Guide (root file)

> Read this file first. Then work on **one** `phases/phase-N-*.md` file at a time, in order.
> Read files in `docs/` only when the current phase file lists them.
> The human hands over phase files one by one; the coding agent (Claude) implements each one, reports, and stops.

## 1. What we are building

A **web application** that connects households with nearby skilled trade workers (electricians, plumbers,
AC technicians, carpenters, mechanics) in Islamabad/Rawalpindi. It is built for the **CUI Tech Fest — AI Web Forge** hackathon.

- **Web-first and responsive.** It runs in any standard browser. Desktop (≥1280 px) and tablet layouts are first-class, and **every screen has a phone layout (360 px and up)**. The problem statement requires "usable on a phone-sized screen", and the judges score a "mobile-first layout" under usability.
- **PWA install and offline viewing are an enhancement** (Phase 8), never a dependency. The app must work fully without a service worker.
- **Urdu (RTL) is the default language.** An English toggle mirrors the layout to LTR, and Roman Urdu is accepted as input.

The five required outcomes (problem statement §3) must work together as **one flow for both roles**:

| # | Outcome | Plain meaning |
|---|---------|---------------|
| O1 | Onboarding | A worker builds a complete profile **without reading or typing into a conventional sign-up form** |
| O2 | Discovery | A customer finds a suitable worker who is **nearby and available at the requested time** |
| O3 | Communication | Customer and worker agree on the job and **price** in a way that suits **non-typists** |
| O4 | Booking | A job is confirmed and the platform stays **consistent about who is free vs engaged** |
| O5 | Trust | After the job, the platform captures information that **helps the next customer decide** |

Team-requested extras (not required by the PRD; they must never weaken O1–O5):
- **Real sign-in:** Google sign-in and email OTP sent from a project Gmail account (Phase 1). The demo phone login stays.
- **Payments:** JazzCash (sandbox), Easypaisa (sandbox if credentials exist, otherwise a labelled demo), and cash (Phase 7). **No real money ever moves.**

## 2. Source-of-truth rules

1. **PRD = `Roshan_Rozgar_Problem_Statement.pdf`.** It is authoritative for scope and judging. It is outcome-based and does not prescribe features. Every feature in this plan is a design decision listed in `docs/00` §6.
2. **SRS = `SkillConnect.docx`** (a different, larger project) is reference only. `docs/00` §3 lists what was adopted and what was excluded.
3. If the PRD and anything else conflict, **the PRD wins**. Known conflicts are in `docs/00` §4.
4. **Design:** the Figma file *Roshan Rozgar — Web App (Desktop + Mobile)* (`docs/11`). Precedence: PRD > behavior in these docs > Figma visuals > `docs/03` fallback patterns. Accessibility floors in `docs/03` always apply.
5. **Never invent requirements, integrations, data or business rules.** If something is missing, check `docs/00` §5–§6. If it is not there, **STOP AND ASK**.

## 3. Hard constraints from the PRD

- A web app in a standard browser, usable at phone width. No native apps.
- PRD-S4 puts payment processing and identity verification **out of scope**. Payments here are sandbox or demo only and always labelled (C11). Sign-in is **never** presented as identity verification.
- Every AI service and every third-party service is listed in the README. **AI coding assistants (Claude, and any others used) are disclosed in the README.**
- Seeded or simulated data is stated in the README and labelled in the UI wherever a user could mistake it for real.
- **Never present mocked functionality as working.** Never fake a success state.
- All project-specific code is written **inside the hacking window**; commit history begins after the official start. Confirm with the organizers whether these plan files may be in the repo (D-14).
- AI must do work that matters: judges ask "what stops working if the AI is removed?" (`docs/04` §9).
- Weights: Technical execution 30 · Problem understanding 20 · Innovation & AI 20 · Usability & accessibility 15 · Presentation 15. **Reliability beats feature count.**

## 4. Architecture summary (details: `docs/02`)

| Layer | Choice | Why |
|-------|--------|-----|
| App | Next.js (App Router) + TypeScript strict + Tailwind CSS | One repo, server routes, free hosting, fast to build |
| UI | Own components on Radix primitives; Figma tokens → Tailwind theme; logical (RTL-safe) utilities; responsive AppShell | Accessible primitives, full control of low-literacy UX |
| DB | PostgreSQL (Neon free tier; Docker locally) + Drizzle ORM | Exclusion constraint gives a hard no-double-booking guarantee |
| Auth | **Better Auth** on Drizzle: Google, email OTP over Gmail SMTP (Nodemailer), demo phone OTP (fixed code, disclosed) | One library for OAuth, OTP and DB sessions; Auth.js is now maintained by the Better Auth team, which recommends Better Auth for new projects |
| Payments | Provider adapter: JazzCash sandbox hosted checkout, Easypaisa sandbox or labelled demo, cash recording; `PAYMENTS_MODE=off\|mock\|sandbox` | No real money in a hackathon; hosted checkout means the app never handles wallet PINs or card data |
| Maps | Leaflet + OpenStreetMap; Haversine distance; list fallback | Free, no billing key |
| Realtime | Short polling (4 s while visible) with version numbers | Fewest moving parts on free hosting |
| AI | Provider-abstracted: Gemini free tier (LLM + vision), Groq Whisper free tier (speech-to-text), browser Web Speech fallback, pre-generated Urdu audio prompts | All free; every call has a timeout, schema validation and a non-AI fallback |
| PWA (enhancement) | Manifest + service worker (Serwist or hand-written); offline = read-only | Commitments (bookings, payments) are never queued offline |
| Tests | Vitest, Playwright (Desktop Chrome 1440 **and** Pixel 5), axe-core | Covers consistency, accessibility, both roles and both viewports |

## 5. Phase sequence (strictly in order; each ends committed and demo-able)

| Phase file | Delivers | Reads |
|-----------|----------|-------|
| `phase-0-foundation.md` | Repo, DB schema (all tables incl. payments), Better Auth + demo phone login, i18n/RTL, responsive AppShell, design tokens from Figma, CI | 00, 01, 02, 03, 05, 07, 11 |
| `phase-1-sign-in.md` | Google sign-in, email OTP via Gmail, role choice, account linking | 03, 05, 07 |
| `phase-2-worker-onboarding.md` | O1: voice-led onboarding + AI layer v1 + worker dashboard | 01, 03, 04 |
| `phase-3-customer-discovery.md` | O2: request (voice/text/photo/tap), eligibility, ranking, results + map, worker profile | 01, 02, 04 |
| `phase-4-communication.md` | O3: chat, voice notes, translation, offer cards | 01, 03, 04 |
| `phase-5-booking.md` | O4: atomic booking, job state machine, conflict handling | 01, 02, 08 |
| `phase-6-trust-reviews.md` | O5: reviews → grounded trust summary. **The five outcomes now run end to end** | 01, 04 |
| `phase-7-payments.md` | Sandbox/demo payments after completion (JazzCash, Easypaisa, cash) | 06, 07, 08 |
| `phase-8-pwa-hardening.md` | PWA install + offline (enhancement), security, accessibility, performance | 07, 08, 09 |
| `phase-9-polish-demo.md` | README, deployment, demo script, final QA | 08, 10 |

**Build rule inside every outcome phase:** build the **tap-only, no-AI path first** and get it working end to end, then layer AI on top with a fallback. An AI outage must never block the demo, and `AI_MODE=off` must always complete the flow.

## 6. How the coding agent works with these files

1. Read this file, then only the phase file given and the docs it lists.
2. Do not build work from later phases. If a hook is needed now, add the smallest stub and log it in `DECISIONS.md`.
3. Make small conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), one per task group.
4. Before calling a phase done, run its acceptance commands, check every acceptance item, and **report honestly**, including failures and skipped items.
5. When a phase says **STOP AND ASK**, stop and ask the human.
6. Keep `README.md` truthful at all times: update "Seeded/mocked", "AI services", "Third-party services" and "Known limitations" whenever something is added.
7. Record every non-obvious decision in `DECISIONS.md` (decision, reason, alternatives).
8. **Never commit secrets.** Use `.env.local`; keep `.env.example` current. The Google `client_secret_*.json` the human downloaded is **never** copied into the repo; its values go into `.env.local` only.
9. Never present simulated behavior as real. Every mock is labelled in the UI and listed in the README.
10. Code quality: TypeScript strict; no `any` without a comment; Zod at every boundary; server-side authorization on every route; no dead code; tests for logic that can fail silently.
11. Every screen ships in **both layouts** (desktop and phone) and both languages, matched against the Figma frame pair in `docs/11`.

## 7. Global acceptance criteria (final)

- [ ] **O1:** a new, non-seeded worker completes onboarding by voice or taps only, ending with a complete profile (trade, experience, areas, rate, availability). No conventional form is shown.
- [ ] **O2:** a customer request returns ranked workers who match the trade, are within the radius and are free for the window. Busy or offline workers never appear as available. "No match" is handled honestly.
- [ ] **O3:** both parties can agree without typing (voice notes + offer cards). Price and time are agreed through explicit confirm actions.
- [ ] **O4:** accepting an offer atomically marks the worker engaged. Two simultaneous accepts for the same worker and time produce exactly one winner (tested).
- [ ] **O5:** completion prompts a review (taps + optional voice). The next customer sees a grounded trust summary built from real review data.
- [ ] Both roles demonstrated end to end on **desktop (1440)** and **phone (360)**, in Urdu (RTL) and English (LTR).
- [ ] Sign-in: Google, email OTP (Gmail) and the demo phone login work; `AUTH_MODE=mock` still runs everything; no screen implies identity verification.
- [ ] Payments: after completion, JazzCash sandbox / Easypaisa (sandbox or demo) / cash work, labelled "Test mode" everywhere; `PAYMENTS_MODE=off` leaves O1–O5 unchanged.
- [ ] With `AI_MODE=off` the full flow completes via tap/typed fallbacks.
- [ ] PWA (enhancement): installable; offline shows the shell and read-only data; commitments are blocked offline with a clear message.
- [ ] `npm run lint && npm run typecheck && npm test && npm run test:e2e` all pass.
- [ ] The README meets every PRD deliverable (`docs/10`).

## 8. Priority / cut line (if time runs short)

- **Must:** Phases 0–6 (five outcomes, tap path + core AI), Urdu UI, responsive desktop + phone layouts, demo login, availability-safe booking, review → trust summary, README.
- **Should:** Google sign-in + email OTP, voice-note translation, photo understanding, map view, cash + demo payment.
- **Could:** JazzCash/Easypaisa sandbox, PWA install + offline, Web Push, worker rates customer, data-deletion endpoint.
- **Cut first:** Could items, then photo understanding, then the map (keep a sorted list with distances), then email OTP (keep Google + demo login).

## 9. `CLAUDE.md` / `AGENTS.md` seed (Phase 0 creates both with this text)

```
Project: Roshan Rozgar — web-first, responsive marketplace for skilled trade workers (CUI Tech Fest AI Web Forge).
Read /implementation.md first. Work one phase file at a time. Source of truth: the problem statement (PRD).
Rules: never invent requirements; never fake success states; label all mocks in UI and README; no secrets in repo
(never commit client_secret_*.json or .env.local); TypeScript strict; Zod at boundaries; server-side authz on every route;
every screen has desktop and phone layouts in Urdu (RTL) and English (LTR);
bookings and payments are server-confirmed and never queued offline; payment amounts come only from the server;
payments are sandbox/demo only; sign-in is never identity verification;
AI output is a draft a human confirms — AI never decides price, booking, payment, or trust scores.
Commands: npm run dev | lint | typecheck | test | test:e2e | db:migrate | db:seed | db:reset
Disclose AI coding assistance in README. Small conventional commits.
```

## 10. Open decisions (full register: `docs/00` §6)

- **Blocking before Phase 0:** D-05 city/trades, D-06 languages, D-14 plan files in repo, D-22 pre-made Figma designs allowed.
- **Before Phase 1:** D-24 sign-in methods per role, D-25 Gmail SMTP, D-28 pre-start account setup allowed.
- **Before Phase 3:** D-07 radius, D-08 availability rule, D-09 price model.
- **Before Phase 6:** D-10 trust signals.
- **Before Phase 7:** D-26 payment providers/modes, D-27 payment timing.
- **The human also supplies:** hackathon start time and deadline, team size, Gemini and Groq API keys, Google OAuth client values, Gmail App Password, and JazzCash sandbox credentials plus the integration guide.
