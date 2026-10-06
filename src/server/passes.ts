import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { canTransition, scanOutcomeFor, type RevocationReason, type ScanOutcome } from "@/lib/status";
import { decryptToken, encryptToken, generatePassToken, hashToken, isWellFormedPassToken } from "@/lib/tokens";
import { rateLimit } from "@/lib/ratelimit";
import { onLookup, onScanSuspect } from "./security";
import { amsterdamToday, effectiveMembership, isMembershipValid } from "@/lib/membership";

export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const { pass, member, scanEvent, membership } = schema;

/** Geeft een nieuwe levende pas uit. De ruwe token wordt alleen versleuteld bewaard. */
export async function issuePassTx(tx: Tx, memberId: string, actor: string | null, id: string = randomUUID()) {
  const token = generatePassToken();
  await tx.insert(pass).values({
    id,
    memberId,
    tokenHash: hashToken(token),
    tokenCiphertext: encryptToken(token, id),
    status: "active",
    createdBy: actor,
  });
  return { passId: id };
}

async function lockLivePass(tx: Tx, passId: string) {
  const rows = await tx.select().from(pass).where(eq(pass.id, passId)).for("update");
  const p = rows[0];
  if (!p) throw new DomainError("not_found", "Pas niet gevonden");
  return p;
}

function requireReason(reason: string | undefined) {
  const r = (reason ?? "").trim();
  if (r.length < 3) throw new DomainError("reason_required", "Een reden is verplicht (minimaal 3 tekens)");
  return r.slice(0, 300);
}

export async function deactivatePass(passId: string, actor: string, reason: string) {
  const note = requireReason(reason);
  await db.transaction(async (tx) => {
    const p = await lockLivePass(tx, passId);
    if (!canTransition(p.status, "deactivated")) throw new DomainError("invalid_transition", "Deze pas kan niet worden gedeactiveerd");
    await tx.update(pass).set({ status: "deactivated", deactivatedAt: new Date(), statusNote: note }).where(eq(pass.id, passId));
    await audit({ actor, action: "pass.deactivate", targetType: "pass", targetId: passId, metadata: { memberId: p.memberId, reason: note } }, tx);
  });
}

/** Alleen gedeactiveerde passen; een definitief ingetrokken pas kan nooit terug. */
export async function reactivatePass(passId: string, actor: string, reason: string) {
  const note = requireReason(reason);
  await db.transaction(async (tx) => {
    const p = await lockLivePass(tx, passId);
    if (p.status === "revoked") throw new DomainError("revoked_final", "Een definitief ingetrokken pas kan niet worden geactiveerd");
    if (!canTransition(p.status, "active")) throw new DomainError("invalid_transition", "Deze pas kan niet worden geactiveerd");
    const [m] = await tx.select().from(member).where(eq(member.id, p.memberId));
    if (!m || m.deletedAt) throw new DomainError("member_deleted", "Het lid is verwijderd");
    await tx.update(pass).set({ status: "active", deactivatedAt: null, statusNote: note }).where(eq(pass.id, passId));
    await audit({ actor, action: "pass.reactivate", targetType: "pass", targetId: passId, metadata: { memberId: p.memberId, reason: note } }, tx);
  });
}

async function revokeTx(tx: Tx, p: typeof pass.$inferSelect, reason: RevocationReason, note: string | null, replacedBy: string | null) {
  await tx
    .update(pass)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revocationReason: reason,
      statusNote: note,
      tokenCiphertext: null, // ruwe token kan nooit meer worden hersteld
      replacedByPassId: replacedBy,
    })
    .where(eq(pass.id, p.id));
}

/** Definitief intrekken zonder nieuwe pas (verloren/gelekt). */
export async function revokePass(passId: string, actor: string, reason: "lost" | "leaked" | "admin", note: string) {
  const n = requireReason(note);
  await db.transaction(async (tx) => {
    const p = await lockLivePass(tx, passId);
    if (p.status === "revoked") throw new DomainError("revoked_final", "Pas is al definitief ingetrokken");
    await revokeTx(tx, p, reason, n, null);
    await audit({ actor, action: "pass.revoke", targetType: "pass", targetId: passId, metadata: { memberId: p.memberId, reason, note: n } }, tx);
  });
}

/** Heruitgifte: oude token direct en onomkeerbaar ingetrokken, nieuwe unieke token aangemaakt. */
export async function reissuePass(memberId: string, actor: string, reason: "reissued" | "lost" | "leaked", note: string) {
  const n = requireReason(note);
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(member).where(eq(member.id, memberId)).for("update");
    if (!m || m.deletedAt) throw new DomainError("not_found", "Lid niet gevonden");
    const newId = randomUUID();
    const live = await tx
      .select()
      .from(pass)
      .where(and(eq(pass.memberId, memberId), sql`${pass.status} in ('active','deactivated')`))
      .for("update");
    // Eerst intrekken (unieke index: één levende pas per lid), dan nieuwe uitgeven.
    for (const old of live) await revokeTx(tx, old, reason, n, newId);
    await issuePassTx(tx, memberId, actor, newId);
    await audit(
      { actor, action: "pass.reissue", targetType: "pass", targetId: newId, metadata: { memberId, reason, note: n, revokedPassIds: live.map((l) => l.id) } },
      tx,
    );
    return { passId: newId, revokedPassIds: live.map((l) => l.id) };
  });
}

/**
 * Verwijdert een lid (soft delete): pas direct definitief ingetrokken, lid niet meer zichtbaar, toegang tot het lid ingetrokken.
 * Accounts en andere leden blijven bestaan. Definitief wissen gebeurt pas na de bewaartermijn (purge-job).
 */
export async function deleteMember(memberId: string, actor: string, note: string, opts: { requireArchived?: boolean } = {}) {
  const n = requireReason(note);
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(member).where(eq(member.id, memberId)).for("update");
    if (!m || m.deletedAt) throw new DomainError("not_found", "Lid niet gevonden");
    if (opts.requireArchived && !m.archivedAt) throw new DomainError("archive_first", "Archiveer het lid eerst. Verwijderen kan alleen voor een gearchiveerd lid.");
    const live = await tx.select().from(pass).where(and(eq(pass.memberId, memberId), sql`${pass.status} in ('active','deactivated')`)).for("update");
    for (const p of live) await revokeTx(tx, p, "deleted", n, null);
    await tx.update(member).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(member.id, memberId));
    await tx
      .update(schema.accountMemberAccess)
      .set({ revokedAt: new Date(), revokedBy: actor })
      .where(and(eq(schema.accountMemberAccess.memberId, memberId), sql`${schema.accountMemberAccess.revokedAt} is null`));
    await audit({ actor, action: "member.delete", targetType: "member", targetId: memberId, metadata: { reason: n, revokedPassIds: live.map((l) => l.id) } }, tx);
  });
}

/** Ruwe token van een levende pas, voor de QR van de rechthebbende. Nooit loggen. */
export function revealToken(p: { id: string; tokenCiphertext: string | null; status: string }): string | null {
  if (p.status === "revoked" || !p.tokenCiphertext) return null;
  return decryptToken(p.tokenCiphertext, p.id);
}

export type ScanResult =
  | { outcome: "valid"; name: string; memberNumber: string }
  | { outcome: "inactive"; name: string; memberNumber: string }
  /** Pas is actief, maar het lidmaatschap is niet (meer) geldig of het lid is gearchiveerd. */
  | { outcome: "membership_invalid"; name: string; memberNumber: string }
  | { outcome: "revoked" }
  | { outcome: "unknown" }
  | { outcome: "rate_limited" };

/**
 * Server-side scan. De database is de enige bron van waarheid.
 * Onbekende/misvormde codes geven één generiek resultaat zonder persoonsgegevens.
 */
export async function scanToken(rawToken: unknown, scannerUserId: string): Promise<ScanResult> {
  // Per controleur: begrenst brute force/enumeratie. (IP-limiet staat in de route.)
  if (!(await rateLimit(`scan:user:${scannerUserId}`, 60, 60))) {
    await db.insert(scanEvent).values({ scannerUserId, outcome: "rate_limited" });
    await onScanSuspect(scannerUserId);
    return { outcome: "rate_limited" };
  }
  if (!isWellFormedPassToken(rawToken)) {
    await db.insert(scanEvent).values({ scannerUserId, outcome: "unknown" });
    await onScanSuspect(scannerUserId);
    return { outcome: "unknown" };
  }
  const rows = await db
    .select({ id: pass.id, memberId: member.id, status: pass.status, name: member.fullName, number: member.memberNumber, deletedAt: member.deletedAt, archivedAt: member.archivedAt })
    .from(pass)
    .innerJoin(member, eq(member.id, pass.memberId))
    .where(eq(pass.tokenHash, hashToken(rawToken)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    await db.insert(scanEvent).values({ scannerUserId, outcome: "unknown" });
    await onScanSuspect(scannerUserId);
    return { outcome: "unknown" };
  }
  // Geldig = pas actief EN lidmaatschap nu geldig (datums in Europe/Amsterdam) EN lid niet gearchiveerd/verwijderd.
  const ms = await db.select({ status: membership.status, startDate: membership.startDate, endDate: membership.endDate }).from(membership).where(eq(membership.memberId, row.memberId));
  const membershipValid = isMembershipValid(effectiveMembership(ms, amsterdamToday()));
  const outcome: ScanOutcome = scanOutcomeFor({ status: row.status, memberDeleted: !!row.deletedAt, memberArchived: !!row.archivedAt, membershipValid });
  await db.insert(scanEvent).values({ scannerUserId, passId: row.id, outcome });
  if (outcome === "valid" || outcome === "inactive" || outcome === "membership_invalid") return { outcome, name: row.name, memberNumber: row.number };
  return { outcome: "revoked" }; // definitief ingetrokken/verwijderd: geen persoonsgegevens
}

export type LookupResult =
  | { ok: true; results: { name: string; memberNumber: string; pass: "active" | "deactivated" | "membership" | "none" }[]; tooMany: false }
  | { ok: true; results: []; tooMany: true }
  | { ok: false; reason: "invalid" | "rate_limited" };

export const LOOKUP_MIN_CHARS = 3;
export const LOOKUP_MAX_RESULTS = 8;

/**
 * Beperkte ledenzoekfunctie voor de controleur (lid heeft de pas niet bij zich).
 * Bewust smal: zoekterm minimaal 3 tekens (of een exact lidnummer), maximaal 8 resultaten (anders "te veel
 * resultaten", dus geen lijst op te vragen), alleen naam + lidnummer + passtatus — geen e-mail of andere gegevens.
 * Verwijderde leden worden nooit getoond. De zoekterm wordt niet gelogd; wel dat er gezocht is.
 */
export async function lookupMembers(rawQuery: unknown, scannerUserId: string): Promise<LookupResult> {
  if (!(await rateLimit(`lookup:user:${scannerUserId}`, 30, 60))) return { ok: false, reason: "rate_limited" };
  const q = typeof rawQuery === "string" ? rawQuery.trim().replace(/\s+/g, " ") : "";
  // eslint-disable-next-line no-control-regex
  if (q.length < 1 || q.length > 60 || /[\u0000-\u001F\u007F]/.test(q)) return { ok: false, reason: "invalid" };
  const esc = q.replace(/[\\%_]/g, (m) => "\\" + m);
  const byNumber = sql`lower(${member.memberNumber}) = lower(${q})`;
  const fuzzy = q.length >= LOOKUP_MIN_CHARS ? sql` or ${member.memberNumber} ilike ${esc + "%"} or ${member.fullName} ilike ${"%" + esc + "%"}` : sql``;
  const rows = await db
    .select({ id: member.id, name: member.fullName, memberNumber: member.memberNumber, passStatus: pass.status, archivedAt: member.archivedAt })
    .from(member)
    .leftJoin(pass, and(eq(pass.memberId, member.id), sql`${pass.status} in ('active','deactivated')`))
    .where(and(sql`${member.deletedAt} is null`, sql`(${byNumber}${fuzzy})`))
    .orderBy(member.fullName)
    .limit(LOOKUP_MAX_RESULTS + 1);
  await db.insert(scanEvent).values({ scannerUserId, outcome: "lookup", resultCount: rows.length });
  await onLookup(scannerUserId);
  if (rows.length > LOOKUP_MAX_RESULTS) return { ok: true, results: [], tooMany: true };
  // "active" alleen als pas én lidmaatschap nu geldig zijn; anders "membership" (pas actief, lidmaatschap/archief niet).
  const today = amsterdamToday();
  const ms = rows.length ? await db.select({ memberId: membership.memberId, status: membership.status, startDate: membership.startDate, endDate: membership.endDate }).from(membership).where(inArray(membership.memberId, rows.map((r) => r.id))) : [];
  const valid = (id: string) => isMembershipValid(effectiveMembership(ms.filter((x) => x.memberId === id), today));
  return {
    ok: true,
    tooMany: false,
    results: rows.map((r) => ({
      name: r.name,
      memberNumber: r.memberNumber,
      pass: r.passStatus === "active" ? (valid(r.id) && !r.archivedAt ? "active" : "membership") : r.passStatus === "deactivated" ? "deactivated" : "none",
    })),
  };
}
