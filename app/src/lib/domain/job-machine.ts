/**
 * Job state machine (docs/01 §5). Pure: no I/O, so every cell of the table is unit-tested.
 *
 * Only `confirmed` and later are rows in `jobs`. `requested` and `negotiating` live in the
 * request/conversation/offer rows (see DECISIONS.md D-55); the machine still models them so the
 * whole table has one source of truth.
 */
export const JOB_STATES = [
  "requested",
  "negotiating",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
  "declined",
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const JOB_ACTIONS = [
  "message",
  "accept",
  "decline",
  "expire",
  "start",
  "request_complete",
  "confirm_complete",
  "cancel",
] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];

export type JobActor = "customer" | "worker" | "system";

export const TERMINAL_STATES: readonly JobState[] = [
  "completed",
  "cancelled",
  "expired",
  "declined",
];
export const isTerminal = (s: JobState) => TERMINAL_STATES.includes(s);

export type TransitionInput = {
  state: JobState;
  action: JobAction;
  actor: JobActor;
  /** `in_progress` only: the worker has already asked for completion. */
  completionRequested?: boolean;
  /** `cancel` only: cancelling needs a reason (docs/01 §5). */
  reason?: string | null;
  /** Accept only: the actor is the counterpart of the offer's proposer. */
  isOfferCounterpart?: boolean;
};

export type RejectReason =
  | "terminal_state"
  | "wrong_state"
  | "wrong_actor"
  | "reason_required"
  | "completion_not_requested"
  | "already_requested";

export type TransitionResult =
  | {
      ok: true;
      to: JobState;
      /** `request_complete` changes no status; it only records the request. */
      marks?: "completion_requested";
    }
  | { ok: false; reason: RejectReason };

const reject = (reason: RejectReason): TransitionResult => ({ ok: false, reason });

/** Which states each action may start from. */
const FROM: Record<JobAction, readonly JobState[]> = {
  message: ["requested"],
  accept: ["negotiating"],
  decline: ["negotiating"],
  expire: ["requested", "negotiating"],
  start: ["confirmed"],
  request_complete: ["in_progress"],
  confirm_complete: ["in_progress"],
  cancel: ["requested", "negotiating", "confirmed"],
};

/** Which actor may perform each action. `cancel` is further checked by the caller (owner/assigned). */
const ACTORS: Record<JobAction, readonly JobActor[]> = {
  message: ["customer", "worker"],
  accept: ["customer", "worker"],
  decline: ["worker", "customer"],
  expire: ["system"],
  start: ["worker"],
  request_complete: ["worker"],
  confirm_complete: ["customer"],
  cancel: ["customer", "worker"],
};

const TO: Record<JobAction, JobState> = {
  message: "negotiating",
  accept: "confirmed",
  decline: "declined",
  expire: "expired",
  start: "in_progress",
  request_complete: "in_progress",
  confirm_complete: "completed",
  cancel: "cancelled",
};

export function transition(input: TransitionInput): TransitionResult {
  const { state, action, actor } = input;
  if (isTerminal(state)) return reject("terminal_state");
  if (!FROM[action].includes(state)) return reject("wrong_state");
  if (!ACTORS[action].includes(actor)) return reject("wrong_actor");

  if (action === "accept" && input.isOfferCounterpart === false) return reject("wrong_actor");
  if (action === "cancel" && !input.reason?.trim()) return reject("reason_required");
  if (action === "request_complete" && input.completionRequested)
    return reject("already_requested");
  if (action === "confirm_complete" && !input.completionRequested)
    return reject("completion_not_requested");

  return action === "request_complete"
    ? { ok: true, to: TO[action], marks: "completion_requested" }
    : { ok: true, to: TO[action] };
}

/** States in which a worker's time window is held (mirrors the DB exclusion constraint). */
export const ENGAGED_STATES: readonly JobState[] = ["confirmed", "in_progress"];
export const holdsWindow = (s: JobState) => ENGAGED_STATES.includes(s);
