Project: Roshan Rozgar — web-first, responsive marketplace for skilled trade workers (CUI Tech Fest AI Web Forge).
Read /implementation.md first. Work one phase file at a time. Source of truth: the problem statement (PRD).
Rules: never invent requirements; never fake success states; label all mocks in UI and README; no secrets in repo
(never commit client_secret_*.json or .env.local); TypeScript strict; Zod at boundaries; server-side authz on every route;
every screen has desktop and phone layouts in Urdu (RTL) and English (LTR);
bookings and payments are server-confirmed and never queued offline; payment amounts come only from the server;
payments are sandbox/demo only; sign-in is never identity verification;
AI output is a draft a human confirms — AI never decides price, booking, payment, or trust scores.
Commands: npm run dev | lint | typecheck | test | test:e2e | db:migrate | db:seed | db:reset
Disclose AI coding assistance in README. Small conventional commits.

Note: the plan files (implementation.md, docs/, phases/) are kept outside this repo until the organizers confirm they may be committed (D-14). They live one folder up, in ../ (RoshanRozgaar/).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
