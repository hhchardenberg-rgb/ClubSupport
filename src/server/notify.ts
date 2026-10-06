import { db, schema, type Tx } from "@/db";
import { processOutbox } from "./email/outbox";
import type { NoticePayload } from "./email/templates";

/**
 * Zet een korte melding klaar voor een account (via de bestaande, idempotente outbox). `key` maakt de melding uniek:
 * hetzelfde voorval levert nooit twee mails op. Aanroeper mag `flushNotices()` aanroepen ná zijn transactie.
 */
export async function queueNotice(userId: string, key: string, payload: NoticePayload, tx: Tx | typeof db = db) {
  await tx.insert(schema.emailOutbox).values({ kind: "notice", idempotencyKey: `notice:${key}:${userId}`, userId, payload: payload as unknown as Record<string, unknown> }).onConflictDoNothing();
}

export const flushNotices = () => processOutbox(10).catch(() => undefined);
