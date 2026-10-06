import { sql } from "drizzle-orm";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";

/**
 * Bewaartermijnen (configureerbaar via env, zie README):
 *  - scan_event            SCAN_RETENTION_DAYS (90)
 *  - audit_event           AUDIT_RETENTION_DAYS (730)
 *  - verwijderde leden     DELETED_MEMBER_RETENTION_DAYS (90) daarna definitief gewist (incl. passen/koppelingen)
 *  - tokens, importbatches, rate-limit, sessies, verzonden mails: korte vaste termijnen
 * Het audit-spoor bevat alleen id's, dus wissen van een lid laat geen persoonsgegevens achter.
 */
export async function purgeExpiredData() {
  const scanDays = env.scanRetentionDays;
  const auditDays = env.auditRetentionDays;
  const memberDays = env.deletedMemberRetentionDays;
  const count = async (q: ReturnType<typeof sql>) => Number((await db.execute(q)).rowCount ?? 0);
  const result = {
    scans: await count(sql`delete from scan_event where at < now() - make_interval(days => ${scanDays})`),
    members: await count(sql`delete from member where deleted_at is not null and deleted_at < now() - make_interval(days => ${memberDays})`),
    newsletterDeliveries: await count(sql`delete from newsletter_delivery d using newsletter n where n.id = d.newsletter_id and n.status in ('sent','cancelled') and n.sent_at < now() - make_interval(days => ${env.newsletterDeliveryRetentionDays})`),
    changeRequests: await count(sql`delete from change_request where status <> 'pending' and decided_at < now() - interval '90 days'`),
    securityEvents: await count(sql`delete from security_event where at < now() - interval '365 days'`),
    tokens: await count(sql`delete from account_token where expires_at < now() - interval '7 days' or used_at < now() - interval '7 days'`),
    importBatches: await count(sql`delete from import_batch where expires_at < now() - interval '1 day' or committed_at < now() - interval '1 day'`),
    rateLimits: await count(sql`delete from app_rate_limit where window_start < now() - interval '1 day'`),
    sessions: await count(sql`delete from session where expires_at < now()`),
    mails: await count(sql`delete from email_outbox where status in ('sent','suppressed') and created_at < now() - interval '90 days'`),
    audit: await count(sql`delete from audit_event where at < now() - make_interval(days => ${auditDays})`),
  };
  await audit({ actor: null, action: "retention.purge", metadata: result });
  return result;
}
