/**
 * Herstel van de toegang van een systeembeheerder (break-glass) wanneer e-mail (nog) niet werkt.
 * Alleen actief als ADMIN_RECOVERY_EMAIL is gezet, alleen voor een GEACTIVEERDE, niet-geblokkeerde systeembeheerder en alleen in
 * productie. Geeft een eenmalige wachtwoordherstellink (4 uur) in de buildlog, net als bootstrap-admin; de eigenaar kiest daar
 * zelf een nieuw wachtwoord (alle sessies worden dan beëindigd). MFA/passkeys blijven ongemoeid: bij verlies daarvan gebruik je
 * scripts/reset-mfa.ts. VERWIJDER ADMIN_RECOVERY_EMAIL na gebruik, anders komt er bij elke deploy een nieuwe link.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { generateLinkToken, hashLinkToken } from "../src/lib/tokens";

async function main() {
  const email = process.env.ADMIN_RECOVERY_EMAIL?.trim().toLowerCase();
  if (!email || !process.env.DATABASE_URL) return;
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") return;
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  if (!u || u.role !== "sysadmin" || !u.emailVerified || u.disabledAt) {
    console.log("Herstel: geen geactiveerde, actieve systeembeheerder met dit adres — overgeslagen.");
    return;
  }
  const accounts = await db.select().from(schema.authAccount).where(and(eq(schema.authAccount.userId, u.id), eq(schema.authAccount.providerId, "credential")));
  if (!accounts.length) {
    console.log("Herstel: dit account heeft nog geen wachtwoord — gebruik de activatielink (BOOTSTRAP_ADMIN_EMAIL).");
    return;
  }
  await db.update(schema.accountToken).set({ usedAt: new Date() }).where(and(eq(schema.accountToken.userId, u.id), eq(schema.accountToken.purpose, "reset"), sql`used_at is null`));
  const token = generateLinkToken();
  await db.insert(schema.accountToken).values({ userId: u.id, purpose: "reset", tokenHash: hashLinkToken(token), expiresAt: new Date(Date.now() + 4 * 3600 * 1000) });
  await db.insert(schema.auditEvent).values({ actorUserId: null, action: "admin.recovery_link", targetType: "user", targetId: u.id, metadata: { via: "build" } });
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  console.log(`\n=== HERSTEL: wachtwoordlink systeembeheerder (4 uur, eenmalig) ===\n${base}/wachtwoord-resetten?token=${token}\n===\n`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
