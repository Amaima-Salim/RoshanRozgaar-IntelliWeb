# 03 — UX, Responsive Layout, Low-Literacy Rules, Accessibility

Read by: Phases 0–4 (fully), 8 (§7). Visual specifics come from Figma (`docs/11`). This file is authoritative for **behavior, responsiveness, language/RTL and accessibility floors**, and supplies fallback patterns where Figma is silent.

## 1. Principles

1. **Web-first, phone-perfect.** Each route is one responsive page. Desktop uses space for context (side panels, list + map); the phone layout keeps one task per screen.
2. **Speak, tap, then type.** Every input offers voice and big tap choices; typing is optional and never the only path for workers.
3. **Show, then confirm.** Anything AI produced is shown back (and can be read aloud) for an explicit Yes / Change.
4. **Honest states.** Pending, success, failed, offline and "demo" are visibly different and never faked.
5. **Bilingual by default.** An Urdu label with a small English caption on key actions; the language toggle switches the primary language and direction.

## 2. Breakpoints and layout (Tailwind theme; tokens from Figma)

| Name | Width | Chrome | Content |
|------|-------|--------|---------|
| Phone | 360–767 | `TopBar` (title + back + language) + **sticky footer actions**; `BottomTabs` for main sections (worker: Work / Messages / Profile; customer: Find / Bookings / Messages) | Single column, 16 px gutters, footer holds the primary action |
| Tablet | 768–1279 | `NavBar` | Single column max 720, or two columns where the desktop has three |
| Desktop | ≥1280 | `NavBar` (logo on the reading-start side, links, bell, language, avatar) | Centered container max 1200; 2–3 columns (e.g. chat: conversations · chat · job details; results: list · map; onboarding: steps · question · live profile) |

Rules: no horizontal scroll at 360 px; touch targets ≥ 48 px (buttons 56–64 px); the primary action is always visible without scrolling on phone (sticky footer); desktop never stretches text lines beyond ~80 characters; modals become full screens on phone.

## 3. Language, RTL and type

- `<html lang dir>` follows the language: Urdu → `dir="rtl"`, English → `dir="ltr"`. Use only **logical** utilities (`ms-/me-/ps-/pe-/start/end`). Mirror directional icons (back chevrons) and layouts; never mirror numbers, phone numbers or brand logos.
- Fonts (self-hosted): **Noto Nastaliq Urdu** for Urdu headings (line-height ≥ 1.9), **Noto Sans Arabic** for Urdu UI/body text (Nastaliq is hard to read small), **Inter** for English and numerals. Test on a real low-end Android phone and record in `DECISIONS.md`.
- Western digits everywhere; currency `Rs 1,500`; times in Asia/Karachi, 12-hour with AM/PM.
- Roman Urdu input is accepted wherever text or speech is accepted; the AI normalizes it.

## 4. Component patterns (Figma components in parentheses)

- **Button** (Button: Primary/Secondary/Outline/Accent/Danger): Urdu label + English caption, optional icon; loading state keeps the width; disabled state explains why (tooltip on desktop, helper text on phone).
- **Tile** (Tile, Tile/Selected): icon + Urdu + English; used instead of form fields; selected state with a 3 px primary border **and** a check icon (not colour alone).
- **MicButton:** idle / listening (pulsing ring, "tap to stop") / processing ("سمجھ رہے ہیں… / Understanding…") / error ("سنائی نہیں دیا — دوبارہ یا ٹیپ کریں"). Hold-to-talk is optional; tap-to-start/tap-to-stop is the default.
- **SpeakButton:** plays the pre-generated prompt or TTS; hidden if no audio is available.
- **Pills/Badges:** Free, Engaged, AI summary, Demo data, Test mode. AI and demo badges are mandatory wherever that content appears.
- **Banners:** TestMode (payments), DemoLogin (phone OTP), Offline.
- **WorkerCard:** name (Urdu + English), avatar initial, indicative price, reasons chips (rating with count or "No reviews yet", free time, distance). Desktop: in a list beside the map; phone: full width.
- **Offer card:** price large, "fixed price" basis, time + duration, Accept (amount in label) / Counter / Decline.
- **Read-back card:** key/value rows + Speak + Yes / Change.
- **States:** loading skeletons, empty states with a next step, errors with a retry and a non-AI path, conflict screens with alternatives. If Figma lacks a state, derive it from these patterns and mark it "derived" in `DECISIONS.md`.

## 5. Worker flow rules (PRD-E2: completable unassisted by a low-literacy user)

- One question per step; an audio prompt auto-offered (not auto-played without a gesture); icons on every choice; progress shown as numbered dots, not text.
- Never require reading to continue: every step can be completed by tapping tiles or speaking.
- Always a visible way back, and "say it again".
- The read-back screen is spoken on request and editable by tapping a row.
- Errors are spoken and shown with an icon; no red-only signals.

## 6. Customer flow rules

- The request draft is visible while speaking (desktop side panel; phone below the mic) and editable.
- Results always show *why* each worker is listed; busy or far workers are never shown as "available".
- The accept screen restates worker, price (fixed), time and address handling before the commitment button, whose label includes the amount.

## 7. Accessibility floors (D-19)

WCAG 2.2 AA where feasible: contrast ≥ 4.5:1 for text; focus visible; keyboard operable on desktop (tab order follows reading direction); `aria-live` for processing, AI and payment status; labels on icon-only buttons; `prefers-reduced-motion`; 200% zoom without loss; screen-reader names in the current language. axe: zero serious/critical issues on every route in both languages and both viewports.

## 8. Demo-readiness UX

One-tap demo accounts on `/login`; a visible "Demo data" tag on seeded content; the language toggle on every screen; "Test mode" on payments; a fast reset (`npm run db:reset && npm run db:seed`).
