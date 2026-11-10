import "server-only";
import { cookies } from "next/headers";
import { createT, DEFAULT_LANG, isLang, LANG_COOKIE, type Lang } from "./index";

/**
 * Language for this request: the `rr_lang` cookie, else Urdu (D-06). The toggle
 * writes the cookie and, when signed in, the user's `language` too.
 */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

export async function getT() {
  const lang = await getLang();
  return { lang, ...createT(lang) };
}
