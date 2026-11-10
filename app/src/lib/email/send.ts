import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getConfig } from "@/lib/config";
import { log } from "@/lib/log";
import { buildOtpEmail } from "./template";

export class EmailSendError extends Error {
  constructor() {
    super("EMAIL_SEND_FAILED");
    this.name = "EmailSendError";
  }
}

let transport: Transporter | undefined;

/** Gmail SMTP with an App Password (docs/05 §4). Node runtime only. */
function getTransport(user: string, pass: string): Transporter {
  transport ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  return transport;
}

/**
 * Resolves only after SMTP accepted the message; every failure (including Gmail's
 * daily cap, 550 5.4.5) throws EmailSendError so "code sent" is never shown for an
 * unsent email. The code is never logged. Without Gmail values, development prints
 * the code to the server console as a clearly labelled fallback.
 */
export async function sendOtpEmail(to: string, code: string, expiresMinutes: number) {
  const { gmail, emailOtpStub } = getConfig().auth;
  if (emailOtpStub) return; // local E2E server only (RR_E2E); the code is fixed, see auth/server.ts
  if (!gmail.user || !gmail.appPassword) {
    if (getConfig().nodeEnv === "development") {
      console.info(`[dev-mode] sign-in code for ${to}: ${code}`);
      return;
    }
    throw new EmailSendError();
  }
  const mail = buildOtpEmail(code, expiresMinutes);
  try {
    const info = await getTransport(gmail.user, gmail.appPassword).sendMail({
      from: { name: gmail.fromName, address: gmail.user },
      to,
      ...mail,
    });
    if (!info.accepted?.length) throw new Error("not accepted");
  } catch (err) {
    log.error("email.send_failed", { reason: err instanceof Error ? err.message : "unknown" });
    throw new EmailSendError();
  }
}
