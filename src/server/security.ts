import { createHmac } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { isPasswordPwned } from "@/lib/pwned";
import { rateLimit } from "@/lib/ratelimit";
import { flushNotices, queueNotice } from "./notify";
import type { NoticePayload } from "./email/templates";

const { securityEvent, user } = schema;

/**
 * Beveiligingsmeldingen: verdachte activiteit en kritieke wijzigingen. Elke melding heeft een dedupe-sleutel (één melding per
 * voorval), bevat geen wachtwoorden/tokens/e-mailadressen en wordt per e-mail aan systeembeheerders en/of het betrokken account
 * gestuurd. Drempels staan hieronder op één plek; tellers gebruiken de bestaande rate-limit-tabel.
 */
export type SecurityType =
  | "login_failures" | "login_failures_ip" | "mfa_failures" | "password_breached" | "backup_code_used" | "backup_codes_regenerated"
  | "passkey_added" | "passkey_removed" | "mfa_reset" | "role_changed" | "scan_guessing" | "lookup_scraping" | "export_burst" | "export_off_hours";

export const SECURITY_LABEL: Record<SecurityType, string> = {
  login_failures: "Meerdere mislukte inlogpogingen voor een account",
  login_failures_ip: "Veel mislukte inlogpogingen vanaf één herkomst",
  mfa_failures: "Meerdere onjuiste verificatiecodes",
  password_breached: "Wachtwoord komt voor in een bekend datalek",
  backup_code_used: "Herstelcode gebruikt",
  backup_codes_regenerated: "Nieuwe herstelcodes aangemaakt",
  passkey_added: "Passkey toegevoegd",
  passkey_removed: "Passkey verwijderd",
  mfa_reset: "Tweestapsverificatie gereset door een beheerder",
  role_changed: "Rol van een account gewijzigd",
  scan_guessing: "Veel onbekende of afgewezen scans door één controleur",
  lookup_scraping: "Ongewoon veel zoekopdrachten door één controleur",
  export_burst: "Meerdere exports kort achter elkaar",
  export_off_hours: "Export buiten kantooruren",
};

/** Drempels: [aantal toegestaan, venster in seconden]. De melding volgt bij het eerstvolgende voorval boven de drempel. */
export const THRESHOLDS = {
  loginFailuresUser: [4, 900],
  loginFailuresIp: [14, 900],
  mfaFailuresIp: [4, 900],
  scanUnknown: [9, 600],
  lookups: [100, 3600],
  exports: [2, 3600],
} as const;

export const hashIp = (ip: string) => createHmac("sha256", env.tokenHmacKey).update(`ip:${ip}`).digest("hex").slice(0, 16);
const bucket = (seconds: number) => Math.floor(Date.now() / 1000 / seconds);

async function sysadminIds(): Promise<string[]> {
  const rows = await db.select({ id: user.id }).from(user).where(and(eq(user.role, "sysadmin"), isNull(user.disabledAt), eq(user.emailVerified, true)));
  return rows.map((r) => r.id);
}

export async function raiseSecurityEvent(e: {
  type: SecurityType;
  severity?: "info" | "warning" | "critical";
  userId?: string | null;
  dedupe: string;
  details?: Record<string, unknown>;
  notifyAdmins?: boolean;
  notifyUser?: NoticePayload;
}) {
  const [row] = await db
    .insert(securityEvent)
    .values({ type: e.type, severity: e.severity ?? "warning", userId: e.userId ?? null, dedupeKey: e.dedupe, details: e.details ?? {} })
    .onConflictDoNothing()
    .returning({ id: securityEvent.id });
  if (!row) return null; // dit voorval is al gemeld
  if (e.notifyAdmins) {
    for (const id of await sysadminIds()) {
      await queueNotice(id, `sec:${row.id}`, { title: `Beveiligingsmelding: ${SECURITY_LABEL[e.type]}`, lines: [`${SECURITY_LABEL[e.type]}.`, "Bekijk de melding in Beheer en onderneem zo nodig actie."], cta: { label: "Meldingen bekijken", path: "/beheer/meldingen" } });
    }
  }
  if (e.notifyUser && e.userId) await queueNotice(e.userId, `sec:${row.id}`, e.notifyUser);
  if (e.notifyAdmins || e.notifyUser) await flushNotices();
  return row.id;
}

/* ------------------------------ voorvallen vanuit inloggen ------------------------------ */

/** Mislukte e-mail/wachtwoord-poging. Faalt nooit zichtbaar voor de aanroeper. */
export async function onLoginFailed(email: unknown, ip: string) {
  try {
    const ipHash = hashIp(ip);
    const addr = typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : "";
    const [u] = addr ? await db.select({ id: user.id, role: user.role, verified: user.emailVerified }).from(user).where(eq(user.email, addr)) : [];
    if (u) {
      if (!(await rateLimit(`loginfail:user:${u.id}`, ...THRESHOLDS.loginFailuresUser))) {
        await raiseSecurityEvent({
          type: "login_failures", userId: u.id, dedupe: `lf:${u.id}:${bucket(6 * 3600)}`, details: { window: "15 minuten", ipHash },
          notifyAdmins: u.role !== "member", notifyUser: u.verified ? { title: "Meerdere mislukte inlogpogingen", lines: ["Er zijn meerdere mislukte pogingen gedaan om in te loggen op je HHC ClubSupport-account.", "Ben jij dit niet? Dan hoef je niets te doen: je account blijft beschermd. Vermoed je misbruik, stel dan voor de zekerheid een nieuw wachtwoord in."], cta: { label: "Wachtwoord opnieuw instellen", path: "/wachtwoord-vergeten" } } : undefined,
        });
      }
    } else if (!(await rateLimit(`loginfail:ip:${ipHash}`, ...THRESHOLDS.loginFailuresIp))) {
      await raiseSecurityEvent({ type: "login_failures_ip", severity: "info", dedupe: `lfi:${ipHash}:${bucket(3600)}`, details: { ipHash } });
    }
  } catch (e) {
    console.error("beveiligingsmelding (login) mislukt", e instanceof Error ? e.message : "onbekend");
  }
}

/** Onjuiste verificatiecode of herstelcode (de gebruiker is op dat moment niet te bepalen: telling per herkomst). */
export async function onMfaFailed(ip: string) {
  try {
    const ipHash = hashIp(ip);
    if (!(await rateLimit(`mfafail:ip:${ipHash}`, ...THRESHOLDS.mfaFailuresIp))) {
      await raiseSecurityEvent({ type: "mfa_failures", dedupe: `mf:${ipHash}:${bucket(3600)}`, details: { ipHash }, notifyAdmins: true });
    }
  } catch (e) {
    console.error("beveiligingsmelding (mfa) mislukt", e instanceof Error ? e.message : "onbekend");
  }
}

/** Geslaagde wachtwoordlogin: controleer (k-anonymity) of het wachtwoord in een bekend datalek voorkomt. */
export async function onPasswordLogin(userId: string, password: unknown) {
  try {
    if (typeof password !== "string" || !password) return;
    if ((await isPasswordPwned(password)) !== true) return;
    await raiseSecurityEvent({
      type: "password_breached", severity: "info", userId, dedupe: `pwn:${userId}:${bucket(30 * 86400)}`,
      notifyUser: { title: "Je wachtwoord komt voor in een bekend datalek", lines: ["Het wachtwoord van je HHC ClubSupport-account komt voor in een openbaar bekend datalek van een andere website.", "Kies daarom een nieuw, uniek wachtwoord. Dit hoeft niet direct, maar wij raden het sterk aan."], cta: { label: "Nieuw wachtwoord instellen", path: "/wachtwoord-vergeten" } },
    });
  } catch (e) {
    console.error("beveiligingsmelding (wachtwoordlek) mislukt", e instanceof Error ? e.message : "onbekend");
  }
}

export async function onBackupCodeUsed(userId: string) {
  await raiseSecurityEvent({ type: "backup_code_used", userId, dedupe: `bc:${userId}:${Date.now()}`, notifyAdmins: false, notifyUser: { title: "Een herstelcode is gebruikt", lines: ["Er is met een herstelcode ingelogd op je HHC ClubSupport-account.", "Was jij dit niet? Neem dan direct contact op met een systeembeheerder."] } }).catch(() => undefined);
}

/* ------------------------------ voorvallen vanuit de app ------------------------------ */

/** Na een onbekende/afgewezen scan: veel van die scans door één controleur wijst op code-raden. */
export async function onScanSuspect(scannerUserId: string) {
  try {
    if (!(await rateLimit(`scanunk:${scannerUserId}`, ...THRESHOLDS.scanUnknown))) {
      await raiseSecurityEvent({ type: "scan_guessing", userId: scannerUserId, dedupe: `sg:${scannerUserId}:${bucket(3600)}`, details: { window: "10 minuten" }, notifyAdmins: true });
    }
  } catch (e) {
    console.error("beveiligingsmelding (scan) mislukt", e instanceof Error ? e.message : "onbekend");
  }
}

export async function onLookup(scannerUserId: string) {
  try {
    if (!(await rateLimit(`lookups:${scannerUserId}`, ...THRESHOLDS.lookups))) {
      await raiseSecurityEvent({ type: "lookup_scraping", userId: scannerUserId, dedupe: `ls:${scannerUserId}:${bucket(3600)}`, details: { window: "1 uur" }, notifyAdmins: true });
    }
  } catch (e) {
    console.error("beveiligingsmelding (zoeken) mislukt", e instanceof Error ? e.message : "onbekend");
  }
}

export async function onExport(userId: string, now = new Date()) {
  try {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hour12: false }).format(now));
    if (hour >= 23 || hour < 6) await raiseSecurityEvent({ type: "export_off_hours", severity: "info", userId, dedupe: `eo:${userId}:${bucket(86400)}`, notifyAdmins: true });
    if (!(await rateLimit(`exports:${userId}`, ...THRESHOLDS.exports))) {
      await raiseSecurityEvent({ type: "export_burst", userId, dedupe: `eb:${userId}:${bucket(3600)}`, notifyAdmins: true });
    }
  } catch (e) {
    console.error("beveiligingsmelding (export) mislukt", e instanceof Error ? e.message : "onbekend");
  }
}

/* ------------------------------ beheer ------------------------------ */

export async function listSecurityEvents(opts: { open?: boolean; limit?: number } = {}) {
  return db
    .select({ id: securityEvent.id, at: securityEvent.at, type: securityEvent.type, severity: securityEvent.severity, userId: securityEvent.userId, userName: user.name, details: securityEvent.details, acknowledgedAt: securityEvent.acknowledgedAt })
    .from(securityEvent)
    .leftJoin(user, eq(user.id, securityEvent.userId))
    .where(opts.open ? isNull(securityEvent.acknowledgedAt) : undefined)
    .orderBy(desc(securityEvent.at))
    .limit(opts.limit ?? 100);
}

export async function openSecurityCount() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(securityEvent).where(and(isNull(securityEvent.acknowledgedAt), sql`${securityEvent.severity} <> 'info'`));
  return n;
}

export async function acknowledgeSecurityEvent(actor: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const r = await db.update(securityEvent).set({ acknowledgedAt: new Date(), acknowledgedBy: actor }).where(and(eq(securityEvent.id, id), isNull(securityEvent.acknowledgedAt))).returning({ id: securityEvent.id });
  if (r.length) await audit({ actor, action: "security.acknowledge", targetType: "security_event", targetId: id });
}

/* ------------------------------ MFA-herstel door systeembeheer ------------------------------ */

/**
 * Reset alle tweede factoren (TOTP, herstelcodes, passkeys) van een STAF-account na verlies van het apparaat.
 * Alleen systeembeheer, nooit voor jezelf (gebruik herstelcodes) en altijd met reden. Beëindigt sessies; het account moet bij de
 * volgende login MFA opnieuw instellen. Het betrokken account en alle systeembeheerders krijgen een melding.
 */
export async function resetStaffMfa(actor: string, targetId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("reason_required");
  if (actor === targetId) throw new Error("self");
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(user).where(eq(user.id, targetId)).for("update");
    if (!u || u.role === "member") throw new Error("not_found");
    await tx.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, targetId));
    await tx.delete(schema.passkey).where(eq(schema.passkey.userId, targetId));
    await tx.update(user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(user.id, targetId));
    await tx.delete(schema.session).where(eq(schema.session.userId, targetId));
    await audit({ actor, action: "staff.mfa_reset", targetType: "user", targetId, metadata: { reason: why.slice(0, 300) } }, tx);
  });
  await raiseSecurityEvent({
    type: "mfa_reset", userId: targetId, dedupe: `mr:${targetId}:${Date.now()}`, details: { by: actor }, notifyAdmins: true,
    notifyUser: { title: "Je tweestapsverificatie is gereset", lines: ["Een systeembeheerder heeft de tweestapsverificatie en passkeys van je HHC ClubSupport-account gereset.", "Bij je volgende login stel je tweestapsverificatie opnieuw in. Heb je dit niet aangevraagd? Neem dan direct contact op met een systeembeheerder."] },
  });
}
