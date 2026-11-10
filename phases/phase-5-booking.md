# Phase 5 — Booking & Availability Consistency (O4)

**Goal:** accepting an offer atomically confirms the job and marks the worker engaged for the window, correct under races, replays and reconnects.

**Prerequisites:** Phase 4 accepted; D-11 unchanged. **Read:** `implementation.md`, `docs/01` (§3 O4, §4–§6), `docs/02` (§3–§5, §7), `docs/08` (§4), `docs/03` (§6), `docs/11` (rows 11–13).

## Tasks
1. **`job-machine.ts`** per `docs/01` §5 (pure, exhaustive unit tests).
2. **`acceptOffer`** exactly per `docs/02` §4; route `POST /api/offers/[id]/accept` requires `Idempotency-Key`; 23P01 → `CONFLICT_BOOKED` + alternatives.
3. **Accept UX** (Figma 11): restate worker, price (fixed), time, address note, "payment not needed to book"; Speak; the button label includes the amount; pending → success built from **server data**. Desktop centered panel; phone full screen.
4. **Conflict UX** (Figma 13): a specific message ("booked by someone else a moment ago; nothing confirmed or charged") + next-best alternatives (WorkerCards).
5. **Transitions** `POST /api/jobs/[id]/transition`: `start` (worker), `request-complete` (worker), `confirm-complete` (customer), `cancel` (owner or assigned worker; reason; from requested/negotiating/confirmed). Optimistic `version`; `job_events` for every change.
6. **Job pages** (Figma 12) `/c/job/[id]`, `/w/job/[id]`: status, timeline, role actions, exact address revealed to the worker only now; polling by `version`. Worker dashboard shows the Engaged block.
7. **Availability effects:** candidates exclude engaged windows; cancellation restores them; lazy expiry of stale requested/negotiating after `OFFER_TTL_HOURS`.
8. **Seed:** edge case 3 (nearby worker booked for the next 2 h) with a real job row.
9. **Offline/reconnect:** commit buttons disabled offline; refetch before retry; reuse the idempotency key.
10. **Tests (mandatory):** concurrent double-accept (50 iterations) → one job; replay; accept after withdraw/expire; start vs cancel race; adjacency; engaged worker hidden and restored; raw-SQL overlap rejected; E2E with 2–3 contexts racing on both projects; axe.

## Acceptance
- [ ] Exactly one confirmed job for overlapping windows, enforced by the DB (tested repeatedly)
- [ ] Success shown only after server confirmation; losers see a clear conflict + alternatives
- [ ] Transitions authorized by role and recorded in `job_events`
- [ ] The engaged worker is excluded from overlapping discovery; cancellation frees the window
- [ ] Layouts match Figma 11–13; all `docs/08` §1 gates pass

## Out of scope
Reviews, payments (Phase 7 — **booking must never wait for payment**), GPS tracking.

## STOP AND ASK
D-11 changed · anyone asks for payment before booking.

## Commits
`feat(booking): job machine`, `feat(booking): atomic accept`, `feat(booking): job pages and transitions`, `test: booking consistency`.
