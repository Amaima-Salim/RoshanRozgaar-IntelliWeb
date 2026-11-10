import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { loadEnvFiles } from "../../src/lib/db/load-env";

/** Seeded worker Naveed Akhtar (electrician, G-9/I-8, day schedule), index 2 in the seed list. */
export const WORKER_PHONE = "03000000102";
export const WORKER_NAME = "Naveed Akhtar";
export const CUSTOMER_1 = "03000000001";
export const CUSTOMER_2 = "03000000002";
const TAG = "e2e-booking";

function client() {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 1, onnotice: () => {} });
}

/** A Wednesday, 10:00 Asia/Karachi (05:00Z), `weeksAhead` weeks out: inside Naveed's day hours. */
export function wednesday10(weeksAhead: number): Date {
  const d = new Date(Date.now() + weeksAhead * 7 * 24 * 3600_000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(5, 0, 0, 0);
  return d;
}

/** Removes everything earlier runs of these tests created (matched by the summary tag). */
export async function cleanBookingData() {
  const sql = client();
  try {
    await sql`delete from jobs where request_id in (select id from requests where summary_text = ${TAG})`;
    await sql`delete from offers where conversation_id in (select c.id from conversations c join requests r on r.id = c.request_id where r.summary_text = ${TAG})`;
    await sql`delete from conversations where request_id in (select id from requests where summary_text = ${TAG})`;
    await sql`delete from requests where summary_text = ${TAG}`;
  } finally {
    await sql.end();
  }
}

/** A pending offer from Naveed to the customer with that demo phone, the state a chat leaves behind. */
export async function createPendingOffer(customerPhone: string, startAt: Date, priceP = 1800) {
  const sql = client();
  try {
    const [customer] = await sql<
      { id: string }[]
    >`select id from users where phone = ${customerPhone}`;
    const [worker] = await sql<
      { id: string }[]
    >`select id from users where phone = ${WORKER_PHONE}`;
    if (!customer || !worker) throw new Error("seed users missing: run npm run db:seed");
    const requestId = randomUUID();
    const conversationId = randomUUID();
    const offerId = randomUUID();
    await sql`insert into requests (id, customer_id, trade, summary_text, source, lat, lng, area_slug, address_text, start_at, duration_min, urgency)
      values (${requestId}, ${customer.id}, 'electrician', ${TAG}, 'tap', 33.69, 73.03, 'g-9', 'House 21, Street 5, G-9', ${startAt}, 60, 'scheduled')`;
    await sql`insert into conversations (id, request_id, customer_id, worker_id) values (${conversationId}, ${requestId}, ${customer.id}, ${worker.id})`;
    await sql`insert into offers (id, conversation_id, proposer_id, price_pkr, start_at, duration_min)
      values (${offerId}, ${conversationId}, ${worker.id}, ${priceP}, ${startAt}, 60)`;
    return { offerId, requestId, conversationId };
  } finally {
    await sql.end();
  }
}

export async function jobsForOffers(offerIds: string[]) {
  const sql = client();
  try {
    return await sql<
      { id: string; status: string; offer_id: string }[]
    >`select id, status, offer_id from jobs where offer_id in ${sql(offerIds)}`;
  } finally {
    await sql.end();
  }
}
