import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { amsterdamToday, effectiveMembership, parseDateInput, validateRange, type EffectiveMembership, type MembershipRow } from "@/lib/membership";
import { DomainError } from "./passes";

const { membership, member, pass, accountMemberAccess } = schema;

const note = (v: string | undefined | null, min = 0) => {
  const t = (v ?? "").trim();
  if (t.length < min) throw new DomainError("reason_required", `Een reden is verplicht (minimaal ${min} tekens)`);
  return t.slice(0, 300) || null;
};

/** Datumvelden uit formulier/import: leeg = geen datum; ongeldig = duidelijke fout. */
export function cleanDates(startRaw?: string | null, endRaw?: string | null) {
  const parse = (raw: string | null | undefined, label: string) => {
    if (!raw || !raw.trim()) return null;
    const d = parseDateInput(raw);
    if (!d) throw new DomainError("invalid_date", `${label} is geen geldige datum (gebruik JJJJ-MM-DD of DD-MM-JJJJ).`);
    return d;
  };
  const startDate = parse(startRaw, "De begindatum");
  const endDate = parse(endRaw, "De einddatum");
  const bad = validateRange(startDate, endDate);
  if (bad) throw new DomainError("invalid_range", bad);
  return { startDate, endDate };
}

/** Alle lidmaatschapsregels per lid, voor geldigheid en weergave. */
export async function membershipsFor(memberIds: string[], tx: Pick<typeof db, "select"> = db) {
  const map = new Map<string, (MembershipRow & { id: string; statusNote: string | null })[]>();
  if (!memberIds.length) return map;
  const rows = await tx
    .select({ id: membership.id, memberId: membership.memberId, status: membership.status, startDate: membership.startDate, endDate: membership.endDate, statusNote: membership.statusNote })
    .from(membership)
    .where(inArray(membership.memberId, memberIds));
  for (const r of rows) map.set(r.memberId, [...(map.get(r.memberId) ?? []), r]);
  return map;
}

/** Effectieve lidmaatschapsstatus van één lid op dit moment. */
export async function currentMembership(memberId: string, today = amsterdamToday()): Promise<EffectiveMembership> {
  return effectiveMembership((await membershipsFor([memberId])).get(memberId) ?? [], today);
}

export async function membershipHistory(memberId: string) {
  return db.select().from(membership).where(eq(membership.memberId, memberId)).orderBy(desc(membership.createdAt));
}

/** Maakt een lopend lidmaatschap aan (bij nieuw lid of na een beëindigd lidmaatschap). */
export async function createMembershipTx(tx: Tx, actor: string | null, memberId: string, input: { status?: "active" | "suspended"; startDate?: string | null; endDate?: string | null; note?: string | null }) {
  const status = input.status ?? "active";
  const [row] = await tx
    .insert(membership)
    .values({ memberId, status, startDate: input.startDate ?? null, endDate: input.endDate ?? null, statusNote: input.note ?? null, createdBy: actor })
    .returning();
  await audit({ actor, action: "membership.create", targetType: "member", targetId: memberId, metadata: { membershipId: row.id, status, startDate: row.startDate, endDate: row.endDate } }, tx);
  return row;
}

export type MembershipAction = "activate" | "suspend" | "end" | "update";

/**
 * Wijzigt het lopende lidmaatschap van een lid. Dit raakt NOOIT het lidrecord, de accounts of de pasgeschiedenis:
 * een beëindigd lidmaatschap blijft als historische regel bestaan en passen blijven bewaard (maar zijn dan niet geldig).
 */
export async function changeMembership(
  actor: string,
  memberId: string,
  action: MembershipAction,
  input: { startDate?: string | null; endDate?: string | null; reason?: string | null },
) {
  const dates = cleanDates(input.startDate, input.endDate);
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(member).where(eq(member.id, memberId)).for("update");
    if (!m || m.deletedAt) throw new DomainError("not_found", "Lid niet gevonden");
    const [open] = await tx.select().from(membership).where(and(eq(membership.memberId, memberId), sql`${membership.status} in ('active','suspended')`)).for("update");

    if (action === "activate") {
      if (!open) {
        await createMembershipTx(tx, actor, memberId, { status: "active", ...dates, note: note(input.reason) });
        return;
      }
      if (open.status === "active" && !input.startDate && !input.endDate) throw new DomainError("invalid_transition", "Het lidmaatschap is al actief.");
      await tx.update(membership).set({ status: "active", statusNote: note(input.reason), updatedAt: new Date(), ...(input.startDate || input.endDate ? dates : {}) }).where(eq(membership.id, open.id));
      await audit({ actor, action: "membership.activate", targetType: "member", targetId: memberId, metadata: { membershipId: open.id, from: open.status, reason: note(input.reason) } }, tx);
      return;
    }
    if (!open) throw new DomainError("no_membership", "Dit lid heeft geen lopend lidmaatschap. Maak eerst een lidmaatschap aan (activeren).");

    if (action === "suspend") {
      if (open.status === "suspended") throw new DomainError("invalid_transition", "Het lidmaatschap is al geschorst.");
      const reason = note(input.reason, 3);
      await tx.update(membership).set({ status: "suspended", statusNote: reason, updatedAt: new Date() }).where(eq(membership.id, open.id));
      await audit({ actor, action: "membership.suspend", targetType: "member", targetId: memberId, metadata: { membershipId: open.id, reason } }, tx);
      return;
    }
    if (action === "end") {
      const reason = note(input.reason, 3);
      const endDate = dates.endDate ?? open.endDate ?? amsterdamToday();
      const bad = validateRange(open.startDate, endDate);
      if (bad) throw new DomainError("invalid_range", bad);
      await tx.update(membership).set({ status: "ended", endDate, statusNote: reason, updatedAt: new Date() }).where(eq(membership.id, open.id));
      await audit({ actor, action: "membership.end", targetType: "member", targetId: memberId, metadata: { membershipId: open.id, endDate, reason } }, tx);
      return;
    }
    // update: alleen datums/notitie
    const next = { startDate: input.startDate !== undefined ? dates.startDate : open.startDate, endDate: input.endDate !== undefined ? dates.endDate : open.endDate };
    const bad = validateRange(next.startDate, next.endDate);
    if (bad) throw new DomainError("invalid_range", bad);
    await tx.update(membership).set({ ...next, statusNote: input.reason !== undefined ? note(input.reason) : open.statusNote, updatedAt: new Date() }).where(eq(membership.id, open.id));
    await audit({ actor, action: "membership.update", targetType: "member", targetId: memberId, metadata: { membershipId: open.id, startDate: next.startDate, endDate: next.endDate } }, tx);
  });
}

/** Archiveren: omkeerbaar. Pas, lidmaatschap en koppelingen blijven ongemoeid; scans zijn wel ongeldig. */
export async function archiveMember(memberId: string, actor: string, reason: string) {
  const n = note(reason, 3);
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(member).where(eq(member.id, memberId)).for("update");
    if (!m || m.deletedAt) throw new DomainError("not_found", "Lid niet gevonden");
    if (m.archivedAt) throw new DomainError("invalid_transition", "Dit lid is al gearchiveerd.");
    await tx.update(member).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(member.id, memberId));
    await audit({ actor, action: "member.archive", targetType: "member", targetId: memberId, metadata: { reason: n } }, tx);
  });
}

export async function unarchiveMember(memberId: string, actor: string, reason: string) {
  const n = note(reason, 3);
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(member).where(eq(member.id, memberId)).for("update");
    if (!m || m.deletedAt) throw new DomainError("not_found", "Lid niet gevonden");
    if (!m.archivedAt) throw new DomainError("invalid_transition", "Dit lid is niet gearchiveerd.");
    await tx.update(member).set({ archivedAt: null, updatedAt: new Date() }).where(eq(member.id, memberId));
    await audit({ actor, action: "member.unarchive", targetType: "member", targetId: memberId, metadata: { reason: n } }, tx);
  });
}

/** Wat raakt het verwijderen van dit lid? Wordt vooraf getoond; accounts en andere leden worden nooit verwijderd. */
export async function deletionImpact(memberId: string) {
  const accounts = await db
    .select({ userId: schema.user.id, email: schema.user.email, otherMembers: sql<number>`(select count(*)::int from account_member_access a2 where a2.user_id = ${schema.user.id} and a2.revoked_at is null and a2.member_id <> ${memberId})` })
    .from(accountMemberAccess)
    .innerJoin(schema.user, eq(schema.user.id, accountMemberAccess.userId))
    .where(and(eq(accountMemberAccess.memberId, memberId), sql`${accountMemberAccess.revokedAt} is null`));
  const [{ passes }] = await db.select({ passes: sql<number>`count(*)::int` }).from(pass).where(eq(pass.memberId, memberId));
  const [{ memberships }] = await db.select({ memberships: sql<number>`count(*)::int` }).from(membership).where(eq(membership.memberId, memberId));
  return { accounts, passes, memberships };
}
