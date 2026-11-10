# Phase 9 — Polish, Documentation, Deployment, Demo Readiness

**Goal:** a judge-ready submission: a truthful README, a reliable deployment plus a local fallback, a rehearsed demo on a laptop + phone, and final QA. **No new features.**

**Prerequisites:** Phase 8 accepted. **Read:** `implementation.md`, `docs/10` (all), `docs/08` (§1, §7, §9), `docs/04` (§7, §9), `docs/11` (§6).

## Tasks
1. **README:** every section of `docs/10` §4 with truthful content: setup from a clean clone; stack with versions; AI services table; "what stops working without AI"; third-party services; **AI coding assistant disclosure** (specific: what Claude/others did, what humans did, that code was reviewed); seeded/simulated/mocked table (demo login, test-mode payments, no ID verification, seeded data, Figma credit); hacking-window statement with the real start time; Known limitations incl. measured `ai:eval` results and Gmail/free-tier caps; credits; future work.
2. **Deployment** per `docs/10` §1A: env vars, migrations + seed, HTTPS, `/api/health`, Google redirect URIs + consent "In production", JazzCash Return URL, each AI feature, PWA install. **Local fallback** per §1B from a fresh clone using only the documented commands.
3. **Demo readiness:** deterministic reset; demo accounts in the README; Demo/Test-mode labels visible; `AI_MODE`/`PAYMENTS_MODE` policy decided and disclosed; optional `/demo` helper page (accounts + script, no secrets); `docs/demo-script.md` adapted from `docs/10` §5 with a fallback per AI feature, for Google sign-in and for the sandbox.
4. **Usability evidence:** the ≥ 3-person non-team phone test (`docs/08` §7), top fixes, `docs/usability-notes.md`.
5. **Final QA:** all gates; full E2E on the deployed URL on both projects; axe; offline test; `npm audit`; remove dead code, TODOs and debug routes (`/dev/components` disabled in production); confirm no secrets in history and no `client_secret_*.json`; `.env.example` complete.
6. **Presentation prep:** `docs/qa-notes.md` from `docs/10` §6 with evidence pointers (tests, files); optional slides.
7. **Submission checklist** (`docs/10` §7) ticked with proof in `docs/submission-checklist.md`.

## Acceptance
- [ ] A teammate who didn't write the code runs the app from the README alone
- [ ] Every PRD deliverable (D1–D4) is satisfied
- [ ] Nothing mocked is described as real anywhere (README, UI, demo script)
- [ ] Two timed rehearsals on a real laptop + phone within the slot
- [ ] All `docs/08` §1 gates pass on the final commit

## STOP AND ASK
Any README claim you can't verify · uncertain start-time/commit statement · an unlabelled mock in the UI.
