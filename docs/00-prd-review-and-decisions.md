# 00 — PRD Review, Traceability, Conflicts, Gaps, Decisions

Read by: Phase 0 (fully). Every phase references the requirement IDs and decision IDs defined here.

## 1. Documents

| Document | What it is | Role |
|----------|-----------|------|
| `Roshan_Rozgar_Problem_Statement.pdf` (3 pp.) | CUI Tech Fest hackathon problem statement; outcome-based | **PRD — authoritative** |
| `SkillConnect.docx` (SRS, 66 pp.) | SRS of a larger, different project (Flutter + React + MongoDB, 9 modules) | Reference only |
| Figma *Roshan Rozgar — Web App (Desktop + Mobile)* | 17 desktop/phone screen pairs + design system | Visual source (`docs/11`) |

## 2. PRD requirements (IDs assigned by this plan)

### 2.1 Outcomes (all five, as one flow, for both roles)
| ID | Requirement |
|----|-------------|
| PRD-O1 | Onboarding: a trade worker creates a complete, useful profile without reading or typing into a conventional sign-up form |
| PRD-O2 | Discovery: a customer finds a suitable worker who is nearby and available at the time of the request |
| PRD-O3 | Communication: customer and worker communicate and agree on the job and the price in a way that suits a user who does not type comfortably |
| PRD-O4 | Booking: a job can be confirmed; the platform stays consistent about which workers are free and which are engaged |
| PRD-O5 | Trust: after the job, the platform captures information that helps the next customer decide |

### 2.2 Other constraints
| ID | Requirement |
|----|-------------|
| PRD-P1 | Design and build a **web-based platform** usable by workers with limited literacy, helping customers find an available worker quickly, giving a reasonable basis for trust |
| PRD-AI1 | AI where it removes a genuine barrier (literacy, language, speed, trust); judges ask what stops working without it |
| PRD-S1 | Pakistani urban setting; Islamabad/Rawalpindi suggested |
| PRD-S2 | Urdu or Roman Urdu input strongly encouraged |
| PRD-S3 | No real users; seeded workers, jobs, reviews expected; README states what is seeded/simulated |
| PRD-S4 | Out of scope: payment processing, identity verification against government databases, native mobile apps; may be mocked |
| PRD-T1 | A web application in a standard browser, **usable on a phone-sized screen** |
| PRD-T2 | Any stack, any AI service; every service listed in README |
| PRD-T3 | AI coding assistants permitted with README disclosure |
| PRD-T4 | Project-specific code written in the hacking window; OSS/UI kits/public data allowed and credited |
| PRD-D1…D4 | Public repo (history after start) · working demo (deployed or local) · README (setup, stack, AI services, seeded/mocked, limitations) · live demo of the full flow across both roles + Q&A |
| PRD-E1 | Weights 30/20/20/15/15; mocks acceptable if disclosed; presenting mocks as working is penalized |
| PRD-E2 | Usability: a low-literacy user completes the worker flow unassisted; **mobile-first layout**, clear feedback, sensible defaults; reliability over feature count |
| PRD-R1 | Register before start; no pre-start work or copied prior code; late submissions not judged |
| PRD-F1 | Map/chat/voice not mandatory; may go deep on one side but all five outcomes for both roles; deployed link optional; generic boilerplate/UI kits fine |

**Reading of PRD-P1 + PRD-T1 + PRD-E2 (D-29):** the product is a **web application** first. It must be fully usable in a desktop browser **and** at phone width. A "mobile-first layout" is achieved by designing every screen's phone layout to the same standard as desktop. A PWA is only an install/offline enhancement.

## 3. SRS details mapped to the PRD

### 3.1 Adopted or adapted
| SRS ref | What we take | Serves | Adaptation |
|---------|--------------|--------|-----------|
| BR-001 | Only workers whose service area + availability cover the request are shown as available | O2 | Seeded city areas |
| BR-005, Table 2.4 | Explicit lifecycle; who may trigger each transition; terminal states final | O4 | Simplified machine (`docs/01` §5) |
| BR-006 | AI never decides; explicit acceptance; acceptance re-checks availability and prevents overlaps | O3, O4 | Offer-accept = booking (D-11) |
| NFR-REL-001, FR-062, FR-072 | Concurrent change: exactly one commits | O4 | Exclusion constraint + transaction + version |
| NFR-REL-003/007 | No success without confirmation; refetch before retry after reconnect | O4 | Idempotency keys; offline commits blocked |
| FR-052–056, FR-064 | Rank by skill, rating, proximity, availability, experience, price; "no match" honestly; alternatives after decline; never auto-assign | O2, O3 | Transparent score with reasons |
| FR-044–046, BR-013 | AI extracts structured details; never invents; unknowns flagged; user confirms; AI content labelled | O1, O3 | Worker profile + job request |
| FR-057, BR-007 | Prices in PKR with a stated basis | O3 | Fixed job price (D-09) |
| FR-065/066 | Chat/voice tied to the job; failed sends visible | O3 | Voice notes, not calls |
| BR-011, FR-075/076 | Only participants of completed jobs review; one per job; 1–5; "no reviews" ≠ zero | O5 | + structured signals (D-10) |
| BR-012 | Minimize disclosure | all | Approximate worker location; address after booking |
| NFR-SEC-001/002/007/009 | Role + ownership authz; upload validation; prompt injection can't override rules | all | `docs/07` |
| NFR-USE-003…008, OE-3 | Text labels not colour-only; confirm amount before commitment; pending/success/failed distinct; correct RTL; works at 360 px | all | `docs/03` |
| OE-5 | Unambiguous timestamps; Asia/Karachi; PKR | O2, O4 | Same |
| CI-001 | Commitments carry a dedup reference | O4, payments | `Idempotency-Key` |

### 3.2 Excluded
Flutter app and React admin dashboard; CNIC OCR, face match, certificate checks (PRD-S4); skill assessments and tiers; organizational hiring; disputes and welfare agents; admin governance; wallet, commission and escrow; live GPS tracking; Firebase OTP; Google Maps (billing); Redis; MongoDB. These may appear in the README only under "Future work".

## 4. Conflicts (PRD wins)

| # | PRD | Other source / team request | Resolution |
|---|-----|-----------------------------|-----------|
| C1 | Web app; native apps out of scope | SRS: Flutter + React admin | Responsive web app; PWA install as an extra |
| C2 | Five outcomes; reliability over feature count | SRS: nine modules | Only the O1–O5 slice + the two team extras |
| C3 | Worker onboarding without a conventional form; ID verification out of scope | SRS: typed forms, CNIC, badges | Voice/tap onboarding; **no identity badge** |
| C4 | Trust = information captured after the job | SRS: credentials before hiring | Review-based trust |
| C5 | Agree on the price | SRS: wallet, commission, fee policy | Price agreed in-app (offer/accept) |
| C6 | Any free tools | SRS: Google Maps / Firebase | Leaflet/OSM; Better Auth |
| C7 | "A job can be confirmed" | SRS: 8-state lifecycle | Two-party consent via offer/accept (D-11) |
| C8 | Urdu or Roman Urdu input encouraged | SRS: Urdu + English | Add Roman Urdu understanding via the LLM |
| C9 | Web app usable on a phone | Earlier plan: phone-PWA-first | **Web-first responsive; PWA is Phase 8 enhancement** (D-29) |
| C10 | "Production-ready" (team brief) | — | Production quality *within the slice*, not production breadth |
| **C11** | **Payment processing out of scope (may be mocked)** | **Team: JazzCash + Easypaisa** | **Sandbox/demo only, labelled "Test mode", after completion, optional, never blocks O1–O5; cut to cash + demo if late (D-26, D-27)** |
| **C12** | **Worker onboarding without a conventional form; ID verification out of scope** | **Team: Google sign-in + Gmail OTP** | **Google is one tap; email OTP is not the default for workers; demo phone keypad stays; sign-in never shown as verification (D-24)** |

## 5. Gaps and ambiguities

| # | Gap | Resolution |
|---|-----|-----------|
| G1 | Event date and deadline unknown | Human supplies |
| G2 | Team size and skills | Human supplies |
| G3 | "For both worker and customer": each outcome from both roles? | D-17: each outcome has a touchpoint for both roles |
| G4 | "Nearby" and "available" undefined | D-07, D-08 |
| G5 | Price expression | D-09 |
| G6 | Acceptable trust information without ID checks | D-10 |
| G7 | Workers rate customers? | D-20 (no) |
| G8 | Seed shape | D-16 |
| G9 | May plan docs exist before the start? | D-14 → ask organizers |
| G10 | Accessibility standard | D-19 |
| G11 | AI-assistant disclosure format | Generous detail in README |
| G12 | Are pre-made Figma designs allowed? | D-22 → ask organizers; disclose |
| G13 | Sandbox credentials and Google/Gmail setup before the start? | D-28 → ask organizers |

## 6. Decision register

Status: **Proposed** (default unless the human changes it) · **Ask** (needs an answer before use).

| ID | Decision | Default | Status |
|----|----------|---------|--------|
| D-01 | Stack | Next.js App Router + TS strict + Tailwind | Proposed |
| D-02 | DB & hosting | Neon Postgres (pooled) + Vercel; Docker Postgres locally | Proposed |
| D-03 | ORM | Drizzle + hand-written SQL for constraints | Proposed |
| D-04 | Realtime | Polling 4 s with row versions | Proposed |
| D-05 | City & trades | Islamabad + Rawalpindi; electrician, plumber, AC technician, carpenter, mechanic | **Ask** |
| D-06 | Languages | Urdu (RTL, default) + English toggle (LTR); Roman Urdu input | **Ask** |
| D-07 | "Nearby" | 10 km radius constant | Proposed |
| D-08 | "Available" | Toggle ON (for ASAP) + inside weekly hours + no overlapping confirmed job for [start, start+duration]; default duration 2 h | Proposed |
| D-09 | Price model | One agreed fixed PKR amount per job via offer/counter; profile shows an indicative rate | Proposed |
| D-10 | Trust signals | Stars 1–5 + four tap signals (on time, quality, fair price, respectful/safe) + optional voice comment; grounded AI summary; jobs completed; repeat customers; **no identity badge**; payment data not used | Proposed |
| D-11 | Booking confirmation | Counterpart's explicit Accept on an offer creates the booking atomically | Proposed |
| D-12 | Demo login | Phone + fixed OTP (disclosed, no SMS) + one-tap demo accounts; always available | Proposed |
| D-13 | Maps | Leaflet + OSM; list fallback | Proposed |
| D-14 | Plan files in repo before start | Keep out of the repo until the start; ask organizers | **Ask** |
| D-15 | AI providers | Gemini free (LLM + vision); Groq Whisper free (STT) → browser Web Speech fallback; pre-generated Urdu audio + browser TTS | Proposed |
| D-16 | Seed | 24 workers (~5 per trade, ~8 areas), 3 customers, 1 un-onboarded demo worker, ~45 completed jobs with reviews, edge cases (`docs/01` §7) | Proposed |
| D-17 | "Both roles" | Every outcome has a visible touchpoint for both roles | Proposed |
| D-18 | Media storage | Postgres `bytea` with size caps | Proposed |
| D-19 | Accessibility | WCAG 2.2 AA where feasible + low-literacy heuristics | Proposed |
| D-20 | Workers rate customers | No (Could) | Proposed |
| D-21 | Visual source | Figma file in `docs/11` | Proposed |
| D-22 | Pre-made Figma designs allowed? | Ask organizers; disclose in README either way | **Ask** |
| D-23 | Auth library | Better Auth on Drizzle (DB sessions) | Proposed |
| D-24 | Sign-in per role | Worker: Google or demo phone (email code under "More"); Customer: Google or email code; demo accounts always | Proposed |
| D-25 | OTP email transport | Gmail SMTP via Nodemailer + App Password on a dedicated project Gmail (~500 emails/day) | Proposed |
| D-26 | Payment providers & modes | JazzCash sandbox (hosted checkout); Easypaisa sandbox if credentials obtained, else labelled demo; cash recorded by both parties; mock provider for tests | **Ask** |
| D-27 | Payment timing & amount | After `completed` only; amount = `jobs.price_pkr` read on the server; full amount once; optional; no advance, escrow, payouts, refunds, commission | Proposed |
| D-28 | External account setup before start (Google OAuth client, Gmail App Password, JazzCash sandbox) | Ask organizers (configuration, not code) | **Ask** |
| D-29 | Platform priority | Web-first responsive (desktop ≥1280, tablet 768–1279, phone 360–767); PWA install/offline is an enhancement | Proposed |
