"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n/client";

/** Opens (or returns to) the one conversation for this request and worker. */
export function StartChatButton({ requestId, workerId }: { requestId: string; workerId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, workerId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { id: string };
        error?: { details?: { reason?: string } };
      };
      if (!json.ok || !json.data) {
        const reason = json.error?.details?.reason;
        setError(
          t(
            reason === "worker_not_eligible"
              ? "chat.errors.notEligible"
              : reason === "request_closed"
                ? "chat.errors.requestClosed"
                : "chat.errors.start",
          ),
        );
        setBusy(false);
        return;
      }
      router.push(`/c/chat/${json.data.id}`);
    } catch {
      setError(t("chat.errors.start"));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        fullWidth
        loading={busy}
        onClick={start}
        icon={<MessageCircle aria-hidden />}
        label={t("workerProfile.message")}
        data-testid="message-worker"
      />
      {error ? (
        <p role="alert" className="font-semibold text-danger" data-testid="start-chat-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
