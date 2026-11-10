/**
 * Deterministic, idempotent seed (docs/01 §7). Running it twice leaves the same
 * rows: ids are derived from stable keys and every write is an upsert.
 * Every seeded user-visible row carries is_seeded = true (BR-P10).
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "../client";
import { loadEnvFiles } from "../load-env";
import {
  areas,
  conversations,
  jobEvents,
  jobs,
  offers,
  requests,
  users,
  workerProfiles,
  workerSchedule,
} from "../schema";
import {
  AREAS,
  DEMO_CUSTOMERS,
  DEMO_WORKER,
  EDGE_CASE_REFERENCE_AREA,
  SCHEDULE_TEMPLATES,
  WORKERS,
  type AreaSlug,
} from "./data";

/** Stable UUID (v5-shaped) from a seed key, so re-seeding never creates duplicates. */
export function seedUuid(key: string): string {
  const h = createHash("sha1").update(`roshan-rozgar:${key}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Small deterministic PRNG (mulberry32) for jitter; fixed seed. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KM_PER_DEG_LAT = 111.32;
const kmPerDegLng = (lat: number) => KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

function offsetKm(from: { lat: number; lng: number }, north: number, east: number) {
  return { lat: from.lat + north / KM_PER_DEG_LAT, lng: from.lng + east / kmPerDegLng(from.lat) };
}

function areaBySlug(slug: AreaSlug) {
  const a = AREAS.find((x) => x.slug === slug);
  if (!a) throw new Error(`Unknown area ${slug}`);
  return a;
}

/** Haversine, used only to print the edge-case distances in the summary. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function seed(db: Db) {
  const rand = prng(20261110);
  const summary: string[] = [];

  await db.transaction(async (tx) => {
    // Areas
    await tx
      .insert(areas)
      .values(AREAS.map((a) => ({ ...a, isApproximate: true })))
      .onConflictDoUpdate({
        target: areas.slug,
        set: {
          nameEn: sql`excluded.name_en`,
          nameUr: sql`excluded.name_ur`,
          city: sql`excluded.city`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          isApproximate: sql`excluded.is_approximate`,
        },
      });

    const upsertUser = async (u: {
      key: string;
      name: string;
      nameUr: string;
      phone: string;
      role: "worker" | "customer";
      email?: string;
    }) => {
      const id = seedUuid(u.key);
      await tx
        .insert(users)
        .values({
          id,
          name: u.name,
          nameUr: u.nameUr,
          phone: u.phone,
          role: u.role,
          // Phone-only accounts get a non-deliverable placeholder (docs/02 §3).
          email: u.email ?? `${id}@phone.invalid`,
          emailVerified: false,
          language: "ur",
          isSeeded: true,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            name: sql`excluded.name`,
            nameUr: sql`excluded.name_ur`,
            phone: sql`excluded.phone`,
            role: sql`excluded.role`,
            email: sql`excluded.email`,
          },
        });
      return id;
    };

    // Demo customers (emails on example.com per docs/01 §7)
    for (const [i, c] of DEMO_CUSTOMERS.entries()) {
      await upsertUser({ ...c, role: "customer", email: `customer${i + 1}@example.com` });
    }

    // Demo worker: role set, profile NOT started, so O1 can be shown live.
    const demoWorkerId = await upsertUser({ ...DEMO_WORKER, role: "worker" });
    await tx.delete(workerSchedule).where(sql`${workerSchedule.workerId} = ${demoWorkerId}`);
    await tx.delete(workerProfiles).where(sql`${workerProfiles.userId} = ${demoWorkerId}`);

    // Seeded workers
    const reference = areaBySlug(EDGE_CASE_REFERENCE_AREA);
    for (const [i, w] of WORKERS.entries()) {
      const id = await upsertUser({
        key: w.key,
        name: w.name,
        nameUr: w.nameUr,
        phone: `030000001${String(i).padStart(2, "0")}`,
        role: "worker",
      });
      const home = areaBySlug(w.areas[0]!);
      // Jitter within ~1 km of the home centroid unless an edge case pins the point.
      const base = w.baseOffsetKm
        ? offsetKm(reference, w.baseOffsetKm.north, w.baseOffsetKm.east)
        : offsetKm(home, (rand() - 0.5) * 2, (rand() - 0.5) * 2);

      const profile = {
        userId: id,
        trade: w.trade,
        yearsExperience: w.years,
        indicativeRatePkr: w.ratePkr,
        rateBasis: w.rateBasis,
        areaSlugs: w.areas,
        baseLat: base.lat,
        baseLng: base.lng,
        isAvailable: w.available,
        onboardingStatus: "complete" as const,
        isSeeded: true,
      };
      await tx
        .insert(workerProfiles)
        .values(profile)
        .onConflictDoUpdate({
          target: workerProfiles.userId,
          set: { ...profile, userId: undefined },
        });

      await tx.delete(workerSchedule).where(sql`${workerSchedule.workerId} = ${id}`);
      const rows = SCHEDULE_TEMPLATES[w.schedule].flatMap((block) =>
        block.weekdays.map((weekday) => ({
          id: seedUuid(`${w.key}:schedule:${weekday}:${block.startMin}`),
          workerId: id,
          weekday,
          startMin: block.startMin,
          endMin: block.endMin,
          isSeeded: true,
        })),
      );
      await tx.insert(workerSchedule).values(rows);

      if (w.edgeCase) {
        const d = distanceKm(reference, base).toFixed(1);
        summary.push(
          `  edge case ${w.edgeCase} → ${w.name} (${w.trade}, ${d} km from ${reference.nameEn})`,
        );
      }
    }
  });

  // Edge case 3 (docs/01 §7): a nearby worker who is engaged for the next 2 hours, backed by a real
  // request → conversation → offer → job chain so the engaged state is the real thing, not a flag.
  // Times are relative to when the seed runs, so re-seed shortly before a demo.
  await db.transaction(async (tx) => {
    const worker = WORKERS.find((w) => w.edgeCase?.startsWith("3:"));
    const customer = DEMO_CUSTOMERS[0];
    if (!worker || !customer) return;
    const area = areaBySlug(EDGE_CASE_REFERENCE_AREA);
    const ids = {
      request: seedUuid("edge3:request"),
      conversation: seedUuid("edge3:conversation"),
      offer: seedUuid("edge3:offer"),
      job: seedUuid("edge3:job"),
      customer: seedUuid(customer.key),
      worker: seedUuid(worker.key),
    };
    // Children first; the job's events cascade with it.
    await tx.delete(jobs).where(sql`${jobs.id} = ${ids.job}`);
    await tx.delete(offers).where(sql`${offers.id} = ${ids.offer}`);
    await tx.delete(conversations).where(sql`${conversations.id} = ${ids.conversation}`);
    await tx.delete(requests).where(sql`${requests.id} = ${ids.request}`);

    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + 2 * 3_600_000);
    await tx.insert(requests).values({
      id: ids.request,
      customerId: ids.customer,
      trade: worker.trade,
      summaryText: "Demo booking: keeps this worker engaged for the next 2 hours.",
      summaryLang: "en",
      source: "tap",
      lat: area.lat,
      lng: area.lng,
      areaSlug: area.slug,
      addressText: "House 1, Street 1 (demo address)",
      startAt,
      durationMin: 120,
      urgency: "now",
      status: "booked",
      isSeeded: true,
    });
    await tx.insert(conversations).values({
      id: ids.conversation,
      requestId: ids.request,
      customerId: ids.customer,
      workerId: ids.worker,
      status: "booked",
      isSeeded: true,
    });
    await tx.insert(offers).values({
      id: ids.offer,
      conversationId: ids.conversation,
      proposerId: ids.worker,
      pricePkr: worker.ratePkr,
      startAt,
      durationMin: 120,
      status: "accepted",
      respondedAt: startAt,
      isSeeded: true,
    });
    await tx.insert(jobs).values({
      id: ids.job,
      requestId: ids.request,
      conversationId: ids.conversation,
      offerId: ids.offer,
      customerId: ids.customer,
      workerId: ids.worker,
      pricePkr: worker.ratePkr,
      startAt,
      endAt,
      status: "confirmed",
      isSeeded: true,
    });
    await tx
      .insert(jobEvents)
      .values({ jobId: ids.job, fromStatus: null, toStatus: "confirmed", actorId: ids.customer });
    summary.push(`  edge case 3 → ${worker.name} has a confirmed job until ${endAt.toISOString()}`);
  });

  const counts = await db.execute<{ trade: string; n: number }>(
    sql`select trade, count(*)::int as n from worker_profiles where is_seeded group by trade order by trade`,
  );

  console.log("Seed complete (all data fictional, is_seeded = true).");
  console.log(`Areas: ${AREAS.length} (approximate centroids)`);
  console.log("Workers per trade:");
  for (const row of counts) console.log(`  ${row.trade}: ${row.n}`);
  console.log("Edge cases:");
  for (const line of summary) console.log(line);
  console.log("Demo accounts (demo phone login, no SMS is sent):");
  for (const c of DEMO_CUSTOMERS) console.log(`  customer  ${c.name.padEnd(16)} ${c.phone}`);
  console.log(`  worker    ${DEMO_WORKER.name.padEnd(16)} ${DEMO_WORKER.phone}  (not onboarded)`);
}

async function main() {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, sql: client } = createDb(url, { max: 1 });
  try {
    await seed(db);
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
