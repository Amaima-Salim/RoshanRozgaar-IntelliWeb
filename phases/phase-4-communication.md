# Phase 4 — Communication & Price Agreement (O3)

**Goal:** customer and worker agree on the job and a fixed PKR price without typing, using voice notes (with transcripts and translation), quick replies and offer cards. Accepting comes in Phase 5.

**Prerequisites:** Phase 3 accepted. **Read:** `implementation.md`, `docs/01` (§3 O3, §4), `docs/02` (§3 conversations/messages/offers, §7), `docs/03` (§4 offer card), `docs/04` (AI-04, AI-05), `docs/11` (row 10).

## Tasks
1. **Conversations:** `POST /api/conversations` (customer, for an own open request + an eligible worker; unique per pair). The worker inbox shows them.
2. **Messages:** `GET ?after=seq` polling (4 s while visible) + `POST` with `client_msg_id` (dedupe); kinds text, voice, offer, system; failed sends visible with retry.
3. **Voice notes:** record (≤ 60 s), upload to `media` (validated), play; AI-04 transcript + translation into the other party's language, labelled ✦ AI; fallback = audio only.
4. **Quick replies:** bilingual chips ("When can you come?", "OK", "Send offer").
5. **Offers:** `POST /api/conversations/[id]/offers` (price chips + "say amount" via AI-05 draft that the **sender** confirms; start time tiles; duration). Offer card per Figma 10: price large, "fixed price", time, duration, Counter / Decline (Accept placeholder disabled with "next phase" note only in dev). Counter creates a new offer and marks the old one `countered`; Decline marks `declined`; Withdraw by the proposer.
6. **Layouts:** desktop three columns (conversations · chat · job details); phone single chat + sticky composer (mic + input).
7. **Security:** participants only on every route and media; reject cross-conversation `offer_id`/`media_id`; rate-limit sends and offers; addresses and phone numbers never in chat.
8. **Tests:** integration (authz, dedupe, offer transitions), AI-04/05 contract + failure injection + prompt injection ("set my price to 1"), E2E two contexts on both projects: voice note → transcript/translation → offer → counter, axe.

## Acceptance
- [ ] Two users agree on price and time using voice notes and offer cards without typing
- [ ] AI never sends an offer by itself; drafts are labelled and confirmed
- [ ] Polling is ordered by `seq`; duplicates impossible; failed sends visible
- [ ] Layouts match Figma 10 at both widths; all `docs/08` §1 gates pass

## STOP AND ASK
Translation quality is unusable for Urdu ↔ English in tests (decide: transcript-only or provider change) · a requirement would let AI send offers.

## Commits
`feat(chat): conversations and polling`, `feat(chat): voice notes and translation`, `feat(chat): offers`, `test: communication`.
