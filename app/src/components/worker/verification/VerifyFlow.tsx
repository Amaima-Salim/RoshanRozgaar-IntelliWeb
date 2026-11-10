"use client";

import { Camera, CircleAlert, CircleCheck, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n/client";
import type { VerificationView } from "@/lib/verification/service";

type Draft = {
  cnicNumber: string | null;
  fullName: string | null;
  fatherName: string | null;
  dateOfBirth: string | null;
  dateOfExpiry: string | null;
} | null;

type Scan = {
  frontMediaId: string;
  backMediaId: string | null;
  ocr: "done" | "unavailable";
  source: "ai" | "fixtures" | "manual";
  simulated: boolean;
  draft: Draft;
};

/** Shrinks a card photo to ≤ 1600 px JPEG so it fits the 1 MB cap and stays readable. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.5, 0.35]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= 1024 * 1024) return blob;
  }
  throw new Error("too_large");
}

const field = "min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-base";

function Picker({
  label,
  file,
  onPick,
  testId,
}: {
  label: string;
  file: File | null;
  onPick: (f: File) => void;
  testId: string;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <p className="font-medium">{label}</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid={testId}
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
      <Button
        type="button"
        variant={file ? "secondary" : "outline"}
        icon={<Camera />}
        label={file ? t("verify.retake") : t("verify.choose")}
        onClick={() => input.current?.click()}
      />
      {file ? <p className="num truncate text-sm text-text-muted">{file.name}</p> : null}
    </div>
  );
}

export function VerifyFlow({ initial }: { initial: VerificationView }) {
  const { t, tKey } = useI18n();
  const [status, setStatus] = useState(initial);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState<"scan" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    cnicNumber: "",
    fullName: "",
    fatherName: "",
    dateOfBirth: "",
    dateOfExpiry: "",
  });

  const done = status.status === "demo_verified";

  const runScan = async () => {
    if (!front) return;
    setBusy("scan");
    setError(null);
    try {
      const body = new FormData();
      body.set("front", await compress(front), "front.jpg");
      if (back) body.set("back", await compress(back), "back.jpg");
      const res = await fetch("/api/worker/verification/scan", { method: "POST", body });
      const json = (await res.json()) as { ok: boolean; data?: Scan };
      if (!res.ok || !json.ok || !json.data) throw new Error("scan");
      setScan(json.data);
      const d = json.data.draft;
      setForm({
        cnicNumber: d?.cnicNumber ?? "",
        fullName: d?.fullName ?? "",
        fatherName: d?.fatherName ?? "",
        dateOfBirth: d?.dateOfBirth ?? "",
        dateOfExpiry: d?.dateOfExpiry ?? "",
      });
    } catch {
      setError(t("verify.errors.upload"));
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!scan) return;
    setBusy("submit");
    setError(null);
    try {
      const res = await fetch("/api/worker/verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cnicNumber: form.cnicNumber,
          fullName: form.fullName,
          fatherName: form.fatherName || null,
          dateOfBirth: form.dateOfBirth,
          dateOfExpiry: form.dateOfExpiry || null,
          frontMediaId: scan.frontMediaId,
          backMediaId: scan.backMediaId,
          ocrSource: scan.source,
          ocrDraft: scan.draft,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: VerificationView;
        error?: { code: string; details?: { reason?: string } };
      };
      if (res.ok && json.ok && json.data) {
        setStatus(json.data);
        if (json.data.status !== "demo_verified") setScan(null);
        return;
      }
      const reason = json.error?.details?.reason;
      setError(
        reason === "expired"
          ? t("verify.errors.expired")
          : reason === "cnic_in_use"
            ? t("verify.errors.inUse")
            : reason === "done"
              ? t("verify.errors.done")
              : json.error?.code === "VALIDATION"
                ? t("verify.errors.invalid")
                : t("verify.errors.generic"),
      );
    } catch {
      setError(t("verify.errors.generic"));
    } finally {
      setBusy(null);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5" data-testid="verify-flow">
      <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
        <ShieldCheck aria-hidden className="text-primary" />
        {t("verify.title")}
      </h1>
      <p
        className="flex items-start gap-2 rounded-lg border border-accent bg-accent-soft p-3"
        data-testid="verify-demo-notice"
      >
        <Badge kind="demo" />
        <span>{t("verify.demoNotice")}</span>
      </p>

      {status.status !== "unverified" ? (
        <section
          className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4"
          data-testid="verify-status"
          data-status={status.status}
          role="status"
        >
          <p className="flex items-center gap-2 text-lg font-semibold">
            {done ? (
              <CircleCheck aria-hidden className="text-primary" />
            ) : (
              <CircleAlert aria-hidden className="text-danger" />
            )}
            {tKey(`verify.status.${status.status}`)}
          </p>
          <p>{tKey(`verify.statusHelp.${status.status}`)}</p>
          {status.cnicMasked ? (
            <p className="num text-text-muted">
              {t("verify.checkedCnic", { cnic: status.cnicMasked })}
            </p>
          ) : null}
          {status.mismatch && !status.mismatch.name ? <p>{t("verify.mismatchName")}</p> : null}
          {status.mismatch && !status.mismatch.dateOfBirth ? (
            <p>{t("verify.mismatchDob")}</p>
          ) : null}
        </section>
      ) : null}

      {done ? null : !scan ? (
        <>
          <p>{t("verify.intro")}</p>
          <Picker label={t("verify.front")} file={front} onPick={setFront} testId="cnic-front" />
          <Picker label={t("verify.back")} file={back} onPick={setBack} testId="cnic-back" />
          <Button
            label={busy === "scan" ? t("verify.scanning") : t("verify.scan")}
            loading={busy === "scan"}
            disabled={!front || busy !== null}
            disabledReason={!front ? t("verify.front") : undefined}
            onClick={runScan}
            data-testid="cnic-scan"
          />
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2 className="text-xl font-semibold">{t("verify.confirmTitle")}</h2>
          <p className="flex items-center gap-2 text-text-muted" data-testid="verify-ocr-note">
            {scan.ocr === "unavailable"
              ? t("verify.ocrUnavailable")
              : scan.simulated
                ? t("verify.simulatedNote")
                : t("verify.aiNote")}
            {scan.ocr === "done" ? <Badge kind={scan.simulated ? "demo" : "ai"} /> : null}
          </p>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("verify.cnicNumber")}</span>
            <input
              className={`${field} num`}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              required
              value={form.cnicNumber}
              onChange={set("cnicNumber")}
              data-testid="cnic-number"
            />
            <span className="text-sm text-text-muted">{t("verify.cnicHint")}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("verify.fullName")}</span>
            <input
              className={field}
              required
              value={form.fullName}
              onChange={set("fullName")}
              data-testid="cnic-name"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("verify.fatherName")}</span>
            <input className={field} value={form.fatherName} onChange={set("fatherName")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("verify.dateOfBirth")}</span>
            <input
              className={`${field} num`}
              type="date"
              dir="ltr"
              required
              value={form.dateOfBirth}
              onChange={set("dateOfBirth")}
              data-testid="cnic-dob"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("verify.dateOfExpiry")}</span>
            <input
              className={`${field} num`}
              type="date"
              dir="ltr"
              value={form.dateOfExpiry}
              onChange={set("dateOfExpiry")}
            />
          </label>
          <Button
            type="submit"
            label={busy === "submit" ? t("verify.checking") : t("verify.submit")}
            loading={busy === "submit"}
            disabled={busy !== null}
            data-testid="cnic-submit"
          />
        </form>
      )}

      {error ? (
        <p role="alert" className="text-danger" data-testid="verify-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
