import { describe, expect, it } from "vitest";
import {
  ENGAGED_STATES,
  JOB_ACTIONS,
  JOB_STATES,
  holdsWindow,
  isTerminal,
  transition,
  type JobAction,
  type JobActor,
  type JobState,
} from "@/lib/domain/job-machine";

const ACTORS: JobActor[] = ["customer", "worker", "system"];

/** Every allowed (state, action, actor) triple, written out by hand from docs/01 §5. */
const ALLOWED: Array<[JobState, JobAction, JobActor, JobState]> = [
  ["requested", "message", "customer", "negotiating"],
  ["requested", "message", "worker", "negotiating"],
  ["negotiating", "accept", "customer", "confirmed"],
  ["negotiating", "accept", "worker", "confirmed"],
  ["negotiating", "decline", "worker", "declined"],
  ["negotiating", "decline", "customer", "declined"],
  ["requested", "expire", "system", "expired"],
  ["negotiating", "expire", "system", "expired"],
  ["confirmed", "start", "worker", "in_progress"],
  ["in_progress", "request_complete", "worker", "in_progress"],
  ["in_progress", "confirm_complete", "customer", "completed"],
  ["requested", "cancel", "customer", "cancelled"],
  ["requested", "cancel", "worker", "cancelled"],
  ["negotiating", "cancel", "customer", "cancelled"],
  ["negotiating", "cancel", "worker", "cancelled"],
  ["confirmed", "cancel", "customer", "cancelled"],
  ["confirmed", "cancel", "worker", "cancelled"],
];

const ctx = (action: JobAction) => ({
  reason: action === "cancel" ? "changed my mind" : null,
  completionRequested: action === "confirm_complete",
});

describe("job machine: exhaustive table", () => {
  it("allows exactly the listed (state, action, actor) triples and nothing else", () => {
    let allowedSeen = 0;
    for (const state of JOB_STATES)
      for (const action of JOB_ACTIONS)
        for (const actor of ACTORS) {
          const expected = ALLOWED.find((a) => a[0] === state && a[1] === action && a[2] === actor);
          const got = transition({ state, action, actor, ...ctx(action) });
          if (expected) {
            allowedSeen++;
            expect(got, `${state} --${action}/${actor}-->`).toEqual(
              expect.objectContaining({ ok: true, to: expected[3] }),
            );
          } else {
            expect(got.ok, `${state} --${action}/${actor}--> must be rejected`).toBe(false);
          }
        }
    expect(allowedSeen).toBe(ALLOWED.length);
  });

  it("terminal states are final for every action and actor (BR-P9)", () => {
    for (const state of JOB_STATES.filter(isTerminal))
      for (const action of JOB_ACTIONS)
        for (const actor of ACTORS) {
          expect(transition({ state, action, actor, ...ctx(action) })).toEqual({
            ok: false,
            reason: "terminal_state",
          });
        }
  });
});

describe("job machine: conditions", () => {
  it("cancel needs a non-blank reason", () => {
    for (const reason of [undefined, null, "", "   "])
      expect(transition({ state: "confirmed", action: "cancel", actor: "worker", reason })).toEqual(
        {
          ok: false,
          reason: "reason_required",
        },
      );
  });

  it("the customer cannot start or request completion; the worker cannot confirm it", () => {
    expect(transition({ state: "confirmed", action: "start", actor: "customer" })).toEqual({
      ok: false,
      reason: "wrong_actor",
    });
    expect(
      transition({ state: "in_progress", action: "request_complete", actor: "customer" }),
    ).toEqual({ ok: false, reason: "wrong_actor" });
    expect(
      transition({
        state: "in_progress",
        action: "confirm_complete",
        actor: "worker",
        completionRequested: true,
      }),
    ).toEqual({ ok: false, reason: "wrong_actor" });
  });

  it("completion needs both explicit steps, in order", () => {
    expect(
      transition({ state: "in_progress", action: "confirm_complete", actor: "customer" }),
    ).toEqual({ ok: false, reason: "completion_not_requested" });
    expect(
      transition({
        state: "in_progress",
        action: "request_complete",
        actor: "worker",
        completionRequested: true,
      }),
    ).toEqual({ ok: false, reason: "already_requested" });
    expect(
      transition({ state: "in_progress", action: "request_complete", actor: "worker" }),
    ).toEqual({ ok: true, to: "in_progress", marks: "completion_requested" });
  });

  it("start is rejected unless confirmed, and cancel is rejected once in progress", () => {
    expect(transition({ state: "in_progress", action: "start", actor: "worker" })).toEqual({
      ok: false,
      reason: "wrong_state",
    });
    expect(
      transition({ state: "in_progress", action: "cancel", actor: "customer", reason: "x" }),
    ).toEqual({ ok: false, reason: "wrong_state" });
  });

  it("accept by the offer's own proposer is rejected", () => {
    expect(
      transition({
        state: "negotiating",
        action: "accept",
        actor: "customer",
        isOfferCounterpart: false,
      }),
    ).toEqual({ ok: false, reason: "wrong_actor" });
  });

  it("only confirmed and in_progress hold a worker's window", () => {
    expect(JOB_STATES.filter(holdsWindow)).toEqual([...ENGAGED_STATES]);
  });
});
