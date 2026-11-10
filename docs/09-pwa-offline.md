# 09 — PWA and Offline (enhancement)

Read by: Phase 8 (fully); Phase 0 for manifest/icons. **The web app must work fully without a service worker.** PWA adds install and read-only offline viewing, which mainly helps workers on phones with flaky data. Commitments are never queued offline.

## 1. Requirements
HTTPS in production; valid manifest; service worker registered in production only; standalone display; offline fallback page; no horizontal scroll at 360 px.

## 2. Manifest (`/public/manifest.webmanifest`)
`name` "Roshan Rozgar", `short_name` "Rozgar", `lang` "ur", `dir` "auto", `start_url` "/?source=pwa", `scope` "/", `display` "standalone", `background_color` "#ffffff", `theme_color` "#0F6B3E", icons 192/512/maskable-512 (original), shortcuts "I need a worker" → `/c/request/new`, "My work" → `/w/home`. Plus `theme-color` meta, a 180 px Apple touch icon, and a viewport with `viewport-fit=cover`.

## 3. Service worker
Prefer **Serwist** (`@serwist/next`) after checking compatibility with the pinned Next.js; otherwise a small hand-written `/public/sw.js`. Record the choice in `DECISIONS.md`. Versioned caches.

| Request | Strategy |
|---------|----------|
| `/_next/static/*`, fonts, icons | cache-first |
| `/audio/{ur,en}/*` onboarding prompts | cache-first; precache on install |
| Navigations (HTML **and App Router RSC payload requests**) | network-first (3 s) → cached → `/offline` |
| `GET /api/workers/[id]`, `/api/jobs/[id]`, `/api/worker/inbox`, `/api/requests` | stale-while-revalidate, signed-in user's own data only; purged on sign-out/user switch |
| Any `POST/PUT/PATCH/DELETE`, `/api/ai/*`, `/api/auth/*`, `/api/payments/*`, `/api/media/*` | **never cached, never queued** |

`skipWaiting` only after the user taps "Update"; `clients.claim` on activate; delete old caches; never cache responses with `Set-Cookie` or auth errors.

## 4. Offline behavior
| Area | Offline |
|------|---------|
| Shell, fonts, icons, onboarding prompts | Available |
| Previously opened worker cards, own jobs, inbox | Read-only with "Last updated … (offline)" |
| New request, search, chat send, offers, **accept/booking**, transitions, reviews, **payments**, sign-in, AI, voice upload | **Disabled** with "No internet — this needs a connection"; entered input preserved |
| Reconnect | Banner clears; refetch server state **before** any retry; commitments revalidate version/idempotency key |
Detect connectivity with `navigator.onLine` **plus** a failed-fetch signal.

## 5. Install and update UX
Android/Chromium: capture `beforeinstallprompt`; show an "Install app" card after the first successful flow (on phone layouts only; a small link on desktop). iOS: a one-time "Share → Add to Home Screen" hint. Hide when standalone. Update toast: "New version available — Update"; never auto-reload mid-flow.

## 6. OAuth and gateway redirects in an installed PWA
Google sign-in and the JazzCash hosted checkout leave the app and come back. Test both from the **installed** app on the demo phone (Android Chrome). If the return lands in the browser instead of the app, document it and keep the demo on the browser tab. Email OTP and demo login are the fallback for sign-in.

## 7. Verification
DevTools → Application (manifest installable, SW active, cache contents, offline throttling); a real Android install; the airplane-mode procedure in `docs/08` §6.7; results in `docs/pwa-verification.md`. Lighthouse no longer has a PWA score, so rely on these checks.
