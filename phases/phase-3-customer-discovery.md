# Phase 3 — Customer Discovery (O2)

**Goal:** a customer describes a problem (voice, text, photo or taps) and sees ranked workers who match the trade, are nearby and are **free at the requested time**, with transparent reasons, a map on desktop and an honest "no match".

**Prerequisites:** Phase 2 accepted; D-07, D-08, D-09 confirmed. **Read:** `implementation.md`, `docs/01` (§3 O2, §4, §6, §7), `docs/02` (§3, §5, §6, §7), `docs/04` (AI-03), `docs/11` (rows 07–09).

## Tasks
1. **Domain:** `geo.ts` (Haversine, rounding), `availability.isWorkerFree`, `ranking.ts` + `ranking-config.ts` exactly per `docs/02` §5–§6, with exhaustive unit tests first.
2. **Request (tap path):** `/c/request/new`: trade tiles, a short text box (optional), when chips (Now / This evening / Tomorrow / pick), location (geolocation → area tiles). `POST /api/requests` (Zod; inside the service area).
3. **AI-03 drafting:** voice/text/photo → `/api/ai/draft-request` → draft shown live (desktop side panel; phone below the mic), editable, confirmed by the customer. Photo understanding is behind its own toggle (Should); fallback = trade tiles.
4. **Candidates:** `GET /api/requests/[id]/candidates` → ranked list with `reasons[]` or `no_match` with suggestions (widen radius / change time). Rounded public coordinates only.
5. **Results UI** (Figma 08): desktop list + Leaflet/OSM map (lazy-loaded; attribution; approximate pins; search radius ring); phone list with a Map/List switch. The WorkerCard shows rating with count or "No reviews yet", free time, distance and indicative price. A "Demo data" tag on seeded workers.
6. **Worker profile** `/c/workers/[id]` (Figma 09): stats, signals and the summary area (empty states until Phase 6), typical price (from seeded completed jobs), "Message" (wired in Phase 4).
7. **Worker side:** `/w/home` requests list shows requests where the worker is eligible, with "why you" reasons.
8. **Seed:** ensure edge cases 1, 2, 4, 6 visibly behave (far worker excluded, toggle-off excluded, new worker "No reviews yet", price-only difference explained by reasons).
9. **Tests:** unit (ranking, availability, geo), integration (candidates exclude busy/far/off/non-matching; no_match), E2E request → results on both projects, `AI_MODE=off` path, axe.

## Acceptance
- [ ] Results contain only workers who match trade + radius + window; busy/off/far workers never shown as available
- [ ] Every result shows why it's there; "no match" is honest with next steps
- [ ] Desktop list + map and phone list/map switch match Figma 08; the map can be cut to a list (cut line) without breaking anything
- [ ] All `docs/08` §1 gates pass

## STOP AND ASK
D-07/D-08/D-09 changed · the OSM tile usage policy blocks the demo · photo understanding gives unsafe output.

## Commits
`feat(domain): availability and ranking`, `feat(customer): request and drafting`, `feat(customer): results and map`, `feat(customer): worker profile`, `test: discovery`.
