# 06 — Payments: JazzCash (sandbox), Easypaisa (sandbox or demo), Cash

Read by: Phase 7 (all), Phase 0 (§3 schema), Phase 8 (§6). **PRD-S4 puts payment processing out of scope; this is a disclosed extra (C11).**

## 1. Non-negotiable rules

1. **No real money.** Only `PAYMENTS_MODE=off|mock|sandbox`. The app refuses to boot if the mode has any other value or a payment base URL is not on the sandbox allow-list.
2. **After completion, optional.** Payment starts only when `jobs.status='completed'`. Review and trust never wait for it ("Skip for now" is always available). Booking never waits for it.
3. **Server-side amount.** The amount is read from `jobs.price_pkr`; request bodies cannot carry an amount (unknown fields rejected).
4. **Labelled everywhere.** "Test mode — no real money moves" (sandbox) or "Demo — not a real JazzCash/Easypaisa payment" (mock), in Urdu and English, on every payment screen; the README says the same.
5. **Hosted checkout only.** The app never collects wallet PINs, CNIC digits or card numbers.
6. **AI never touches payments.**
7. **Cut line:** if late, ship **cash + mock** only (PRD-compliant as a disclosed mock).

## 2. Providers

| Provider | Mode | Notes |
|----------|------|-------|
| JazzCash | sandbox | Hosted checkout (page redirection). Free sandbox registration on JazzCash's sandbox portal; Merchant ID, API password (not the portal login), Integrity Salt; Return URL `APP_URL/api/payments/jazzcash/return`. Approval can take time, so register early |
| Easypaisa | sandbox **or** mock | Sandbox access usually needs a merchant agreement. Without credentials it ships as the mock provider under the Easypaisa name with the Demo banner |
| Cash | recorded | Worker taps "Cash received", customer taps "I paid cash" → `cash_confirmed` ("Cash — reported by both", never "verified") |
| Mock | mock | `/pay/mock/[id]` with "Simulate success/failure" (labelled DEMO), posting to `/api/payments/mock/return` through the **same** verify/update path; used by E2E |

**Endpoint paths, field names, field order, amount format and hash rules come only from the official integration guides the human supplies.** Keep base URLs and paths in env. If a guide is missing or ambiguous: **STOP AND ASK**.

## 3. Adapter (`src/lib/payments`)

```ts
interface PaymentProvider {
  id: 'jazzcash' | 'easypaisa' | 'mock';
  createCheckout(p: Payment): Promise<{ actionUrl: string; fields: Record<string, string> }>;
  verifyCallback(raw: unknown): Promise<{ txnRef: string; ok: boolean; code: string; amountPkr: number }>;
  inquire(txnRef: string): Promise<{ status: 'succeeded' | 'failed' | 'pending'; code: string; amountPkr: number }>;
}
```
`amount.ts` converts integer PKR to each gateway's format in one tested function.

## 4. State machine (`domain/payment-machine.ts`)

```
gateway:  created → pending → succeeded | failed | cancelled | expired
cash:     created → cash_reported_worker | cash_reported_customer → cash_confirmed
```
Terminal states are final; transitions use `version`. DB: at most one `pending` and one successful payment per job (`docs/02` §3). "Paid" shows only for `succeeded` or `cash_confirmed`. A `pending` payment older than the timeout becomes `expired` only after an inquiry confirms it unpaid; otherwise it stays pending with "Check again".

## 5. Flows

**Start** `POST /api/payments {jobId, provider}` + `Idempotency-Key`: the job's customer only, `completed` only; creates `pending`; returns `{actionUrl, fields}`. The client auto-submits a hidden form with a visible "Continue to JazzCash" fallback button. Blocked offline.

**Return/callback** `POST /api/payments/jazzcash/return` (public, rate-limited, CSRF-exempt with a strict content-type check):
1. Verify the secure hash per the guide. Invalid → 400, payment unchanged, security log line (no secrets).
2. **Confirm with the transaction-inquiry API.** Never trust the return payload alone.
3. Check amount and `txn_ref` against our row. Mismatch → `failed` + security log line.
4. Update idempotently (a replay on a final payment does nothing).
5. Redirect to `/pay/status/[id]`, which reads and polls server status. **Never trust query parameters for success.**

## 6. Security

Secrets are server-only and never logged (no salts, hashes or passwords in logs). CSP `form-action` allows only the configured sandbox gateway origin. Payment routes are never cached or queued by the service worker. Authz: start = job's customer; read status = job participants; cash tap = matching role; callbacks = verified gateway only.

## 7. UI (Figma 15, 16)

Desktop: amount summary card (spoken amount) beside the method list. Phone: amount card + three big buttons + "Skip for now" in the footer. Result: ✓ paid / ⏳ waiting (with steps: gateway page done → server verifying → paid) / ✗ failed with "Try again" or "Pay cash instead". A payment-status pill appears on both job pages.

## 8. Tests

Unit: hash build/verify (the guide's sample values if provided; otherwise say so in the test name), amount conversion, state machine. Integration (real Postgres): tampered amount/ref/bad hash rejected; replay idempotent; concurrent starts → one pending; second success impossible; non-owner → `FORBIDDEN`; not completed → `CONFLICT_STATE`; amount in body → `VALIDATION`. Boot test: non-sandbox URL/mode refuses to start. E2E (`PAYMENTS_MODE=mock`) on desktop and phone: complete → mock success → "Paid", and the review still works; failure → cash → both tap → "Cash — reported by both". `PAYMENTS_MODE=off`: no payment UI and O1–O5 unchanged. Manual: one JazzCash sandbox payment on the deployed URL, recorded in the README with date and result (failures included).
