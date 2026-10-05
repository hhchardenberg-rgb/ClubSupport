import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { generateLinkToken, hashLinkToken } from "@/lib/tokens";
import { env } from "@/lib/env";
import { invitationMail, passNoticeMail, resetMail, type Mail } from "./templates";
import { sendMail } from "./provider";

const { emailOutbox, user, accountToken } = schema;

export const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000; // maximaal 24 uur
export const RESET_TTL_MS = 60 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

/** Maakt een eenmalige link-token; alleen de hash wordt opgeslagen. Eerdere open tokens van dit doel vervallen. */
export async function createLinkToken(userId: string, purpose: "activation" | "reset", ttlMs: number) {
  const token = generateLinkToken();
  await db.transaction(async (tx) => {
    await tx
      .update(accountToken)
      .set({ usedAt: new Date() })
      .where(and(eq(accountToken.userId, userId), eq(accountToken.purpose, purpose), sql`${accountToken.usedAt} is null`));
    await tx.insert(accountToken).values({ userId, purpose, tokenHash: hashLinkToken(token), expiresAt: new Date(Date.now() + ttlMs) });
  });
  return token;
}

async function buildMail(row: typeof emailOutbox.$inferSelect, u: typeof user.$inferSelect): Promise<Mail> {
  if (row.kind === "invitation") {
    const t = await createLinkToken(u.id, "activation", ACTIVATION_TTL_MS);
    return invitationMail({ name: u.name, loginName: u.email, link: `${env.appUrl}/activeren?token=${t}` });
  }
  if (row.kind === "password_reset") {
    const t = await createLinkToken(u.id, "reset", RESET_TTL_MS);
    return resetMail({ link: `${env.appUrl}/wachtwoord-resetten?token=${t}` });
  }
  return passNoticeMail({ name: u.name });
}

/**
 * Verwerkt due-rijen ná de databasetransactie die ze aanmaakte. Idempotent: een rij wordt
 * atomair 'geclaimd' (pending→sending), zodat parallelle workers nooit dubbel mailen.
 * Begrensde retries met exponentiële backoff; daarna status 'failed' (zichtbaar voor beheer).
 */
export async function processOutbox(limit = 20): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const due = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, new Date())))
    .limit(limit);

  for (const { id } of due) {
    const [row] = await db
      .update(emailOutbox)
      .set({ status: "sending", attempts: sql`${emailOutbox.attempts} + 1` })
      .where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, "pending")))
      .returning();
    if (!row) continue; // al door een andere worker geclaimd
    const [u] = row.userId ? await db.select().from(user).where(eq(user.id, row.userId)) : [];
    if (!u) {
      await db.update(emailOutbox).set({ status: "failed", lastError: "Account niet gevonden" }).where(eq(emailOutbox.id, id));
      failed++;
      continue;
    }
    const mail = await buildMail(row, u);
    const res = await sendMail(u.email, mail, `${row.idempotencyKey}:${row.attempts}`);
    if (res.ok === true) {
      await db.update(emailOutbox).set({ status: "sent", sentAt: new Date(), providerRef: res.ref, lastError: null }).where(eq(emailOutbox.id, id));
      sent++;
    } else if (res.ok === "suppressed") {
      await db.update(emailOutbox).set({ status: "suppressed", lastError: "E-mail uitgeschakeld (EMAIL_MODE=disabled)" }).where(eq(emailOutbox.id, id));
    } else {
      const final = res.permanent || row.attempts >= MAX_ATTEMPTS;
      await db
        .update(emailOutbox)
        .set({
          status: final ? "failed" : "pending",
          lastError: res.error,
          nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** row.attempts) * 60_000),
        })
        .where(eq(emailOutbox.id, id));
      if (final) failed++;
    }
  }
  return { sent, failed };
}

/** Beheer: verlopen/mislukte uitnodiging opnieuw laten versturen (nieuwe sleutel, nieuwe token). */
export async function resendInvitation(userId: string, memberId: string | null) {
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) throw new Error("not_found");
  if (u.emailVerified) throw new Error("already_active"); // geactiveerde accounts krijgen nooit een nieuwe activatiecode
  await db.insert(emailOutbox).values({ kind: "invitation", idempotencyKey: `invite:${userId}:resend:${Date.now()}`, userId, memberId });
}

/** Wachtwoordherstel: altijd dezelfde uitkomst voor de aanvrager; mail alleen bij een geactiveerd account. */
export async function requestPasswordReset(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const [u] = await db.select().from(user).where(eq(user.email, email));
  if (!u || !u.emailVerified || u.disabledAt) return;
  await db.insert(emailOutbox).values({ kind: "password_reset", idempotencyKey: `reset:${u.id}:${Date.now()}`, userId: u.id });
}
