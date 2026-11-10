# Phase 8 — PWA (enhancement), Offline, Security, Accessibility, Performance

**Goal:** the web app is secure, accessible and fast on a low-end phone **and** on desktop; as an enhancement it can be installed and shows read-only data offline. Nothing in this phase may become a dependency of the main flow.

**Prerequisites:** Phase 7 accepted (or Phase 6 if payments were cut). **Read:** `implementation.md`, `docs/09` (all), `docs/07` (all), `docs/08` (§6–§8), `docs/03` (§2, §7), `docs/11` (row 17).

## Tasks
1. **PWA:** final manifest + original icons; service worker (Serwist preferred, else hand-written) with the strategy table in `docs/09` §3, including App Router RSC navigation requests; **never** cache/queue mutations, AI, auth, payments or media; purge on sign-out/user switch; production-only registration.
2. **Offline UX:** connectivity detection (`onLine` + failed fetch), Offline banner, disabled commit actions with an explanation (incl. payments and sign-in), "Last updated … (offline)", `/offline` page, preserved input, refetch before retry (Figma 17 phone).
3. **Install/update UX:** install card on phone layouts after the first successful flow; iOS hint; hidden when standalone; update toast.
4. **OAuth/gateway in standalone:** test Google sign-in and the JazzCash checkout from the installed app; document the behavior; fall back to the browser tab for the demo if needed.
5. **Security hardening** (`docs/07`): headers + CSP (tiles, Google, sandbox form-action), origin checks, all rate limits, upload tests, media authz, fail-closed config, redacted logging; **every authz cell tested**; secret scan (no `client_secret_*.json`); `npm audit`.
6. **Accessibility:** axe zero serious/critical on all routes × languages × viewports; keyboard pass on desktop; TalkBack smoke test on the phone; focus management; `aria-live`; 200% zoom; reduced motion; a list equivalent for the map.
7. **Urdu/RTL + LTR polish:** native-speaker review of strings; mirrored icons; no clipping at 360; desktop line lengths; record the font choice.
8. **Performance:** budgets in `docs/08` §8 on phone and desktop; lazy map/recording code; image compression; polling paused when hidden.
9. **Real-device verification:** install on Android Chrome over HTTPS; airplane-mode procedure; results in `docs/pwa-verification.md`.
10. **`AI_MODE=off` + `PAYMENTS_MODE=off` pass:** the full flow completes.

## Acceptance
- [ ] The app works fully with the service worker disabled (tested)
- [ ] Installable; opens standalone on a real Android phone; offline shell + read-only data; commitments disabled with clear messages; recovery works
- [ ] No mutation/AI/auth/payment/media response cached (tested)
- [ ] Full authz matrix passes; CSP has no violations on core flows
- [ ] axe clean; keyboard and TalkBack smoke tests pass; budgets met or documented
- [ ] All `docs/08` §1 gates pass

## STOP AND ASK
A caching rule risks serving another user's data · CSP would need a broad loosening · iOS or standalone behavior affects the demo device.

## Commits
`feat(pwa): manifest and service worker`, `feat(pwa): offline ux`, `chore(security): headers and csp`, `fix(a11y): …`, `perf: …`.
