"use client";

import { CircleUserRound, Hammer, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/lib/i18n/client";
import { Keypad } from "./Keypad";

type Role = "worker" | "customer";
type DemoAccount = { name: string; nameUr: string; phone: string; role: Role };
type Step = "phone" | "code";

const LOGIN_ERRORS = [
  "INVALID_PHONE",
  "RESEND_TOO_SOON",
  "OTP_NOT_FOUND",
  "OTP_EXPIRED",
  "INVALID_OTP",
  "TOO_MANY_ATTEMPTS",
  "RATE_LIMITED",
  "NETWORK",
  "UNKNOWN",
] as const;
type LoginError = (typeof LOGIN_ERRORS)[number];
type ErrorState = { code: LoginError; attemptsLeft?: number; retryAfter?: number };

type CallResult<T> = { ok: true; data: T } | { ok: false; error: ErrorState };

async function call<T>(path: string, body: unknown): Promise<CallResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { code: "NETWORK" } };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: json as T };
  const rawCode =
    typeof json.code === "string" ? json.code : res.status === 429 ? "RATE_LIMITED" : "UNKNOWN";
  // Zod failures on the phone field come back as VALIDATION_ERROR from Better Auth.
  const code: LoginError = (LOGIN_ERRORS as readonly string[]).includes(rawCode)
    ? (rawCode as LoginError)
    : rawCode === "VALIDATION_ERROR"
      ? "INVALID_PHONE"
      : "UNKNOWN";
  return {
    ok: false,
    error: {
      code,
      attemptsLeft: typeof json.attemptsLeft === "number" ? json.attemptsLeft : undefined,
      retryAfter: typeof json.retryAfter === "number" ? json.retryAfter : undefined,
    },
  };
}

function safeNext(next: string | null, role: Role | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  if (role === "worker" && next.startsWith("/w/")) return next;
  if (role === "customer" && next.startsWith("/c/")) return next;
  return null;
}

const formatPhone = (digits: string) =>
  digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;

export function LoginPanel({
  role,
  next,
  demoCode,
  demoAccounts,
}: {
  role: Role;
  next: string | null;
  demoCode: string;
  demoAccounts: DemoAccount[];
}) {
  const { t, bi, lang } = useI18n();
  const router = useRouter();
  const phoneId = useId();
  const codeId = useId();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);

  // Counts down the resend wait one second at a time (no clock reads during render).
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const finish = (userRole: Role | null) => {
    const target = userRole
      ? (safeNext(next, userRole) ?? (userRole === "worker" ? "/w/home" : "/c/request/new"))
      : "/";
    router.replace(target);
    router.refresh();
  };

  const send = async (forPhone: string) => {
    const res = await call<{ expiresIn: number }>("/demo-phone/send", { phone: forPhone });
    if (res.ok) {
      setResendSeconds(60);
    }
    return res;
  };

  const verify = async (forPhone: string, forCode: string) =>
    call<{ ok: true; role: Role | null }>("/demo-phone/verify", { phone: forPhone, code: forCode });

  const onSend = async () => {
    setBusy(true);
    setError(null);
    const res = await send(phone);
    setBusy(false);
    if (res.ok || res.error.code === "RESEND_TOO_SOON") {
      // A code already sent less than a minute ago is still valid: go straight to entry.
      if (!res.ok && res.error.retryAfter) setResendSeconds(res.error.retryAfter);
      setStep("code");
      setCode("");
    } else {
      setError(res.error);
    }
  };

  const onVerify = async () => {
    setBusy(true);
    setError(null);
    const res = await verify(phone, code);
    if (res.ok) {
      finish(res.data.role);
      return;
    }
    setBusy(false);
    setError(res.error);
    setCode("");
    if (
      res.error.code === "TOO_MANY_ATTEMPTS" ||
      res.error.code === "OTP_EXPIRED" ||
      res.error.code === "OTP_NOT_FOUND"
    ) {
      setResendSeconds(0);
    }
  };

  const onDemo = async (account: DemoAccount) => {
    setBusy(true);
    setError(null);
    setPhone(account.phone);
    const sent = await send(account.phone);
    if (!sent.ok && sent.error.code !== "RESEND_TOO_SOON") {
      setBusy(false);
      setError(sent.error);
      return;
    }
    const res = await verify(account.phone, demoCode);
    if (res.ok) {
      finish(res.data.role);
      return;
    }
    setBusy(false);
    setError(res.error);
  };

  const errorText = error
    ? t(`login.errors.${error.code}`, { attemptsLeft: error.attemptsLeft ?? 0 })
    : null;
  const phoneValid = /^03\d{9}$/.test(phone);
  const visibleAccounts = demoAccounts.filter((a) => a.role === role);

  const editDigits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <section
        aria-labelledby="login-title"
        className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 md:p-8"
      >
        <div className="flex flex-col gap-3">
          <h1 id="login-title" className="text-2xl font-bold">
            {t("login.title")}
          </h1>
          <nav
            aria-label={t("login.title")}
            className="grid grid-cols-2 gap-2 rounded-pill bg-canvas p-1"
          >
            {(["worker", "customer"] as const).map((r) => (
              <Link
                key={r}
                href={`/login?role=${r}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
                aria-current={r === role ? "page" : undefined}
                replace
                className={cn(
                  "flex min-h-touch items-center justify-center gap-2 rounded-pill font-semibold",
                  r === role ? "bg-surface text-primary shadow-sm" : "text-text-muted",
                )}
              >
                {r === "worker" ? (
                  <Hammer aria-hidden className="size-5" />
                ) : (
                  <CircleUserRound aria-hidden className="size-5" />
                )}
                {t(r === "worker" ? "login.workerTab" : "login.customerTab")}
              </Link>
            ))}
          </nav>
        </div>

        <Banner kind="demoLogin" />

        {step === "phone" ? (
          <div className="flex flex-col gap-4">
            <label htmlFor={phoneId} className="flex flex-col gap-1">
              <span className="text-lg font-semibold">{t("login.phoneLabel")}</span>
              <span className="text-sm text-text-muted">{t("login.phoneHint")}</span>
            </label>
            <input
              id={phoneId}
              dir="ltr"
              inputMode="numeric"
              autoComplete="tel-national"
              value={formatPhone(phone)}
              onChange={(e) => setPhone(editDigits(e.target.value, 11))}
              aria-invalid={error?.code === "INVALID_PHONE" || undefined}
              className="num h-16 rounded-lg border-2 border-border bg-surface px-4 text-center text-2xl tracking-wider focus:border-primary"
              data-testid="phone-input"
            />
            <Keypad
              onDigit={(d) => setPhone((p) => editDigits(p + d, 11))}
              onDelete={() => setPhone((p) => p.slice(0, -1))}
              onClear={() => setPhone("")}
            />
            <Button
              size="lg"
              fullWidth
              loading={busy}
              disabled={!phoneValid}
              onClick={onSend}
              data-testid="send-code"
              {...bi("login.sendCode")}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label htmlFor={codeId} className="flex flex-col gap-1">
              <span className="text-lg font-semibold">{t("login.codeLabel")}</span>
              <span className="text-sm text-text-muted">
                {t("login.codeHintDemo", { code: demoCode })}
              </span>
            </label>
            <input
              id={codeId}
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(editDigits(e.target.value, 6))}
              className="num h-16 rounded-lg border-2 border-border bg-surface px-4 text-center text-3xl tracking-[0.5em] focus:border-primary"
              data-testid="code-input"
            />
            <Keypad
              onDigit={(d) => setCode((c) => editDigits(c + d, 6))}
              onDelete={() => setCode((c) => c.slice(0, -1))}
              onClear={() => setCode("")}
            />
            <Button
              size="lg"
              fullWidth
              loading={busy}
              disabled={code.length !== 6}
              onClick={onVerify}
              data-testid="verify-code"
              {...bi("login.verify")}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="min-h-touch font-medium text-primary underline"
                onClick={() => setStep("phone")}
              >
                {t("login.changeNumber")}
              </button>
              {resendSeconds > 0 ? (
                <span className="text-text-muted" aria-live="polite">
                  {t("login.resendIn", { seconds: resendSeconds })}
                </span>
              ) : (
                <button
                  type="button"
                  className="min-h-touch font-medium text-primary underline"
                  onClick={onSend}
                >
                  {t("login.resend")}
                </button>
              )}
            </div>
          </div>
        )}

        <p
          role="alert"
          aria-live="assertive"
          className={cn("min-h-6 font-semibold text-danger", !errorText && "sr-only")}
          data-testid="login-error"
        >
          {errorText}
        </p>

        <p className="flex items-center gap-2 text-sm text-text-muted">
          <ShieldAlert aria-hidden className="size-4 shrink-0" />
          {t("login.notVerification")}
        </p>
      </section>

      <aside
        aria-labelledby="demo-accounts"
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
      >
        <div>
          <h2 id="demo-accounts" className="text-lg font-semibold">
            {t("login.demoAccounts")}
          </h2>
          <p className="text-sm text-text-muted">{t("login.demoAccountsHint")}</p>
        </div>
        <ul className="flex flex-col gap-2">
          {visibleAccounts.map((a) => (
            <li key={a.phone}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDemo(a)}
                className="flex min-h-16 w-full items-center gap-3 rounded-lg border border-border px-4 text-start hover:border-primary hover:bg-primary-soft disabled:opacity-60"
                data-testid={`demo-${a.phone}`}
              >
                <span
                  aria-hidden
                  className="flex size-10 items-center justify-center rounded-pill bg-primary-soft font-bold text-primary"
                >
                  {a.name.charAt(0)}
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold">{lang === "ur" ? a.nameUr : a.name}</span>
                  <span className="text-sm text-text-muted">
                    {t(a.role === "worker" ? "login.demoWorker" : "login.demoCustomer")} ·{" "}
                    <span className="num whitespace-nowrap">{formatPhone(a.phone)}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
