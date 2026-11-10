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

/** Start of the Asia/Karachi calendar day `daysAhead` days after `now`'s, plus `minutes`, as an instant. */
function karachiDayAt(now: Date, daysAhead: number, minutes: number): Date {
  const { start } = karachiDayBounds(now);
  return new Date(start.getTime() + daysAhead * 24 * 60 * 60_000 + minutes * 60_000);
}

export const EVENING_START_MIN = 18 * 60;
export const TOMORROW_START_MIN = 10 * 60;

/**
 * The "when" chips (docs/01 §3 O2) as concrete instants. "This evening" is 18:00 today, or in half
 * an hour if that has passed; "tomorrow" is 10:00 tomorrow.
 */
export function startForChip(chip: "evening" | "tomorrow", now: Date): Date {
  if (chip === "tomorrow") return karachiDayAt(now, 1, TOMORROW_START_MIN);
  const evening = karachiDayAt(now, 0, EVENING_START_MIN);
  return evening.getTime() > now.getTime() ? evening : new Date(now.getTime() + 30 * 60_000);
}

/** `<input type="datetime-local">` value ("2030-01-07T10:00", Karachi wall clock) → instant. */
export function parseKarachiLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
