import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "./auth";
import { env } from "./env";
import { can, isStaff, type Permission } from "./permissions";

export async function getSession() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s || (s.user as { disabledAt?: unknown }).disabledAt) return null;
  return s;
}

type Area = "ledenpas" | "scanner" | "beheer";

/** Heeft dit account minstens één passkey? Een passkey (met verplichte gebruikersverificatie) telt als tweede factor. */
export async function hasPasskey(userId: string): Promise<boolean> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.passkey).where(eq(schema.passkey.userId, userId));
  return (r?.n ?? 0) > 0;
}

/** Vereist een ingelogd lid-account. Staf-accounts gebruiken de ledenomgeving niet. */
export async function requireMember() {
  const s = await getSession();
  if (!s) redirect("/ledenpas/inloggen");
  return s;
}

/**
 * Vereist een staf-account met recht `permission`.
 * MFA is verplicht voor beheer-rollen (en optioneel voor scanner via REQUIRE_MFA_SCANNER).
 */
export async function requireStaff(area: Exclude<Area, "ledenpas">, permission: Permission) {
  const s = await getSession();
  if (!s) redirect(`/${area}/inloggen`);
  const role = (s.user as { role?: string }).role ?? "member";
  if (!isStaff(role) || !can(role, permission)) redirect(`/${area}/geen-toegang`);
  const mfaNeeded = role === "manager" || role === "sysadmin" || (role === "scanner" && env.requireMfaForScanner);
  if (mfaNeeded && !s.user.twoFactorEnabled && !(await hasPasskey(s.user.id))) redirect(`/${area}/mfa-instellen`);
  return s;
}

/** Voor API-routes: geeft een sessie of null terug (nooit redirect). */
export async function apiStaff(permission: Permission) {
  const s = await getSession();
  if (!s) return null;
  const role = (s.user as { role?: string }).role ?? "member";
  if (!can(role, permission)) return null;
  const mfaNeeded = role === "manager" || role === "sysadmin" || (role === "scanner" && env.requireMfaForScanner);
  if (mfaNeeded && !s.user.twoFactorEnabled && !(await hasPasskey(s.user.id))) return null;
  return s;
}
