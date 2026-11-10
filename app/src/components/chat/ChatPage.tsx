import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRolePage } from "@/lib/auth/guards";
import {
  conversationHeader,
  listConversations,
  requireParticipant,
} from "@/lib/chat/conversations";
import { messagesAfter } from "@/lib/chat/messages";
import { formatKarachiDate, formatKarachiTime } from "@/lib/domain/time";
import { formatPkr } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { ChatView } from "./ChatView";
import { ConversationList } from "./ConversationList";

const serialize = <T extends { startAt: Date; lastAt: Date | null }>(c: T) => ({
  ...c,
  startAt: c.startAt.toISOString(),
  lastAt: c.lastAt?.toISOString() ?? null,
});

/** /c/chat and /w/chat: the inbox, or (with `id`) conversation | chat | job details. */
export async function ChatPage({ role, id }: { role: "customer" | "worker"; id?: string }) {
  const user = await requireRolePage(role);
  const { t, lang } = await getT();
  const list = (await listConversations(user.id, role)).map(serialize);
  const base = role === "customer" ? "/c/chat" : "/w/chat";

  if (!id) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">{t("chat.title")}</h1>
        <ConversationList items={list} role={role} />
      </div>
    );
  }

  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let header;
  try {
    await requireParticipant(id, user.id);
    header = await conversationHeader(id, user.id);
  } catch {
    notFound();
  }
  const initial = await messagesAfter(id, 0);
  const otherName =
    lang === "ur" && header.other?.nameUr ? header.other.nameUr : (header.other?.name ?? "");
  const start = header.request.startAt;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[18rem_minmax(0,1fr)_18rem]">
      <aside className="hidden lg:block" aria-label={t("chat.title")}>
        <ConversationList items={list} role={role} activeId={id} />
      </aside>
      <section className="flex min-h-[70vh] flex-col gap-3" data-testid="chat">
        <Link
          href={base}
          className="inline-flex min-h-touch items-center gap-2 font-medium text-primary lg:hidden"
        >
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {t("chat.back")}
        </Link>
        <h1 className="text-xl font-bold md:text-2xl" data-testid="chat-title">
          {t("chat.with", { name: otherName })}
        </h1>
        <ChatView
          conversationId={id}
          viewerId={user.id}
          role={role}
          initial={initial}
          open={header.status === "open"}
        />
      </section>
      <aside
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 max-lg:order-first lg:self-start"
        aria-label={t("chat.details")}
        data-testid="chat-details"
      >
        <h2 className="text-lg font-semibold">{t("chat.details")}</h2>
        <dl className="flex flex-col gap-2">
          <div>
            <dt className="text-sm text-text-muted">{t("chat.detailsTrade")}</dt>
            <dd className="font-semibold">{t(`trades.${header.request.trade}`)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">{t("chat.detailsWhen")}</dt>
            <dd className="num font-semibold">
              {formatKarachiDate(start, lang)}, {formatKarachiTime(start, lang)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">{t("chat.detailsFor")}</dt>
            <dd dir="auto">{header.request.summaryText ?? t("chat.detailsNoNote")}</dd>
          </div>
          {header.workerProfile?.rate ? (
            <div>
              <dd className="num">
                {t("chat.detailsRate", { price: formatPkr(header.workerProfile.rate) })}
              </dd>
            </div>
          ) : null}
        </dl>
      </aside>
    </div>
  );
}
