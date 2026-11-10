import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/en.json";
import ur from "@/lib/i18n/ur.json";
import { createT, dirFor } from "@/lib/i18n";
import { ERROR_CODES } from "@/lib/api/respond";

function leaves(obj: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
  }
  return out;
}

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n", () => {
  const enKeys = leaves(en);
  const urKeys = leaves(ur);

  it("Urdu and English have exactly the same keys", () => {
    expect([...urKeys.keys()].sort()).toEqual([...enKeys.keys()].sort());
  });

  it("no string is empty, and placeholders match across languages", () => {
    for (const [key, value] of enKeys) {
      expect(value.trim(), key).not.toBe("");
      expect(urKeys.get(key)?.trim(), key).not.toBe("");
      expect(vars(urKeys.get(key) ?? ""), key).toEqual(vars(value));
    }
  });

  it("every API error code has a message in both languages", () => {
    for (const code of Object.keys(ERROR_CODES)) {
      expect(enKeys.has(`errors.${code}`), code).toBe(true);
      expect(urKeys.has(`errors.${code}`), code).toBe(true);
    }
  });

  it("interpolates and falls back to the key for unknown runtime keys", () => {
    const { t, tKey } = createT("en");
    expect(t("landing.signedInAs", { name: "Ayesha" })).toBe("Signed in as Ayesha");
    expect(tKey("does.not.exist")).toBe("does.not.exist");
  });

  it("maps languages to direction", () => {
    expect(dirFor("ur")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });
});
