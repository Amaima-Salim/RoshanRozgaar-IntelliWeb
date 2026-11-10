"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/lib/i18n/client";

type Role = "worker" | "customer";
type ErrorCode =
  | "EMAIL_SEND_FAILED"
  | "INVALID_EMAIL"
  | "RESEND_TOO_SOON"
  | "INVALID_OTP"
  | "OTP_EXPIRED"
  | "TOO_MANY_ATTEMPTS"
  | "RATE_LIMITED"
  | "NETWORK"
  | "UNKNOWN";
const CODES: readonly string[] = [
  "EMAIL_SEND_FAILED",
  "INVALID_EMAIL",
  "RESEND_TOO_SOON",
  "INVALID_OTP",
  "OTP_EXPIRED",
  "TOO_MANY_ATTEMPTS",
] satisfies ErrorCode[];
type Err = { code: ErrorCode; retryAfter?: number };

const EXPIRY_MINUTES = 10;
const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function post(path: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(`/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false as const, error: { code: "NETWORK" } as Err };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true as const, json };
  const raw = typeof json.code === "string" ? json.code : "";
  const code: ErrorCode = CODES.includes(raw)
    ? (raw as ErrorCode)
    : res.status === 429
      ? "RATE_LIMITED"
      : "UNKNOWN";
  return {
    ok: false as const,
    error: { code, retryAfter: typeof json.retryAfter === "number" ? json.retryAfter : undefined },
  };
}

/** Email code entry: address → 6 boxes with expiry and resend timer (Figma 03). */
export function EmailOtpPanel({
  devNote,
  onSignedIn,
}: {
  devNote: boolean;
  onSignedIn: (role: Role | null) => void;
}) {
  const { t, bi } = useI18n();
  const emailId = useId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Err | null>(null);
  const [resend, setResend] = useState(0);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resend <= 0) return;
    const timer = setTimeout(() => setResend((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resend]);

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await post("/email-code/send", { email: email.trim() });
    setBusy(false);
    // "Code sent" is shown only after the server confirmed SMTP accepted the message.
    if (res.ok) {
      setResend(RESEND_SECONDS);
      setStep("code");
      setDigits(Array(6).fill(""));
      return;
    }
    if (res.error.code === "RESEND_TOO_SOON") {
      setResend(res.error.retryAfter ?? RESEND_SECONDS);
      setStep("code");
      return;
    }
    setError(res.error);
  };

  const verify = async (code: string) => {
    setBusy(true);
    setError(null);
    const res = await post("/sign-in/email-otp", { email: email.trim(), otp: code });
    if (res.ok) {
      const user = res.json.user as { role?: string | null } | undefined;
      onSignedIn(user?.role === "worker" || user?.role === "customer" ? user.role : null);
      return;
    }
    setBusy(false);
    setError(res.error);
    setDigits(Array(6).fill(""));
    boxes.current[0]?.focus();
  };

  const setDigit = (i: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      // Paste or autofill of the whole code.
      const next = clean.slice(0, 6).split("");
      setDigits(Array.from({ length: 6 }, (_, k) => next[k] ?? ""));
      if (next.length === 6) void verify(next.join(""));
      else boxes.current[next.length]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) boxes.current[i + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  };

  const errorText = error
    ? error.code === "EMAIL_SEND_FAILED"
      ? `${t("login.errors.EMAIL_SEND_FAILED")} ${t("login.emailFailedAlt")}`
      : t(`login.errors.${error.code}`, { attemptsLeft: 0 })
    : null;
  const lockedOut = error?.code === "TOO_MANY_ATTEMPTS" || error?.code === "OTP_EXPIRED";

  return (
    <div className="flex flex-col gap-4">
      {step === "email" ? (
        <>
          <label htmlFor={emailId} className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{t("login.emailLabel")}</span>
            <span className="text-sm text-text-muted">{t("login.emailHint")}</span>
          </label>
          <input
            id={emailId}
            dir="ltr"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error?.code === "INVALID_EMAIL" || undefined}
            className="h-14 rounded-lg border-2 border-border bg-surface px-4 text-lg focus:border-primary"
            data-testid="email-input"
          />
          <Button
            size="lg"
            fullWidth
            loading={busy}
            disabled={!EMAIL_RE.test(email.trim())}
            onClick={send}
            data-testid="send-email-code"
            {...bi("login.sendEmailCode")}
          />
        </>
      ) : (
        <>
          <p className="flex flex-col gap-1" aria-live="polite">
            <span className="text-lg font-semibold" data-testid="email-sent">
              {t("login.emailSentTo", { email: email.trim() })}
            </span>
            <span className="text-sm text-text-muted">
              {t("login.emailExpiry", { minutes: EXPIRY_MINUTES })}
              {devNote ? ` ${t("login.emailDevNote")}` : ""}
            </span>
          </p>
          <div
            dir="ltr"
            className="flex justify-center gap-2"
            role="group"
            aria-label={t("login.codeLabel")}
          >
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxes.current[i] = el;
                }}
                value={d}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={t("login.emailCodeBox", { n: i + 1 })}
                disabled={busy || lockedOut}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                }}
                className="num size-12 rounded-lg border-2 border-border bg-surface text-center text-2xl focus:border-primary sm:size-14"
                data-testid={`otp-box-${i}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              className="min-h-touch font-medium text-primary underline"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              {t("login.changeEmail")}
            </button>
            {resend > 0 ? (
              <span className="text-text-muted" aria-live="polite">
                {t("login.resendIn", { seconds: resend })}
              </span>
            ) : (
              <button
                type="button"
                className="min-h-touch font-medium text-primary underline"
                onClick={send}
                data-testid="resend-email-code"
              >
                {t("login.resend")}
              </button>
            )}
          </div>
        </>
      )}
      <p
        role="alert"
        aria-live="assertive"
        className={cn("min-h-6 font-semibold text-danger", !errorText && "sr-only")}
        data-testid="email-error"
      >
        {errorText}
      </p>
    </div>
  );
}
