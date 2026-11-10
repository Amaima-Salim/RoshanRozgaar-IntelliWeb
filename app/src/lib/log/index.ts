/**
 * Structured server logs (docs/02 §9). Never log audio, transcripts, phones,
 * emails, OTPs, tokens, keys, hashes or salts: sensitive keys are redacted and
 * phone/email-looking strings are masked wherever they appear.
 */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|otp|code|salt|hash|key|authorization|cookie|phone|email|transcript|audio|address/i;
const EMAIL = /[^\s@"']+@[^\s@"']+\.[^\s@"']+/g;
const PK_PHONE = /(\+92|0)3\d{2}[\s-]?\d{7}/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string")
    return value.replace(EMAIL, "[email]").replace(PK_PHONE, "[phone]");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error)
    return { name: value.name, message: redact(value.message, depth + 1) };
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1),
      ]),
    );
  }
  return value;
}

type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test" && level === "info") return;
  const line = JSON.stringify({
    level,
    msg,
    at: new Date().toISOString(),
    ...(redact(fields) as object),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};
