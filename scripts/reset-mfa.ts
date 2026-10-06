/**
 * Noodscript (break-glass): tweede factoren van één staf-account resetten wanneer GEEN systeembeheerder meer kan inloggen.
 * Vereist directe toegang tot de database (DATABASE_URL), dus alleen voor wie de omgeving beheert.
 *
 *   DATABASE_URL=... npx tsx scripts/reset-mfa.ts jan@vereniging.nl "telefoon kwijt, identiteit gecontroleerd"
 *
 * Verwijdert TOTP, herstelcodes en passkeys, beëindigt sessies en legt de handeling vast in het auditlog.
 * Het account stelt bij de volgende login MFA opnieuw in. Er wordt geen mail verstuurd (geen app-context).
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";

async function main() {
  const [email, reason] = [process.argv[2]?.trim().toLowerCase(), process.argv[3]?.trim()];
  if (!process.env.DATABASE_URL || !email || !reason || reason.length < 3) {
    console.error('Gebruik: DATABASE_URL=… npx tsx scripts/reset-mfa.ts <e-mailadres> "<reden>"');
    process.exit(2);
  }
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  if (!u || u.role === "member") {
    console.error("Geen staf-account met dit e-mailadres.");
    process.exit(1);
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, u.id));
    await tx.delete(schema.passkey).where(eq(schema.passkey.userId, u.id));
    await tx.update(schema.user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(schema.user.id, u.id));
    await tx.delete(schema.session).where(eq(schema.session.userId, u.id));
    await tx.insert(schema.auditEvent).values({ actorUserId: null, action: "staff.mfa_reset", targetType: "user", targetId: u.id, metadata: { reason: reason.slice(0, 300), via: "noodscript" } });
  });
  console.log(`MFA van ${u.id} gereset. Het account stelt MFA opnieuw in bij de volgende login.`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
