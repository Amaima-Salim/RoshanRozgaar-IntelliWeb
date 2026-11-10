# 11 — Figma Design Handoff

Read by: Phase 0 (fully) and every UI task. Design file: **Roshan Rozgar — Web App (Desktop + Mobile)** — https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3 (file key `4rdF0dDYAHdpGzH9iifJs3`).
Pages: **Cover** · **Design System** (variables, text styles, icons, components) · **Web App — Desktop & Mobile** (17 rows; each row = a 1440×900 desktop frame and a 360×800 phone frame of the same screen).

## 1. Precedence
PRD > behavior in `docs/01`–`docs/06` > Figma visuals > `docs/03` fallback patterns. Accessibility floors (`docs/03` §7) always apply. If Figma shows something out of scope (e.g. a "verified" badge, admin, wallet), do not build it; list it in the phase report.

## 2. Tokens (Figma variables → Tailwind theme in Phase 0)
- **RR Color:** `color/primary #0F6B3E`, `primary-strong`, `primary-soft`, `accent #F2A900`, `accent-soft`, `bg`, `canvas`, `surface`, `border`, `text`, `text-muted`, `on-primary`, `danger`, `danger-soft`, `info`, `info-soft`, `map`, `map-road`.
- **RR Size:** `space/4…48`, `radius/sm 8 · md 12 · lg 16 · xl 24 · pill`, `size/touch-min 48`, `size/button-lg 64`, `breakpoint/mobile 360 · tablet 768 · desktop 1280`, `layout/content-max 1200`.
- **Text styles:** `UR/Hero`, `UR/Display`, `UR/Title` (Noto Nastaliq Urdu); `UR/Label`, `UR/Body`, `UR/Small` (Noto Sans Arabic); `EN/Hero`, `EN/H2`, `EN/Title`, `EN/Body`, `EN/Label`, `EN/Caption` (Inter); `NUM/Large`, `NUM/Medium`.
Map variables to CSS custom properties and Tailwind theme keys with the same names; never hard-code values that have a token.

## 3. Components (Design System page → React components)
Button (Primary/Secondary/Outline/Accent/Danger; props Urdu, English, Icon, Show icon) · Tile, Tile/Selected · Pill/Free, Pill/Engaged · Badge/AI, Badge/Demo, Badge/TestMode · Banner/TestMode, Banner/DemoLogin, Banner/Offline · TopBar (mobile) · NavBar (desktop) · MicButton · SpeakButton · WorkerCard · 37 icons (Lucide-style; use the `lucide-react` equivalents, credited).

## 4. Frame map
| # | Screen | Route | Desktop | Phone |
|---|--------|-------|---------|-------|
| 01 | Landing & role choice | `/` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=2-3) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=2-157) |
| 02 | Sign-in (Google, email code, demo phone) | `/login` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=2-209) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=2-297) |
| 03 | Email code (OTP) | `/login (step 2)` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=2-363) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=2-418) |
| 04 | Worker onboarding — trade step | `/w/onboarding` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=2-461) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=2-638) |
| 05 | Onboarding read-back | `/w/onboarding (confirm)` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=3-431) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=3-519) |
| 06 | Worker dashboard | `/w/home` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=3-594) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=3-707) |
| 07 | Customer new request | `/c/request/new` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=3-754) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=3-858) |
| 08 | Results + map | `/c/request/[id]/results` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=3-919) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=3-1071) |
| 09 | Worker profile & trust | `/c/workers/[id]` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=4-877) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=4-993) |
| 10 | Chat & offer | `/c/chat/[id], /w/chat/[id]` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=4-1074) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=4-1235) |
| 11 | Accept booking | `/c/chat/[id] (accept)` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=4-1333) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=4-1407) |
| 12 | Job page / booked | `/c/job/[id], /w/job/[id]` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=4-1455) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=4-1560) |
| 13 | Conflict + alternatives | `(accept conflict state)` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1184) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1277) |
| 14 | Review | `/c/job/[id]/review` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1354) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1479) |
| 15 | Payment — choose method | `/pay/[jobId]` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1574) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1666) |
| 16 | Payment status | `/pay/status/[paymentId]` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1729) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1809) |
| 17 | English LTR (desktop) · Offline (phone) | `(language toggle) · (offline state)` | [desktop](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1866) | [phone](https://www.figma.com/design/4rdF0dDYAHdpGzH9iifJs3?node-id=5-1905) |

## 5. How to use the Figma connector
1. Fetch the frame pair for the task (`get_design_context` / `get_screenshot` with the node ids above; links use `-`, the API uses `:`).
2. Treat generated code as a **reference**; rebuild with project components, logical Tailwind utilities, i18n keys and ARIA. Never paste absolute-positioned output.
3. Build components first, then screens. One React component per Figma component; variants → props.
4. Compare each finished screen against both frames (desktop 1440 and phone 360) in Urdu, and check the English LTR mirror (row 17 shows the pattern). List remaining differences in the phase report.
5. Export only needed assets (SVG icons, optimized images) into `/public` or `src/assets`; never hotlink Figma URLs.
6. Missing states (loading, error, empty, offline, recording, denied, conflict): derive them from `docs/03` §4 and mark them "derived" in `DECISIONS.md`.
7. Never edit the Figma file unless the human asks.

## 6. Originality and disclosure
Ask the organizers whether pre-made designs are allowed (D-22). Either way, credit the designs in the README (who, when, AI-assisted) along with fonts and icons.
