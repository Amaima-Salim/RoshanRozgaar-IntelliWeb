# 04 — AI Features (barrier-removing only)

Read by: Phases 2, 3, 4, 6. PRD-AI1: AI must remove a real barrier (literacy, language, speed, trust). Judges ask what stops working without it (§9).

## 1. Rules for every AI feature

1. **Provider-abstracted:** `src/lib/ai/index.ts` exposes task functions (`transcribe`, `extractWorkerProfile`, `draftRequest`, `translate`, `draftOffer`, `summarizeReview`, `phraseTrustSummary`). Providers sit behind them (Gemini, Groq, browser fallbacks, fixtures).
2. **Modes:** `AI_MODE=live|fixtures|off`. `fixtures` replays recorded outputs and shows a persistent "Simulated AI" badge. `off` hides AI affordances and uses tap/typed paths.
3. **Every call:** timeout (`AI_TIMEOUT_MS`, default 8 s) → Zod schema validation → on any failure, the non-AI fallback. The UI never hangs; it shows "processing" immediately.
4. **AI drafts, humans decide:** outputs are labelled (AIBadge), shown back and confirmed. AI never books, sets or sends a price, starts or confirms a payment, or writes a trust score (BR-P3).
5. **Never invent:** unknown fields stay `null` and are asked again; numbers in summaries are validated against the data.
6. **Inputs are data:** transcripts, chat, comments and images are delimited in prompts, which instruct the model to ignore instructions inside them (`docs/07` §6).
7. **Minimum data:** never send names, phone numbers, emails or exact addresses to providers.
8. **Free tiers only.** Gemini's free tier may use submitted data to improve Google's products, so the demo uses fictional data and team voices only; the README says so.

## 2. Providers (D-15)

| Task | Primary | Fallback 1 | Fallback 2 |
|------|---------|-----------|-----------|
| Speech-to-text (Urdu/Roman Urdu/English) | Groq Whisper (free tier) | Browser Web Speech API (`ur-PK`, Chromium; needs network) | Tap/typed path |
| LLM extraction, translation, summaries | Gemini (free tier), JSON mode + schema | Rule-based parsers where feasible (numbers, trades) | Tap/typed path; deterministic templates |
| Image understanding (problem photo) | Gemini vision | — | Trade tiles |
| Spoken prompts | Pre-generated Urdu/English audio files (tool disclosed in README) | Browser `speechSynthesis` if a voice exists | Text + icons |

## 3. Features

| ID | Feature | Barrier removed | Input → output | Fallback |
|----|---------|-----------------|----------------|----------|
| AI-01 | Speech-to-text | Literacy, typing | Audio (≤ 60 s) → transcript + language | Web Speech → tap path |
| AI-02 | Worker profile extraction | Literacy (no forms) | Step id + transcript (+ answers so far, allowed areas) → `WorkerProfileDraft` (trade, years, areas, rate + basis, schedule; `null` when unsure) | Tile/stepper answers |
| AI-03 | Request drafting (voice/text/photo) | Typing, describing a technical problem | Transcript/text/photo → `RequestDraft` (trade, summary ur/en, urgency, when) | Trade tiles + when chips |
| AI-04 | Voice-note transcript + translation | Typing; Urdu ↔ English | Voice note → transcript + translation into the other party's language | Play audio only; quick-reply chips |
| AI-05 | Offer drafting from speech | Typing numbers and terms | "do hazar, teen baje" → draft `{price_pkr, start_at, duration_min}` for the **sender** to confirm | Price chips + time tiles |
| AI-06 | Review comment → tags + summary | Typing reviews; trust | Voice/text comment → `{tags[] (fixed enum), sentiment, summaryEn, summaryUr, flagged}`; customer confirms | Stars + taps only |
| AI-07 | Trust summary phrasing | Trust, reading many reviews | Deterministic stats + up to N confirmed comments → 2-sentence bilingual summary; **every number validated** else deterministic template | Deterministic template |

Each feature has: a Zod schema in `lib/ai/schemas`, a prompt in `lib/ai/prompts`, recorded fixtures in `lib/ai/fixtures`, contract tests, failure-injection tests and a prompt-injection corpus test (`docs/08`).

## 4. Worker onboarding specifics (AI-01 + AI-02)

Per step: record → transcribe → extract only that step's field → show the value on the step and in the live profile panel (desktop) → continue. Numbers spoken in Urdu/Roman Urdu ("aath saal", "pandrah sau") are parsed by a small rule-based parser first and by the LLM second. Areas must match allowed `areas.slug`; anything else stays `null` and the area tiles are offered.

## 5. Trust specifics (AI-06 + AI-07)

Flagged content (unsafe/abusive) is excluded from public summaries; stars and signals are kept; the flag is stored. The final policy is STOP AND ASK in Phase 6. The summary label always states the review count: "AI summary of N real customer reviews".

## 6. Consent and privacy

Before first mic use: a short spoken and written notice of what is recorded, which providers process it, and how long it is kept. The same applies before AI processes a photo. Acknowledgements are stored per session.

## 7. Evaluation (`npm run ai:eval`)

A small labelled set (team-recorded Urdu/Roman Urdu clips, ~20 per task) measures STT word accuracy and extraction field accuracy. The results table goes in the README under Known limitations.

## 8. Rate limits

Per user per day plus burst limits on `/api/ai/*`. On provider 429, fall back immediately; never retry in a loop.

## 9. What stops working if the AI is removed (README table)

| Without AI… | Effect |
|-------------|--------|
| AI-01/02 | Workers must use tiles for everything; spoken answers are not understood, so onboarding is slower and less natural for low-literacy users |
| AI-03 | Customers must know which trade fits their problem; photos can't be understood |
| AI-04 | Urdu speakers and English typists can't understand each other's voice notes |
| AI-05 | Offers must be built by tapping chips instead of just saying the price |
| AI-06/07 | Customers must read raw reviews; spoken reviews can't be captured as structured trust signals |
