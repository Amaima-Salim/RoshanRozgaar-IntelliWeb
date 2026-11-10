# Phase 7 — Payments: JazzCash (sandbox), Easypaisa (sandbox or demo), Cash

**Goal:** after a job is `completed`, the customer can optionally pay the agreed `jobs.price_pkr` via JazzCash sandbox, Easypaisa (sandbox or labelled demo) or cash. No real money moves; O1–O5 are unaffected.

**Prerequisites:** Phase 6 accepted (five outcomes green); D-26, D-27, D-28 confirmed; a deployed HTTPS URL for sandbox callbacks.
**Read:** `implementation.md`, `docs/06` (all), `docs/00` (C11), `docs/01` (Payment flow, BR-P11), `docs/02` (§3 payments, §7), `docs/07` (§2, §3, §7), `docs/08` (§4 payments), `docs/11` (rows 15–16).

**Human supplies:** JazzCash sandbox Merchant ID, API password, Integrity Salt **and the official integration guide**; Return URL set in the sandbox portal; Easypaisa sandbox kit **or** "ship as demo".

## Tasks
1. **Config + boot guard** per `docs/06` §1 and `docs/02` §8 (sandbox host allow-list).
2. **Domain:** `payment-machine.ts` (exhaustive tests); confirm the `payments` table and indexes from Phase 0.
3. **Adapter + mock provider + amount conversion** (`docs/06` §3); the mock goes through the same verify/update path. **Build mock + cash first**, then sandbox.
4. **Start:** `POST /api/payments` per `docs/06` §5 (owner, completed, `Idempotency-Key`, amount from the server, offline-blocked).
5. **Cash:** `POST /api/jobs/[id]/cash` per role → `cash_confirmed` when both have tapped.
6. **JazzCash sandbox:** hosted checkout fields + secure hash from the guide; return route: verify → inquiry → match amount/ref → idempotent update → redirect to the status page.
7. **Easypaisa:** sandbox per its guide, or the mock under the Easypaisa name with the Demo banner.
8. **UI** (Figma 15–16; both widths): TestMode banner on every payment screen; spoken amount; three methods + Skip; status page with steps and polling; payment pill on job pages; "Paid" only for `succeeded`/`cash_confirmed`.
9. **Security:** CSP `form-action` for the sandbox origin; rate limits; secrets never logged; authz rows from `docs/07` §2.
10. **Tests** per `docs/06` §8 and `docs/08` §4 (integration, boot guard, E2E mock + cash on both projects, `PAYMENTS_MODE=off` unchanged flow); manual sandbox payment on the deployed URL recorded in the README.
11. **Docs:** README "Payments" section, Third-party services, Seeded/mocked (Easypaisa demo if used, mock provider), Known limitations (no refunds/payouts); `DECISIONS.md`.

## Acceptance
- [ ] After completion: JazzCash sandbox / Easypaisa (sandbox or demo) / cash all work, with "Test mode" in both languages on every payment screen
- [ ] "Paid" only after verified callback + inquiry or both cash taps; the client can't set or alter the amount; tampered/replayed callbacks change nothing
- [ ] `PAYMENTS_MODE=off` → five outcomes unchanged; payment blocked offline
- [ ] All `docs/08` §1 gates pass

## Cut line
If late: ship **cash + mock** only, mark the sandbox as "not completed" under Known limitations. That is PRD-compliant.

## STOP AND ASK
Guide/credentials missing or ambiguous (fields, order, hash, amount format) · sandbox requires real KYC/CNIC/wallet · any requirement that would make booking or review wait for payment.

## Commits
`feat(payments): machine, adapter, mock, cash`, `feat(payments): jazzcash sandbox`, `feat(payments): ui`, `test(payments): integrity`, `docs: payments disclosure`.
