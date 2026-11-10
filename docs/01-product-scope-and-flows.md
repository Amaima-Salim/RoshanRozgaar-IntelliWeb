# 01 — Product Scope, Flows, Rules, Seed Data

Read by: Phases 0, 2–6. Authority: PRD (`docs/00` §2).

## 1. Users and devices

- **Worker:** mid-career tradesperson, low literacy, usually on an **Android phone** with limited data; speaks Urdu/Punjabi. Needs no forms, spoken guidance, big buttons. The worker flow must be excellent at **phone width**.
- **Customer:** a household member on a **laptop/desktop browser or a phone**; reads Urdu, Roman Urdu or English. Wants nearby + free now + trustworthy + price clarity. The customer flow must be excellent on **desktop and phone**.
- No admin role.

The personas are design aids only, not claims about real users.

## 2. Scope

| Tier | Items |
|------|-------|
| **Must** | Responsive web app (desktop + phone layouts for every screen) · demo phone login + one-tap demo accounts · voice-led worker onboarding with tap fallback · customer request (voice/text/tap) · eligibility + ranking · worker profile with trust summary · chat with voice notes + offer cards · atomic booking · availability consistency · job start/complete · review → trust summary · Urdu RTL + English LTR · seeded data + disclosure |
| **Should** | Google sign-in + email OTP via Gmail · map view · photo-of-problem understanding · voice-note translation · spoken read-back · alternatives after decline/conflict · cash + demo payment |
| **Could** | JazzCash/Easypaisa sandbox · PWA install + offline read-only · Web Push · worker rates customer · delete-my-data |
| **Out** | Real money / live payment credentials · payouts, escrow, commission · identity verification · native apps · admin dashboard · disputes · live GPS tracking |

## 3. Routes and flows

Route prefixes: `/` landing + role choice, `/login`, `/w/*` worker, `/c/*` customer, `/pay/*` payments. Each route has one responsive page (no separate mobile site). Figma pairs: `docs/11`.

### Sign-in (Figma 02, 03)
- `/login?role=worker|customer`. Worker: "Continue with Google" + "Phone number (demo)" on a big numeric keypad; email code under "More options". Customer: Google + email code. One-tap demo accounts on both.
- First sign-in with no role → role chooser (`/`). The role is set once, server-side.

### O1 Onboarding (Figma 04, 05, 06)
- **Worker** `/w/onboarding`: guided interview, one question per step, each with an audio prompt and icon answers: (1) trade (5 tiles or say it), (2) years of experience (stepper or say it), (3) areas (area tiles/map or say it), (4) usual rate (price chips or say an amount), (5) when free (weekday + time-of-day tiles), (6) optional photo. Voice answers → STT → AI extraction → live "profile so far" panel (desktop: side panel; phone: on the read-back step) → **read-back screen** with Yes / Change. Result: a complete profile, no form.
- **Customer** `/c/onboarding`: name (prefilled from Google if used), area (geolocation or tiles), language. Under 30 seconds.
- **Worker dashboard** `/w/home`: big availability toggle, today's schedule, incoming requests with "why you were matched", reputation card.

### O2 Discovery (Figma 07, 08, 09)
- **Customer** `/c/request/new`: describe by voice/text/photo/tap; choose when (Now / This evening / Tomorrow / pick). AI turns it into a draft (trade, summary, urgency, time); the customer confirms or corrects. Desktop shows the draft live beside the input.
- `/c/request/[id]/results`: ranked eligible workers with reasons (distance, free at time, rating with count, price hint). Desktop: list + map side by side; phone: list with a Map/List switch.
- `/c/workers/[id]`: profile with stats, grounded AI summary, signal percentages, typical price, recent reviews.
- **Worker** sees incoming requests and why they matched.

### O3 Communication (Figma 10)
- `/c/chat/[id]`, `/w/chat/[id]`: one conversation per (request, worker). Message kinds: text, voice note (auto-transcribed, translated if languages differ), quick-reply chips, offer card (PKR price + start time + duration), system events. Desktop: conversations | chat | job details. Phone: single chat view.
- Either side sends an offer; the other Accepts / Counters / Declines. AI may draft offer terms from a voice note; a human always sends.

### O4 Booking (Figma 11, 12, 13)
- Accepting an offer creates the **confirmed booking** atomically (D-11). The worker becomes engaged for the window and disappears from overlapping searches.
- Worker presses Start → Request completion; customer confirms completion.
- Conflict: if someone else booked the worker a moment earlier, show a specific message and next-best alternatives. Nothing was charged or confirmed for the loser.

### O5 Trust (Figma 14, 09)
- `/c/job/[id]/review` after completion: stars + four tap signals + optional voice comment → AI tags + bilingual summary → customer confirms.
- The next customer sees the rating with count, a grounded AI summary (labelled, with review count), signal icons, jobs completed and repeat customers. New workers show "No reviews yet", never zero stars.
- The worker sees their reputation and a "how to improve" hint derived from real signals.

### Payment (team extra; Figma 15, 16; D-26/D-27)
- After `completed`, the customer may pay the agreed `jobs.price_pkr` via JazzCash (sandbox), Easypaisa (sandbox or demo) or cash (both parties tap). "Skip for now" is always available. A "Test mode — no real money" banner appears on every payment screen. "Paid" shows only after server verification or both cash taps.

## 4. Business rules

| ID | Rule | Source |
|----|------|--------|
| BR-P1 | Only authenticated users with the right role and record ownership may act; enforced server-side | SRS BR-002 |
| BR-P2 | Requests must be inside the seeded service area; only workers matching trade, area and time window are offered as available | PRD-O2 |
| BR-P3 | AI/recommendations never confirm a booking, set a price, start/confirm a payment, or award trust | SRS BR-006/013 |
| BR-P4 | A worker cannot hold two confirmed jobs with overlapping windows (DB-enforced) | PRD-O4 |
| BR-P5 | Prices are integer PKR with an explicit basis shown before acceptance | SRS BR-007 |
| BR-P6 | Only the customer of a completed job reviews; one per job; 1–5; "no reviews" ≠ zero | SRS BR-011 |
| BR-P7 | AI drafts/summaries are labelled and need confirmation; uncertain fields stay empty | SRS BR-013 |
| BR-P8 | Customer's exact address revealed to the worker only after booking; worker locations shown approximately | SRS BR-012 |
| BR-P9 | Terminal states are final | SRS Table 2.4 |
| BR-P10 | Seeded data carries `is_seeded=true` and is labelled where it could mislead | PRD-S3 |
| BR-P11 | Payment amount = `jobs.price_pkr`, read on the server; "Paid" only after a verified gateway callback + inquiry or both cash taps; payment never blocks review or trust | D-27 |
| BR-P12 | Sign-in method is never presented as identity verification | PRD-S4, D-24 |

## 5. Job state machine

States: `requested` → `negotiating` → `confirmed` → `in_progress` → `completed`; terminal alternates `cancelled`, `expired`, `declined`.

| From | To | Actor | Condition |
|------|----|-------|-----------|
| (new) | requested | Customer | Request confirmed |
| requested | negotiating | Either | First message/offer |
| negotiating | confirmed | Counterpart of the offer | Accept; availability + overlap re-checked in the same transaction |
| negotiating | declined | Worker | Declines; customer gets alternatives |
| requested/negotiating | expired | System | No activity for TTL (24 h) |
| confirmed | in_progress | Worker | Start |
| in_progress | completed | Worker requests, customer confirms | Both explicit |
| requested/negotiating/confirmed | cancelled | Owner or assigned worker | Reason required; frees the window |
| other | rejected | — | Return current state + stable error code |

One request can have several conversations but **only one booking**; when one conversation confirms, the others close as "booked elsewhere". Payment has its own state machine (`docs/06`) and never changes job state.

## 6. Request and availability definition (D-07, D-08)

Request fields: trade, problem summary, optional photo, location (lat/lng + area), `start_at` (now or scheduled), `duration_min` (default 120), urgency, optional budget (PKR).
Eligible = trade matches ∧ distance ≤ 10 km ∧ toggle ON (for ASAP) ∧ inside weekly hours at `start_at` ∧ no overlapping confirmed booking ∧ not the requester. Times are stored as UTC `timestamptz` and shown in Asia/Karachi. Money is integer PKR.

## 7. Seed data (D-16)

Deterministic `npm run db:seed` with a fixed random seed. Names are fictional; phones use a fake pattern (`0300-0000XXX`); emails use `@example.com`. Area centroids are approximate (from OSM at authoring time, commented).
- **Workers (24):** ~5 per trade over ~8 areas. Edge cases that MUST exist: (1) excellent ratings but 14 km away; (2) nearby with toggle OFF; (3) nearby, already booked for the next 2 h; (4) brand new, no reviews; (5) mixed reviews (punctual but pricey); (6) two similar workers differing only by price.
- **Customers (3)** with one-tap demo logins; **demo worker** that starts un-onboarded so judges see O1 live.
- **~45 completed jobs** with reviews (signals + short text; some voice transcripts), several price points per trade. A few seeded payments in `cash_confirmed`/`succeeded(mock)` state so the job history looks real, labelled demo.
- Every seeded row: `is_seeded=true`.

## 8. Edge cases every flow handles

Mic denied (→ tap path) · unusable audio / empty transcript · STT/LLM timeout or 429 (→ fallback) · geolocation denied (→ area picker) · no eligible workers (→ widen radius/time; never fake) · worker declines · double-accept race · offline mid-flow · session expired · language switch mid-flow · long/garbled input · prompt-injection text in transcripts (data, not instructions) · Google/Gmail unavailable (→ demo login) · payment gateway unavailable or callback tampered (→ honest status, cash option) · narrow (360 px) and wide (1440 px) layouts.
