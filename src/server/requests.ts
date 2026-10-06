import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import { amsterdamToday, formatDateNl, parseDateInput } from "@/lib/membership";
import { rateLimit } from "@/lib/ratelimit";
import { isStaff } from "@/lib/permissions";
import { isValidEmail, listMembersForAccount, normalizeEmail } from "./accounts";
import { flushNotices, queueNotice } from "./notify";
import { DomainError } from "./passes";

const { changeRequest, member, membership, user } = schema;

/**
 * Wijzigingsverzoeken van leden. Een lid (via het expliciet gekoppelde account) vraagt een wijziging aan; er verandert NIETS
 * voordat de ledenadministratie het goedkeurt. Typen: `details` (naam en/of contact-e-mailadres) en `cancellation` (opzegging per einddatum).
 * Het contact-e-mailadres van het lid is niet het inlogadres van het account; dat wijzigt nooit via een verzoek.
 */
export const REQUEST_TYPES = ["details", "cancellation"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const REQUEST_LABEL: Record<RequestType, string> = { details: "Gegevens wijzigen", cancellation: "Lidmaatschap opzeggen" };
export const REQUEST_STATUS_LABEL: Record<string, string> = { pending: "In behandeling", approved: "Goedgekeurd", rejected: "Afgewezen", withdrawn: "Ingetrokken" };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function createChangeRequest(userId: string, memberId: string, type: string, input: Record<string, unknown>) {
  if (!(REQUEST_TYPES as readonly string[]).includes(type)) throw new DomainError("invalid", "Onbekend type verzoek.");
  // Alleen voor expliciet gekoppelde, niet-gearchiveerde leden van dit account (IDOR-veilig).
  const linked = (await listMembersForAccount(userId)).find((m) => m.memberId === memberId);
  if (!linked) throw new DomainError("not_found", "Lid niet gevonden.");
  if (!(await rateLimit(`request:${userId}`, 10, 86400))) throw new DomainError("rate_limited", "Je hebt vandaag al veel verzoeken gedaan. Probeer het morgen opnieuw.");

  const [m] = await db.select().from(member).where(eq(member.id, memberId));
  const note = text(input.note, 300);
  let payload: Record<string, unknown>;
  if (type === "details") {
    const fullName = text(input.fullName, 120);
    const email = text(input.email, 254);
    const changes: Record<string, string> = {};
    if (fullName && fullName !== m.fullName) changes.fullName = fullName;
    if (email) {
      if (!isValidEmail(email)) throw new DomainError("invalid", "Ongeldig e-mailadres.");
      if (normalizeEmail(email) !== (m.email ?? "")) changes.email = normalizeEmail(email);
    }
    if (!Object.keys(changes).length) throw new DomainError("no_change", "Er is niets gewijzigd ten opzichte van de huidige gegevens.");
    payload = { ...changes, ...(note ? { note } : {}) };
  } else {
    const endDate = parseDateInput(text(input.endDate, 16));
    if (!endDate) throw new DomainError("invalid", "Vul een geldige einddatum in.");
    const today = amsterdamToday();
    const max = new Date(`${today}T12:00:00Z`);
    max.setUTCFullYear(max.getUTCFullYear() + 1);
    if (endDate < today) throw new DomainError("invalid", "De einddatum mag niet in het verleden liggen.");
    if (endDate > max.toISOString().slice(0, 10)) throw new DomainError("invalid", "De einddatum mag hooguit een jaar vooruit liggen.");
    if (linked.membership === "ended" || linked.membership === "expired" || linked.membership === "none") throw new DomainError("no_membership", "Er loopt geen lidmaatschap meer om op te zeggen.");
    payload = { endDate, ...(note ? { note } : {}) };
  }
  try {
    const [r] = await db.insert(changeRequest).values({ memberId, requestedBy: userId, type, payload }).returning({ id: changeRequest.id });
    await audit({ actor: userId, action: "request.create", targetType: "member", targetId: memberId, metadata: { requestId: r.id, type } });
    return r.id;
  } catch (e) {
    if (isUniqueViolation(e, "change_request_one_pending")) throw new DomainError("exists", "Er staat al een verzoek van dit type in behandeling voor dit lid.");
    throw e;
  }
}

export async function withdrawChangeRequest(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError("not_found", "Verzoek niet gevonden.");
  const ids = (await listMembersForAccount(userId)).map((m) => m.memberId);
  if (!ids.length) throw new DomainError("not_found", "Verzoek niet gevonden.");
  const r = await db
    .update(changeRequest)
    .set({ status: "withdrawn", decidedAt: new Date(), payload: {} })
    .where(and(eq(changeRequest.id, id), eq(changeRequest.status, "pending"), inArray(changeRequest.memberId, ids)))
    .returning({ id: changeRequest.id });
  if (!r.length) throw new DomainError("not_found", "Dit verzoek kan niet meer worden ingetrokken.");
  await audit({ actor: userId, action: "request.withdraw", targetType: "change_request", targetId: id });
}

/** Verzoeken voor de leden van dit account (alleen eigen, expliciet gekoppelde leden). */
export async function listRequestsForAccount(userId: string) {
  const members = await listMembersForAccount(userId);
  if (!members.length) return [];
  const rows = await db
    .select({ id: changeRequest.id, memberId: changeRequest.memberId, type: changeRequest.type, status: changeRequest.status, payload: changeRequest.payload, createdAt: changeRequest.createdAt, decidedAt: changeRequest.decidedAt, decisionNote: changeRequest.decisionNote })
    .from(changeRequest)
    .where(inArray(changeRequest.memberId, members.map((m) => m.memberId)))
    .orderBy(desc(changeRequest.createdAt))
    .limit(30);
  return rows.map((r) => ({ ...r, memberName: members.find((m) => m.memberId === r.memberId)?.fullName ?? "" }));
}

/* ------------------------------ ledenadministratie ------------------------------ */

export async function pendingRequestCount() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(changeRequest).where(eq(changeRequest.status, "pending"));
  return n;
}

export async function listChangeRequests(opts: { pending: boolean }) {
  return db
    .select({
      id: changeRequest.id, memberId: changeRequest.memberId, type: changeRequest.type, status: changeRequest.status, payload: changeRequest.payload, createdAt: changeRequest.createdAt,
      decidedAt: changeRequest.decidedAt, decisionNote: changeRequest.decisionNote, memberName: member.fullName, memberNumber: member.memberNumber, memberEmail: member.email, requesterEmail: user.email,
    })
    .from(changeRequest)
    .innerJoin(member, eq(member.id, changeRequest.memberId))
    .leftJoin(user, eq(user.id, changeRequest.requestedBy))
    .where(opts.pending ? eq(changeRequest.status, "pending") : sql`${changeRequest.status} <> 'pending'`)
    .orderBy(opts.pending ? changeRequest.createdAt : desc(changeRequest.decidedAt))
    .limit(opts.pending ? 200 : 50);
}

/**
 * Goedkeuren of afwijzen. Atomisch: de wijziging wordt in dezelfde transactie toegepast en alles wordt geaudit.
 * Afwijzen vereist een reden (die het lid te zien krijgt). Het lid krijgt een e-mailmelding met de uitkomst.
 */
export async function decideChangeRequest(actor: string, id: string, approve: boolean, noteRaw: string) {
  const note = noteRaw.trim().slice(0, 300);
  if (!approve && note.length < 3) throw new DomainError("reason_required", "Een reden is verplicht bij afwijzen (minimaal 3 tekens); het lid ziet deze.");
  let requester: string | null = null;
  let kind: RequestType = "details";
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(changeRequest).where(eq(changeRequest.id, id)).for("update");
    if (!r) throw new DomainError("not_found", "Verzoek niet gevonden.");
    if (r.status !== "pending") throw new DomainError("not_pending", "Dit verzoek is al afgehandeld.");
    requester = r.requestedBy;
    kind = r.type as RequestType;
    const p = r.payload as { fullName?: string; email?: string; endDate?: string };
    if (approve) {
      const [m] = await tx.select().from(member).where(eq(member.id, r.memberId)).for("update");
      if (!m || m.deletedAt || m.archivedAt) throw new DomainError("member_gone", "Het lid bestaat niet meer of is gearchiveerd; wijs het verzoek af.");
      if (r.type === "details") {
        if (p.email) {
          const [u] = await tx.select({ role: user.role }).from(user).where(eq(user.email, p.email));
          if (u && isStaff(u.role)) throw new DomainError("staff_email", "Dit e-mailadres hoort bij een staf-account en kan niet voor een lid worden gebruikt; wijs het verzoek af.");
        }
        await tx.update(member).set({ ...(p.fullName ? { fullName: p.fullName } : {}), ...(p.email ? { email: p.email } : {}), updatedAt: new Date() }).where(eq(member.id, m.id));
        await audit({ actor, action: "member.update", targetType: "member", targetId: m.id, metadata: { via: "request", requestId: id, fields: Object.keys(p).filter((k) => k !== "note") } }, tx);
      } else {
        const [open] = await tx.select().from(membership).where(and(eq(membership.memberId, m.id), sql`${membership.status} in ('active','suspended')`)).for("update");
        if (!open) throw new DomainError("no_membership", "Er loopt geen lidmaatschap meer; wijs het verzoek af.");
        const end = p.endDate!;
        if (open.startDate && end < open.startDate) throw new DomainError("invalid_range", "De gevraagde einddatum ligt vóór de begindatum; wijs het verzoek af.");
        const ended = end <= amsterdamToday();
        await tx.update(membership).set({ endDate: end, ...(ended ? { status: "ended" } : {}), statusNote: "Opzegging op verzoek van het lid", updatedAt: new Date() }).where(eq(membership.id, open.id));
        await audit({ actor, action: ended ? "membership.end" : "membership.update", targetType: "member", targetId: m.id, metadata: { membershipId: open.id, endDate: end, via: "request", requestId: id } }, tx);
      }
    }
    await tx.update(changeRequest).set({ status: approve ? "approved" : "rejected", decidedAt: new Date(), decidedBy: actor, decisionNote: note || null, ...(approve ? {} : {}) }).where(eq(changeRequest.id, id));
    await audit({ actor, action: approve ? "request.approve" : "request.reject", targetType: "change_request", targetId: id, metadata: { type: r.type } }, tx);
    if (requester) {
      const title = approve ? `Je verzoek is goedgekeurd: ${REQUEST_LABEL[kind]}` : `Je verzoek is afgewezen: ${REQUEST_LABEL[kind]}`;
      const lines = approve
        ? [kind === "cancellation" ? `Je opzegging is verwerkt. Het lidmaatschap eindigt op ${formatDateNl(p.endDate ?? null)}.` : "De gevraagde wijziging van je gegevens is doorgevoerd.", ...(note ? [`Toelichting: ${note}`] : [])]
        : ["Je verzoek is niet doorgevoerd.", `Reden: ${note}`];
      await queueNotice(requester, `req:${id}`, { title, lines, cta: { label: "Naar je ledenpas", path: "/ledenpas/verzoeken" } }, tx);
    }
  });
  await flushNotices();
}
