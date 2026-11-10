import en from "./en.json";
import ur from "./ur.json";

export type Lang = "ur" | "en";
export const LANGS: Lang[] = ["ur", "en"];
export const DEFAULT_LANG: Lang = "ur";
export const LANG_COOKIE = "rr_lang";

export const dirFor = (lang: Lang) => (lang === "ur" ? "rtl" : "ltr");
export const isLang = (v: unknown): v is Lang => v === "ur" || v === "en";

export type Messages = typeof en;
export const MESSAGES: Record<Lang, Messages> = { en, ur };

// Dot-paths of every string leaf, so `t("login.title")` is type-checked.
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node)
      node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

export type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Translator for one language. `tKey` accepts runtime keys (e.g. an API `messageKey`)
 * and falls back to the key itself if it's unknown.
 */
export function createT(lang: Lang) {
  const messages = MESSAGES[lang];
  const tKey = (key: string, vars?: Record<string, string | number>) => {
    const template = lookup(messages, key) ?? lookup(MESSAGES.en, key) ?? key;
    return vars
      ? template.replace(/\{(\w+)\}/g, (m, name: string) => String(vars[name] ?? m))
      : template;
  };
  const t: TFn = (key, vars) => tKey(key, vars);
  return { t, tKey };
}
