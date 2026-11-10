import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getConfig } from "@/lib/config";

/**
 * Lazy expiry (Phase 5 task 7): no cron. Stale offers, then open requests with no activity for
 * OFFER_TTL_HOURS, are expired whenever someone looks. "Activity" is the newest of the request
 * itself, its messages and its offers, so an active chat never expires. Idempotent.
 * `requestId` narrows the sweep to one request (used by accept).
 */
export async function expireStale(opts: { now?: Date; requestId?: string } = {}) {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - getConfig().product.offerTtlHours * 3_600_000);
  const nowTs = sql`${now.toISOString()}::timestamptz`;
  const cutoffTs = sql`${cutoff.toISOString()}::timestamptz`;
  const only = opts.requestId ? sql`and r.id = ${opts.requestId}` : sql``;

  await db.transaction(async (tx) => {
    // 1. Requests that went quiet. Never one that already has a booking.
    await tx.execute(sql`
      with stale as (
        select r.id from requests r
        where r.status = 'open' ${only}
          and not exists (select 1 from jobs j where j.request_id = r.id and j.status in ('confirmed','in_progress','completed'))
          and greatest(
                r.updated_at,
                coalesce((select max(m.created_at) from messages m join conversations c on c.id = m.conversation_id where c.request_id = r.id), r.updated_at),
                coalesce((select max(o.created_at) from offers o join conversations c on c.id = o.conversation_id where c.request_id = r.id), r.updated_at)
              ) < ${cutoffTs}
      ), x1 as (
        update offers set status = 'expired', responded_at = ${nowTs}
        where status = 'pending' and conversation_id in (select id from conversations where request_id in (select id from stale))
      ), x2 as (
        update conversations set status = 'closed', updated_at = ${nowTs}
        where status = 'open' and request_id in (select id from stale)
      )
      update requests set status = 'expired', version = version + 1, updated_at = ${nowTs}
      where id in (select id from stale)
    `);
    // 2. Individual pending offers older than the TTL, even when the chat is still alive.
    await tx.execute(sql`
      update offers set status = 'expired', responded_at = ${nowTs}
      where status = 'pending' and created_at < ${cutoffTs}
        ${opts.requestId ? sql`and conversation_id in (select id from conversations where request_id = ${opts.requestId})` : sql``}
    `);
  });
}
