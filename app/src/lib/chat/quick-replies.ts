import { createT, type Lang, type MessageKey } from "@/lib/i18n";

export const CUSTOMER_QUICK = ["when", "price", "ok", "thanks"] as const;
export const WORKER_QUICK = ["canCome", "details", "ok", "thanks"] as const;
export const QUICK_KEYS = ["when", "price", "ok", "thanks", "canCome", "details"] as const;
export type QuickKey = (typeof QUICK_KEYS)[number];

/**
 * A quick reply is stored in the sender's language with the other language alongside, from our
 * own bilingual strings. No AI is involved, so the recipient always reads it in their language.
 */
export function quickReplyText(key: QuickKey, senderLang: Lang) {
  const otherLang: Lang = senderLang === "ur" ? "en" : "ur";
  const path = `chat.quick.${key}` as MessageKey;
  return {
    bodyText: createT(senderLang).t(path),
    translatedText: createT(otherLang).t(path),
    translatedLang: otherLang,
  };
}
