import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { HttpError } from "@/lib/api/respond";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/client";
import { media, workerVerifications } from "@/lib/db/schema";
import { isExpired, maskCnic, normalizeCnic, type CnicConfirm } from "./cnic";
import { getNadraVerifier } from "./nadra-demo";

/** Keyed hash so the same card is detected twice without storing the number. */
export const hashCnic = (cnic: string) =>
  createHmac("sha256", getConfig().sessionSecret)
    .update(`cnic:${normalizeCnic(cnic) ?? cnic}`)
    .digest("hex");

export type VerificationView = {
  status: "unverified" | "demo_verified" | "mismatch" | "not_found";
  cnicMasked: string | null;
  fullName: string | null;
  checkedAt: string | null;
  /** Always "demo" today: the UI must say this is not a real NADRA check. */
  provider: "demo";
  mismatch: { name: boolean; dateOfBirth: boolean } | null;
};

export async function loadVerification(workerId: string): Promise<VerificationView> {
  const [row] = await db
    .select()
    .from(workerVerifications)
    .where(eq(workerVerifications.workerId, workerId));
  if (!row) {
    return {
      status: "unverified",
      cnicMasked: null,
      fullName: null,
      checkedAt: null,
      provider: "demo",
      mismatch: null,
    };
  }
  const result = row.nadraResult as { fields?: { name: boolean; dateOfBirth: boolean } };
  return {
    status: row.status,
    cnicMasked: row.cnicMasked,
    fullName: row.fullName,
    checkedAt: row.checkedAt.toISOString(),
    provider: "demo",
    mismatch: row.status === "mismatch" ? (result.fields ?? null) : null,
  };
}

/** Each media id must be an image owned by this worker. */
async function assertOwnImages(workerId: string, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(and(inArray(media.id, ids), eq(media.ownerId, workerId), eq(media.kind, "image")));
  if (rows.length !== new Set(ids).size) throw new HttpError("VALIDATION", { reason: "media" });
}

export async function submitVerification(
  workerId: string,
  input: CnicConfirm & {
    frontMediaId: string;
    backMediaId?: string | null;
    ocrSource: "ai" | "fixtures" | "manual";
    ocrDraft?: unknown;
  },
): Promise<VerificationView> {
  const existing = await loadVerification(workerId);
  if (existing.status === "demo_verified")
    throw new HttpError("CONFLICT_STATE", { reason: "done" });
  if (input.dateOfExpiry && isExpired(input.dateOfExpiry))
    throw new HttpError("VALIDATION", { reason: "expired" });
  await assertOwnImages(
    workerId,
    [input.frontMediaId, input.backMediaId].filter((x): x is string => !!x),
  );

  const result = await getNadraVerifier().verify({
    cnicNumber: input.cnicNumber,
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth,
  });
  const status =
    result.outcome === "match"
      ? ("demo_verified" as const)
      : result.outcome === "mismatch"
        ? ("mismatch" as const)
        : ("not_found" as const);

  const values = {
    cnicHash: hashCnic(input.cnicNumber),
    cnicMasked: maskCnic(input.cnicNumber)!,
    fullName: input.fullName,
    fatherName: input.fatherName ?? null,
    dateOfBirth: input.dateOfBirth,
    dateOfExpiry: input.dateOfExpiry ?? null,
    frontMediaId: input.frontMediaId,
    backMediaId: input.backMediaId ?? null,
    ocrSource: input.ocrSource,
    ocrDraft: input.ocrDraft ?? null,
    status,
    nadraProvider: result.provider,
    nadraResult: result,
    checkedAt: new Date(result.checkedAt),
  };
  try {
    await db
      .insert(workerVerifications)
      .values({ workerId, ...values })
      .onConflictDoUpdate({ target: workerVerifications.workerId, set: values });
  } catch (err) {
    // Unique violation on cnic_hash: this card already belongs to another account.
    if (
      (err as { code?: string; cause?: { code?: string } }).code === "23505" ||
      (err as { cause?: { code?: string } }).cause?.code === "23505"
    )
      throw new HttpError("CONFLICT_STATE", { reason: "cnic_in_use" });
    throw err;
  }
  return loadVerification(workerId);
}
