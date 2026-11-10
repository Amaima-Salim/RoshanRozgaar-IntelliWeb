# Phase 2 — Worker Onboarding (O1) + AI Layer v1 + Worker Dashboard

**Goal:** a low-literacy worker creates a complete profile by voice or taps only, with no conventional form, on a phone (and it also works on desktop). Then they manage availability from a dashboard.

**Prerequisites:** Phase 1 accepted (or Phase 0 if the human skips sign-in work). **Read:** `implementation.md`, `docs/01` (§3 O1, §4, §8), `docs/03` (all), `docs/04` (§1–§4, §6), `docs/02` (§3 worker tables), `docs/11` (rows 04–06).

## Tasks (tap path first, then AI)
1. **Tap-only onboarding** `/w/onboarding`: 6 steps (trade tiles; years stepper; area tiles (map optional); rate chips + basis; weekday + time-of-day tiles; optional photo) with progress dots, an audio prompt per step (SpeakButton; pre-generated Urdu/English files in `/public/audio`), back and skip-optional. Desktop: steps rail · question panel · live "profile so far" panel. Phone: one step per screen with a sticky Next.
2. **Read-back + save:** key/value card, Speak, Yes / Change (tap a row to edit); `PUT /api/worker/profile` (Zod) → `onboarding_status='complete'`.
3. **AI layer v1** (`src/lib/ai`): provider interface, `AI_MODE`, timeouts, schemas, fixtures, Groq Whisper STT with Web Speech fallback, Gemini extraction. Routes `/api/ai/transcribe` (multipart, magic bytes, ≤ 2 MB, 0.7–60 s) and `/api/ai/extract-worker-profile` (input: step id + transcript + known profile + allowed area slugs → `WorkerProfileDraft`; unknown → `null`). Rule-based Urdu/Roman Urdu number parser first.
4. **Voice per step:** MicButton states (idle/listening/processing/error) → transcript shown → extracted value pre-selects the tile/stepper → user confirms. Any failure → the tap path, with a short spoken/visual message.
5. **Consent notice** before the first mic use (`docs/04` §6).
6. **Worker dashboard** `/w/home` (Figma 06): big availability toggle (`is_available`), today's schedule (empty state until bookings exist), requests list (empty state; filled in Phase 3), reputation card (empty "No reviews yet"). Desktop 3 columns; phone stacked + BottomTabs.
7. **Customer onboarding** `/c/onboarding`: name (prefilled from Google if present), area (geolocation → area tiles fallback), language; under 30 s.
8. **Tests:** unit (number parser, schemas), AI contract + failure injection, E2E tap-only onboarding on both projects, E2E voice onboarding with fake audio + fixtures (phone), `AI_MODE=off` onboarding, axe.
9. **Docs:** README AI services table (Groq, Gemini, Web Speech, audio-prompt generation tool), consent text, `DECISIONS.md`.

## Acceptance
- [ ] The un-onboarded demo worker completes onboarding with **taps only** and with **voice only** (fixtures), ending complete; no conventional form on any step
- [ ] Unknown spoken values stay empty and are asked again; nothing invented
- [ ] Mic denied / STT down / LLM down → tap path works with clear feedback
- [ ] Availability toggle persists; the dashboard matches Figma 06 at both widths
- [ ] All `docs/08` §1 gates pass

## STOP AND ASK
No Gemini/Groq keys (use fixtures and say so) · audio-prompt generation tool undecided · Figma lacks a needed state and the derivation is unclear.

## Commits
`feat(worker): tap onboarding`, `feat(ai): provider layer and stt`, `feat(worker): voice onboarding`, `feat(worker): dashboard`, `test: onboarding`.
