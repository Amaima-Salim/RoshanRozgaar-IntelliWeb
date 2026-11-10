/**
 * "Free at that time" (D-08, docs/02 §5). A pure function; candidates and booking both call it
 * and the database exclusion constraint stays the final arbiter.
 */
import { karachiLocalParts } from "./time";

export type ScheduleWindow = { weekday: number; startMin: number; endMin: number };
export type BusySlot = { startAt: Date; endAt: Date };

/** The toggle only matters for "now" requests: it is enforced when the start is this close. */
export const TOGGLE_ENFORCED_WITHIN_MS = 15 * 60_000;
export const DEFAULT_DURATION_MIN = 120;

export type WorkerAvailability = {
  isAvailable: boolean;
  schedule: readonly ScheduleWindow[];
  busy: readonly BusySlot[];
};

export type FreeVerdict =
  { free: true } | { free: false; reason: "toggle_off" | "outside_hours" | "booked" };

export function checkWorkerFree(
  worker: WorkerAvailability,
  start: Date,
  end: Date,
  now: Date,
): FreeVerdict {
  if (!(end.getTime() > start.getTime())) return { free: false, reason: "outside_hours" };

  // 1. Toggle: only for ASAP requests (start within 15 min of now, or already started).
  if (start.getTime() - now.getTime() <= TOGGLE_ENFORCED_WITHIN_MS && !worker.isAvailable) {
    return { free: false, reason: "toggle_off" };
  }

  // 2. Weekly hours in Asia/Karachi: the whole window must sit inside one range of that weekday.
  const s = karachiLocalParts(start);
  const e = karachiLocalParts(end);
  const crossesMidnight = e.weekday !== s.weekday || e.minuteOfDay <= s.minuteOfDay;
  const inside =
    !crossesMidnight &&
    worker.schedule.some(
      (w) => w.weekday === s.weekday && w.startMin <= s.minuteOfDay && w.endMin >= e.minuteOfDay,
    );
  if (!inside) return { free: false, reason: "outside_hours" };

  // 3. No overlapping confirmed or in-progress job. Back-to-back is allowed.
  const overlaps = worker.busy.some(
    (b) => start.getTime() < b.endAt.getTime() && end.getTime() > b.startAt.getTime(),
  );
  if (overlaps) return { free: false, reason: "booked" };
  return { free: true };
}

export const isWorkerFree = (
  worker: WorkerAvailability,
  start: Date,
  end: Date,
  now: Date,
): boolean => checkWorkerFree(worker, start, end, now).free;
