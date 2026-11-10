# Phase 6 — Trust & Reviews (O5) — completes the five outcomes

**Goal:** after a job, capture structured, honest information that helps the *next* customer decide, and surface it on worker profiles and cards. At the end of this phase **all five outcomes run end to end for both roles on desktop and phone**.

**Prerequisites:** Phase 5 accepted; D-10 confirmed. **Read:** `implementation.md`, `docs/01` (§3 O5, BR-P6/P7/P10, §7), `docs/04` (AI-06, AI-07, §5), `docs/02` (§3 reviews/reputation), `docs/07` (§5), `docs/11` (rows 09, 14).

## Tasks
1. **Review capture** `/c/job/[id]/review` (completed only; Figma 14): big stars, four yes/no tap signals with icons, optional voice/text comment. `POST /api/jobs/[id]/review` (customer of that job; unique; 1–5).
2. **AI-06:** comment → tags (fixed enum) + bilingual summary + flag; shown with AIBadge for confirm/edit (desktop side panel; phone below). Fallback: stars + taps only.
3. **Reputation:** update `worker_reputation` in the same transaction (count, average, Bayesian, signal rates, jobs completed, repeat customers).
4. **AI-07 trust summary:** deterministic stats → LLM phrasing with **every number validated** against the data, else the deterministic template; cached by `summary_review_count`; labelled "AI summary of N real customer reviews".
5. **Surfacing:** worker profile (Figma 09) and WorkerCard: stars + count or "No reviews yet" (never 0 stars), signal percentages, jobs completed, repeat customers, summary, typical price, recent reviews, Demo tags. Worker `/w/profile` + dashboard reputation card with a "how to improve" hint from real signals.
6. **Flagged content:** default per `docs/04` §5; **STOP AND ASK** for the final policy.
7. **Seed:** ~45 completed jobs with reviews (incl. edge case 5) and a few voice transcripts; `is_seeded`.
8. **Tests:** unit (Bayesian, rates, number validation with a deliberately hallucinating fake LLM, "no reviews"), integration (completed only, one per job, owner only, atomic reputation), AI failure injection, **full five-outcome E2E (two contexts) on desktop and phone**, `AI_MODE=off` full flow, axe.

## Acceptance
- [ ] The full flow O1 → O5 passes E2E for both roles on both projects
- [ ] Summaries never contain a number or claim absent from the data
- [ ] Zero reviews → "No reviews yet"; no "verified" badge anywhere
- [ ] Layouts match Figma 09 and 14; all `docs/08` §1 gates pass

## STOP AND ASK
Flagged-review policy · whether to show seeded review counts alongside real ones in the demo.

## Commits
`feat(trust): review capture`, `feat(trust): reputation and summary`, `feat(trust): profile surfacing`, `test: five-outcome e2e`.
