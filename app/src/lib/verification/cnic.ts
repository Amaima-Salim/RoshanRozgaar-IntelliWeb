/**
 * CNIC (Pakistan national ID) helpers: pure functions, no I/O. Used on OCR output and on what the
 * worker types, so the same rules apply to both. A well-formed number is NOT a verified identity.
 */
import { z } from "zod";

/** Digits only, 13 long. Returns null when the input cannot be a CNIC. */
export function normalizeCnic(input: string): string | null {
  // Urdu/Arabic-Indic digits appear on cards and keyboards; fold them to ASCII first.
  const ascii = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const digits = ascii.replace(/[\s-]/g, "");
  return /^\d{13}$/.test(digits) ? digits : null;
}

/** 13 digits, province digit 1–7, not a repeated digit. Format only: NADRA decides the rest. */
export function isPlausibleCnic(input: string): boolean {
  const d = normalizeCnic(input);
  if (!d) return false;
  if (!/^[1-7]/.test(d)) return false;
  return !/^(\d)\1{12}$/.test(d);
}

/** 12345-1234567-1 */
export function formatCnic(input: string): string | null {
  const d = normalizeCnic(input);
  return d ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : null;
}

/** 61101-*******-1: safe to show back to the worker and to store for display. */
export function maskCnic(input: string): string | null {
  const d = normalizeCnic(input);
  return d ? `${d.slice(0, 5)}-*******-${d.slice(12)}` : null;
}

/** The last CNIC digit is odd for men and even for women. */
export function genderFromCnic(input: string): "male" | "female" | null {
  const d = normalizeCnic(input);
  return d ? (Number(d[12]) % 2 === 1 ? "male" : "female") : null;
}

/** Lower-case, letters and spaces only, so "AHMAD  Khan." equals "ahmad khan". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Accepts DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY (as printed) and YYYY-MM-DD; returns YYYY-MM-DD. */
export function normalizeDate(input: string): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const isoDate = z.string().transform((v, ctx) => {
  const n = normalizeDate(v);
  if (!n) ctx.addIssue({ code: "custom", message: "date" });
  return n ?? "";
});

/** What the OCR proposes. Every field may be null: unknown is never guessed. */
export const cnicDraftSchema = z.strictObject({
  cnicNumber: z.string().nullable(),
  fullName: z.string().max(100).nullable(),
  fatherName: z.string().max(100).nullable(),
  dateOfBirth: z.string().nullable(),
  dateOfIssue: z.string().nullable(),
  dateOfExpiry: z.string().nullable(),
});
export type CnicDraft = {
  cnicNumber: string | null;
  fullName: string | null;
  fatherName: string | null;
  dateOfBirth: string | null;
  dateOfIssue: string | null;
  dateOfExpiry: string | null;
};

export const emptyCnicDraft = (): CnicDraft => ({
  cnicNumber: null,
  fullName: null,
  fatherName: null,
  dateOfBirth: null,
  dateOfIssue: null,
  dateOfExpiry: null,
});

/** Cleans raw model output: bad numbers/dates become null instead of passing through. */
export function sanitizeCnicDraft(raw: unknown): CnicDraft {
  const parsed = cnicDraftSchema.safeParse(raw);
  if (!parsed.success) return emptyCnicDraft();
  const r = parsed.data;
  const name = (v: string | null) => {
    const t = v?.replace(/\s+/g, " ").trim();
    return t ? t : null;
  };
  const num = r.cnicNumber ? normalizeCnic(r.cnicNumber) : null;
  return {
    cnicNumber: num && isPlausibleCnic(num) ? formatCnic(num) : null,
    fullName: name(r.fullName),
    fatherName: name(r.fatherName),
    dateOfBirth: r.dateOfBirth ? normalizeDate(r.dateOfBirth) : null,
    dateOfIssue: r.dateOfIssue ? normalizeDate(r.dateOfIssue) : null,
    dateOfExpiry: r.dateOfExpiry ? normalizeDate(r.dateOfExpiry) : null,
  };
}

/** What the worker confirms (after editing the OCR draft). Strict: unknown fields are refused. */
export const cnicConfirmSchema = z.strictObject({
  cnicNumber: z
    .string()
    .refine(isPlausibleCnic, "cnic")
    .transform((v) => formatCnic(v)!),
  fullName: z.string().trim().min(2).max(100),
  fatherName: z.string().trim().max(100).nullish(),
  dateOfBirth: isoDate,
  dateOfExpiry: isoDate.nullish(),
});
export type CnicConfirm = z.infer<typeof cnicConfirmSchema>;

/** Card has expired by `now` (UTC date compare). */
export const isExpired = (expiryIso: string, now = new Date()) =>
  expiryIso < now.toISOString().slice(0, 10);
