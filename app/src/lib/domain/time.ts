/**
 * Time rules (OE-5): store UTC timestamptz, show Asia/Karachi. Pakistan has no
 * DST (fixed UTC+5), but we still go through Intl rather than hard-coding the offset.
 */
export const APP_TIME_ZONE = "Asia/Karachi";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday (0 = Sunday) and minutes since local midnight, in Asia/Karachi. */
export function karachiLocalParts(date: Date): { weekday: number; minuteOfDay: number } {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAYS.indexOf(get("weekday"));
  if (weekday < 0) throw new Error("Could not resolve weekday");
  return { weekday, minuteOfDay: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** "3:00 PM" style, 12-hour, Western digits, Asia/Karachi (docs/03 §3). */
export function formatKarachiTime(date: Date, locale: "ur" | "en"): string {
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK-u-nu-latn" : "en-PK", {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatKarachiDate(date: Date, locale: "ur" | "en"): string {
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK-u-nu-latn" : "en-PK", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** [start, end) of the Asia/Karachi calendar day containing `date`, as UTC instants. */
export function karachiDayBounds(date: Date): { start: Date; end: Date } {
  const { minuteOfDay } = karachiLocalParts(date);
  const start = new Date(Math.floor(date.getTime() / 60_000) * 60_000 - minuteOfDay * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}
