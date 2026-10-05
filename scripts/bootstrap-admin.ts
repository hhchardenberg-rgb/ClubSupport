/**
 * Eerste systeembeheerder aanmaken (eenmalig, idempotent).
 * Alleen actief als BOOTSTRAP_ADMIN_EMAIL is gezet én er nog GEEN sysadmin bestaat.
 * Er wordt geen wachtwoord gekozen: de beheerder krijgt een eenmalige activatielink (24 uur) in de
 * buildlog en stelt daar zelf een wachtwoord in; daarna is MFA-inrichting verplicht.
 * Verwijder BOOTSTRAP_ADMIN_EMAIL na het eerste gebruik.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { generateLinkToken, hashLinkToken } from "../src/lib/tokens";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !process.env.DATABASE_URL) return;
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") return;

  // Alleen doorgaan zolang er nog geen GEACTIVEERDE systeembeheerder is (wel opnieuw een verse link mogelijk).
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from "user" where role = 'sysadmin' and email_verified = true`)).rows as { n: number }[];
  if (n > 0) {
    console.log("Bootstrap: er bestaat al een geactiveerde systeembeheerder — overgeslagen.");
    return;
  }
  const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  const userId = existing?.id ?? randomUUID();
  if (existing) await db.update(schema.user).set({ role: "sysadmin" }).where(eq(schema.user.id, userId));
  else await db.insert(schema.user).values({ id: userId, name: "Systeembeheer", email, role: "sysadmin", emailVerified: false });

  // Staat er al een geldige, ongebruikte link? Dan geen nieuwe uitgeven (anders maakt elke deploy de vorige ongeldig).
  const [open] = (await db.execute(sql`select 1 as x from account_token where user_id = ${userId} and purpose = 'activation' and used_at is null and expires_at > now() limit 1`)).rows;
  if (open) {
    console.log("Bootstrap: er staat al een geldige activatielink open — geen nieuwe uitgegeven.");
    return;
  }
  await db.update(schema.accountToken).set({ usedAt: new Date() }).where(and(eq(schema.accountToken.userId, userId), eq(schema.accountToken.purpose, "activation"), sql`used_at is null`));
  const token = generateLinkToken();
  await db.insert(schema.accountToken).values({ userId, purpose: "activation", tokenHash: hashLinkToken(token), expiresAt: new Date(Date.now() + 24 * 3600 * 1000) });
  await db.insert(schema.auditEvent).values({ actorUserId: null, action: "bootstrap.sysadmin", targetType: "user", targetId: userId, metadata: {} });
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  console.log(`\n=== BOOTSTRAP: activatielink systeembeheerder (24 uur, eenmalig) ===\n${base}/activeren?token=${token}\n===\n`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
