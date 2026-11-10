/**
 * DEMO NADRA check. There is NO connection to NADRA: this is an in-repo stand-in with a tiny fake
 * registry so the whole worker-verification flow can be built, shown and tested. Every result it
 * produces is labelled `provider: "demo"` and the UI says so (never fake success states).
 *
 * To go live later, implement `NadraVerifier` against the real service and return it from
 * `getNadraVerifier()`; the route, table and UI do not change.
 */
import { normalizeCnic, normalizeName } from "./cnic";

export type NadraQuery = {
  cnicNumber: string;
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
};

export type NadraResult =
  | { provider: "demo"; outcome: "match"; checkedAt: string }
  | {
      provider: "demo";
      outcome: "mismatch";
      fields: { name: boolean; dateOfBirth: boolean };
      checkedAt: string;
    }
  | { provider: "demo"; outcome: "not_found"; checkedAt: string };

export interface NadraVerifier {
  verify(query: NadraQuery): Promise<NadraResult>;
}

type DemoCitizen = { cnic: string; fullName: string; dateOfBirth: string };

/** Fake citizens. These people do not exist; the numbers are made up for the demo. */
export const DEMO_REGISTRY: readonly DemoCitizen[] = [
  { cnic: "6110112345671", fullName: "Muhammad Ahmed Khan", dateOfBirth: "1990-04-12" },
  { cnic: "3520223456782", fullName: "Ayesha Bibi", dateOfBirth: "1988-11-03" },
  { cnic: "6110198765433", fullName: "Usman Ali", dateOfBirth: "1995-07-21" },
  { cnic: "3740455667781", fullName: "Bilal Hussain", dateOfBirth: "1985-01-30" },
];

/** Same rules as the OCR fixture so AI_MODE=fixtures walks the happy path. */
export const DEMO_FIXTURE_CITIZEN = DEMO_REGISTRY[0]!;

export const demoNadraVerifier: NadraVerifier = {
  async verify({ cnicNumber, fullName, dateOfBirth }) {
    const checkedAt = new Date().toISOString();
    const digits = normalizeCnic(cnicNumber);
    const citizen = DEMO_REGISTRY.find((c) => c.cnic === digits);
    if (!citizen) return { provider: "demo", outcome: "not_found", checkedAt };
    const name = normalizeName(fullName) === normalizeName(citizen.fullName);
    const dob = dateOfBirth === citizen.dateOfBirth;
    if (name && dob) return { provider: "demo", outcome: "match", checkedAt };
    return { provider: "demo", outcome: "mismatch", fields: { name, dateOfBirth: dob }, checkedAt };
  },
};

export function getNadraVerifier(): NadraVerifier {
  return demoNadraVerifier;
}
