/**
 * API contract (docs/02 §7): `{ ok: true, data }` or
 * `{ ok: false, error: { code, messageKey, details?, current? } }`.
 * Clients map `messageKey` to Urdu/English; no stack traces ever reach a client.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { log } from "@/lib/log";

export const ERROR_CODES = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT_BOOKED: 409,
  CONFLICT_STATE: 409,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  PAYLOAD_TOO_LARGE: 413,
  EMAIL_SEND_FAILED: 502,
  PAYMENT_UNAVAILABLE: 503,
  PAYMENT_VERIFICATION_FAILED: 400,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export type ApiError = {
  code: ErrorCode;
  messageKey: string;
  details?: unknown;
  current?: unknown;
};
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details?: unknown,
    readonly current?: unknown,
  ) {
    super(code);
    this.name = "HttpError";
  }
}

const messageKeyFor = (code: ErrorCode) => `errors.${code}`;

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>, init);
}

export function fail(
  code: ErrorCode,
  opts: { details?: unknown; current?: unknown; requestId?: string } = {},
) {
  const body: ApiResponse<never> = {
    ok: false,
    error: {
      code,
      messageKey: messageKeyFor(code),
      ...(opts.details !== undefined && { details: opts.details }),
      ...(opts.current !== undefined && { current: opts.current }),
    },
  };
  return Response.json(body, {
    status: ERROR_CODES[code],
    headers: opts.requestId ? { "x-request-id": opts.requestId } : undefined,
  });
}

/** Parse JSON with a strict schema: unknown fields are rejected (docs/07 §2). */
export async function parseJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json"))
    throw new HttpError("VALIDATION", { reason: "content-type" });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError("VALIDATION", { reason: "json" });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(
      "VALIDATION",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), code: i.code })),
    );
  }
  return parsed.data;
}

type Handler<Ctx> = (request: Request, ctx: Ctx & { requestId: string }) => Promise<Response>;

/**
 * Wraps a route handler: assigns a requestId, turns HttpError into the error
 * contract, logs unexpected errors (redacted) and hides their details.
 */
export function route<Ctx = unknown>(name: string, handler: Handler<Ctx>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const started = Date.now();
    try {
      const res = await handler(request, { ...ctx, requestId });
      res.headers.set("x-request-id", requestId);
      log.info("request", { route: name, requestId, status: res.status, ms: Date.now() - started });
      return res;
    } catch (err) {
      if (err instanceof HttpError) {
        log.info("request", {
          route: name,
          requestId,
          status: ERROR_CODES[err.code],
          code: err.code,
        });
        return fail(err.code, { details: err.details, current: err.current, requestId });
      }
      log.error("unhandled", { route: name, requestId, error: err });
      return fail("INTERNAL", { requestId });
    }
  };
}
