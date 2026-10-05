import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashLinkToken } from "@/lib/tokens";

const { accountToken, user } = schema;

export type Purpose = "activation" | "reset";

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== "string") return "Kies een wachtwoord.";
  if (pw.length < PASSWORD_MIN) return `Gebruik minimaal ${PASSWORD_MIN} tekens.`;
  if (pw.length > PASSWORD_MAX) return `Gebruik maximaal ${PASSWORD_MAX} tekens.`;
  return null;
}

/** Eenmalig, atomisch: markeert een geldige, niet-verlopen en ongebruikte token als gebruikt. */
export async function consumeLinkToken(token: unknown, purpose: Purpose): Promise<string | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const rows = await db
    .update(accountToken)
    .set({ usedAt: new Date() })
    .where(and(eq(accountToken.tokenHash, hashLinkToken(token)), eq(accountToken.purpose, purpose), isNull(accountToken.usedAt), gt(accountToken.expiresAt, new Date())))
    .returning({ userId: accountToken.userId });
  return rows[0]?.userId ?? null;
}

/** Controleert zonder te verbruiken of een link nog bruikbaar is (voor de UI). */
export async function isLinkUsable(token: unknown, purpose: Purpose): Promise<boolean> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return false;
  const rows = await db
    .select({ id: accountToken.id })
    .from(accountToken)
    .where(and(eq(accountToken.tokenHash, hashLinkToken(token)), eq(accountToken.purpose, purpose), isNull(accountToken.usedAt), gt(accountToken.expiresAt, new Date())));
  return rows.length > 0;
}

/**
 * Stelt het wachtwoord in via Better Auth (hashing en opslag door de identity provider; geen eigen crypto).
 * Activatie: bevestigt het e-mailadres. Beide: bestaande sessies worden ingetrokken.
 */
export async function setPasswordWithToken(token: string, password: string, purpose: Purpose): Promise<{ ok: boolean; error?: string; area?: "ledenpas" | "beheer" | "scanner" }> {
  const pwError = validatePassword(password);
  if (pwError) return { ok: false, error: pwError };
  const userId = await consumeLinkToken(token, purpose);
  if (!userId) return { ok: false, error: "Deze link is ongeldig of verlopen." };

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  const accounts = await ctx.internalAdapter.findAccounts(userId);
  const cred = accounts.find((a) => a.providerId === "credential");
  if (purpose === "reset" && !cred) return { ok: false, error: "Deze link is ongeldig of verlopen." };
  if (cred) await ctx.internalAdapter.updatePassword(userId, hash);
  else await ctx.internalAdapter.linkAccount({ userId, providerId: "credential", accountId: userId, password: hash });
  if (purpose === "activation") await db.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, userId));
  await db.delete(schema.session).where(eq(schema.session.userId, userId)); // alle bestaande sessies intrekken
  await audit({ actor: userId, action: purpose === "activation" ? "account.activate" : "account.password_reset", targetType: "user", targetId: userId });
  const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  const area = u?.role === "scanner" ? "scanner" : u?.role === "manager" || u?.role === "sysadmin" ? "beheer" : "ledenpas";
  return { ok: true, area };
}
